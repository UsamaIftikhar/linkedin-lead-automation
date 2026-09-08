import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  type OAuthClientInformationContext,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from '@modelcontextprotocol/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { FetchUpworkJobsQueryDto } from './dto/fetch-upwork-jobs-query.dto';

export interface UpworkMcpJob {
  applied?: boolean;
  job_id?: string;
  url?: string;
  title?: string;
  description?: string;
  published_at?: string;
  skills?: string[];
  budget_type?: string;
  budget_total_usd?: string;
  hourly_min_usd?: number;
  hourly_max_usd?: number;
  experience_level?: string;
  location?: string;
  project_length?: string;
  hours_per_week?: string;
  proposals?: string;
  interviewing?: string | number;
  invites_sent?: string | number;
  client_total_hires?: number;
  client_active_hires?: number;
  client_spent?: string;
  client_member_since?: string;
  client_company_size?: string;
  premium?: boolean;
  category_name?: string;
  category_group_name?: string;
  client_score?: number;
  client_feedback_count?: number;
  total_jobs_with_hires?: number;
  open_count?: number;
  is_contract_to_hire?: boolean;
  is_enterprise?: boolean;
}

interface PersistedOAuthState {
  authorizationUrl?: string;
  clientInformationByIssuer?: Record<string, StoredOAuthClientInformation>;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  latestIssuer?: string;
  oauthState?: string;
  tokensByIssuer?: Record<string, StoredOAuthTokens>;
}

interface McpTool {
  description?: string;
  inputSchema?: {
    properties?: Record<
      string,
      {
        default?: unknown;
        enum?: unknown[];
        properties?: Record<string, unknown>;
        type?: string;
      }
    >;
    required?: string[];
  };
  name: string;
}

type JsonObject = Record<string, unknown>;

@Injectable()
export class UpworkMcpService {
  private readonly logger = new Logger(UpworkMcpService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getStatus() {
    const configured = this.isConfigured();
    const state = configured ? await this.readState() : {};
    const tokens = Object.values(state.tokensByIssuer ?? {});

    return {
      configured,
      connected: tokens.some((token) => Boolean(token.access_token)),
      serverUrl: this.serverUrl(),
    };
  }

  async startAuthorization() {
    this.assertConfigured();

    try {
      const toolNames = await this.withClient(async (client) => {
        const { tools } = await client.listTools();
        return tools.map((tool) => tool.name);
      }, true);
      return { authorizationUrl: null, connected: true, toolNames };
    } catch (error) {
      if (!UnauthorizedError.isInstance(error)) {
        this.rethrowMcpError('Could not start Upwork authorization.', error);
      }

      const state = await this.readState();
      if (!state.authorizationUrl) {
        throw new ServiceUnavailableException(
          'Upwork did not provide an OAuth authorization URL.',
        );
      }
      return {
        authorizationUrl: state.authorizationUrl,
        connected: false,
        toolNames: [],
      };
    }
  }

  async completeAuthorization(params: URLSearchParams) {
    this.assertConfigured();
    const saved = await this.readState();
    const returnedState = params.get('state');

    if (!returnedState || returnedState !== saved.oauthState) {
      throw new BadRequestException('Invalid or expired Upwork OAuth state.');
    }
    if (params.get('error')) {
      throw new BadRequestException('Upwork authorization was declined.');
    }

    const provider = this.createProvider();
    const transport = new StreamableHTTPClientTransport(
      new URL(this.serverUrl()),
      { authProvider: provider },
    );

    try {
      await transport.finishAuth(params);
      const toolNames = await this.withClient(async (client) => {
        const { tools } = await client.listTools();
        return tools.map((tool) => tool.name);
      });
      await this.mutateState((state) => ({
        ...state,
        authorizationUrl: undefined,
        codeVerifier: undefined,
        oauthState: undefined,
      }));
      return { connected: true, toolNames };
    } catch (error) {
      this.rethrowMcpError('Could not complete Upwork authorization.', error);
    }
  }

  async searchJobs(
    query: FetchUpworkJobsQueryDto,
    rejectionReason: (job: UpworkMcpJob) => string | null = () => null,
  ): Promise<{
    jobs: UpworkMcpJob[];
    nextCursor: string | null;
    toolName: string;
  }> {
    this.assertConfigured();

    const trace = randomBytes(4).toString('hex');
    const started = Date.now();
    this.logger.log(`[${trace}] Fetch started; connecting to Upwork MCP`);
    return this.withClient(async (client) => {
      this.logger.log(
        `[${trace}] Connected after ${Date.now() - started}ms; listing tools`,
      );
      const toolsStarted = Date.now();
      const { tools } = await client.listTools();
      this.logger.log(
        `[${trace}] Tools listed in ${Date.now() - toolsStarted}ms`,
      );
      const tool = this.selectJobSearchTool(tools as McpTool[]);
      const accountStarted = Date.now();
      const organizationUid = this.isOfficialFindJobsTool(tool)
        ? await this.resolveOrganizationUid(client, tools as McpTool[])
        : undefined;
      this.logger.log(
        `[${trace}] Account resolution took ${Date.now() - accountStarted}ms`,
      );
      const args = this.buildSearchArguments(tool, query, organizationUid);
      const searchStarted = Date.now();
      this.logger.log(`[${trace}] Search request started (${tool.name})`);
      const result = await client.callTool({
        name: tool.name,
        arguments: args,
      });
      this.logger.log(
        `[${trace}] Search response received in ${Date.now() - searchStarted}ms`,
      );

      if (result.isError) {
        throw new BadGatewayException(
          `Upwork MCP tool ${tool.name} returned an error: ${this.resultText(result.content)}`,
        );
      }

      const payloads = this.extractResultPayloads(result);

      const rawJobs = payloads.flatMap((payload) =>
        this.findJobObjects(payload),
      );

      if (!payloads.length) {
        throw new BadGatewayException(
          `Upwork MCP tool ${tool.name} returned no machine-readable job data.`,
        );
      }

      const baseJobs = this.dedupeJobs(
        rawJobs
          .map((job) => this.normalizeMcpJob(job))
          .filter((job): job is UpworkMcpJob => job !== null),
      );
      this.logger.log(
        `[${trace}] Search returned ${baseJobs.length} unique jobs`,
      );
      const jobs =
        this.isOfficialFindJobsTool(tool) && organizationUid
          ? await this.fetchAllJobDetails(
              client,
              tool,
              organizationUid,
              baseJobs,
              trace,
              rejectionReason,
            )
          : baseJobs;

      return {
        jobs,
        nextCursor: this.findCursor(payloads),
        toolName: tool.name,
      };
    }).finally(() => {
      this.logger.log(
        `[${trace}] MCP fetch ended after ${Date.now() - started}ms (including connection cleanup)`,
      );
    });
  }

  private async fetchAllJobDetails(
    client: Client,
    tool: McpTool,
    organizationUid: string,
    jobs: UpworkMcpJob[],
    trace = 'details',
    rejectionReason: (job: UpworkMcpJob) => string | null = () => null,
  ): Promise<UpworkMcpJob[]> {
    if (!jobs.length) return [];
    const lookupStarted = Date.now();
    const sourceJobIds = jobs
      .map((job) => job.job_id)
      .filter((id): id is string => Boolean(id));
    const storedJobs = await this.prisma.upworkJob.findMany({
      select: { sourceJobId: true },
      where: { sourceJobId: { in: sourceJobIds } },
    });
    const storedIds = new Set(storedJobs.map((job) => job.sourceJobId));
    const rejected = new Map(jobs.map((job) => [job, rejectionReason(job)]));
    const newCount = jobs.filter(
      (job) => job.job_id && !storedIds.has(job.job_id) && !rejected.get(job),
    ).length;
    this.logger.log(
      `[${trace}] Duplicate lookup: ${Date.now() - lookupStarted}ms; ${storedIds.size} stored, ${newCount} need details; planned pacing wait=${Math.max(0, newCount - 1) * 5000}ms`,
    );
    const enriched: UpworkMcpJob[] = [];
    let detailCalls = 0;
    for (const job of jobs) {
      if (!job.job_id || storedIds.has(job.job_id)) {
        this.logger.log(
          `[${trace}] GET skipped job=${job.job_id ?? 'missing-id'} reason=${job.job_id ? 'already stored' : 'missing ID'}`,
        );
        enriched.push(job);
        continue;
      }
      const reason = rejected.get(job);
      if (reason) {
        this.logger.log(
          `[${trace}] GET skipped job=${job.job_id} reason=${reason}`,
        );
        enriched.push(job);
        continue;
      }
      if (detailCalls > 0) {
        this.logger.log(
          `[${trace}] Pacing wait 5000ms before job=${job.job_id}`,
        );
        await this.delay(5_000);
      }
      enriched.push(
        await this.fetchJobDetails(client, tool, organizationUid, job, trace),
      );
      detailCalls += 1;
    }
    return enriched;
  }

  private async fetchJobDetails(
    client: Client,
    tool: McpTool,
    organizationUid: string,
    job: UpworkMcpJob,
    trace = 'details',
  ): Promise<UpworkMcpJob> {
    if (!job.job_id) return job;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const requestStarted = Date.now();
        this.logger.log(
          `[${trace}] GET started job=${job.job_id} attempt=${attempt + 1}/3`,
        );
        const result = await client.callTool({
          name: tool.name,
          arguments: {
            action: 'get',
            org_uid: organizationUid,
            params: { job_id: job.job_id },
          },
        });
        this.logger.log(
          `[${trace}] GET finished job=${job.job_id} duration=${Date.now() - requestStarted}ms toolError=${Boolean(result.isError)}`,
        );
        if (!result.isError) {
          const payloads = this.extractResultPayloads(result);
          this.logger.log(
            `[${trace}] Detail payload job=${job.job_id} postingFound=${Boolean(this.findNestedObject(payloads, 'marketplaceJobPosting'))}`,
          );
          return this.mergeJobDetails(job, payloads);
        }

        const errorText = this.resultText(result.content);
        const retryAfterMs = this.rateLimitRetryAfterMs(errorText);
        if (retryAfterMs !== null && attempt < 2) {
          this.logger.warn(
            `[${trace}] Rate limited job=${job.job_id}; retry wait=${retryAfterMs}ms`,
          );
          await this.delay(retryAfterMs);
          continue;
        }
        this.logger.warn(
          `Could not enrich Upwork job ${job.job_id}: ${errorText}`,
        );
        return job;
      }
    } catch (error) {
      this.logger.warn(
        `Could not enrich Upwork job ${job.job_id}; using search data instead. ${error instanceof Error ? error.message : ''}`,
      );
    }
    return job;
  }

  private async withClient<T>(
    work: (client: Client) => Promise<T>,
    preserveUnauthorized = false,
  ): Promise<T> {
    const provider = this.createProvider();
    const transport = new StreamableHTTPClientTransport(
      new URL(this.serverUrl()),
      { authProvider: provider },
    );
    const client = new Client({
      name: 'linkedin-lead-generation',
      version: '1.0.0',
    });

    try {
      await client.connect(transport);
      return await work(client);
    } catch (error) {
      if (UnauthorizedError.isInstance(error)) {
        if (preserveUnauthorized) throw error;
        throw new PreconditionFailedException(
          'Upwork is not connected. Open the dashboard and select Connect Upwork first.',
        );
      }
      this.rethrowMcpError('Upwork MCP request failed.', error);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private createProvider(): OAuthClientProvider {
    const redirectUrl = this.redirectUri();
    const redirectHost = new URL(redirectUrl).hostname;
    const applicationType = ['localhost', '127.0.0.1', '::1'].includes(
      redirectHost,
    )
      ? 'native'
      : 'web';

    return {
      redirectUrl,
      clientMetadata: {
        application_type: applicationType,
        client_name: 'Job Lead Generation Dashboard',
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: [redirectUrl],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      } satisfies OAuthClientMetadata,
      state: async () => {
        const value = randomBytes(32).toString('base64url');
        await this.mutateState((state) => ({ ...state, oauthState: value }));
        return value;
      },
      clientInformation: async (ctx?: OAuthClientInformationContext) => {
        const state = await this.readState();
        const issuer = ctx?.issuer ?? state.latestIssuer;
        return issuer ? state.clientInformationByIssuer?.[issuer] : undefined;
      },
      saveClientInformation: async (info, ctx) => {
        const issuer = ctx?.issuer ?? info.issuer;
        if (!issuer) {
          throw new Error(
            'OAuth issuer missing while saving client registration.',
          );
        }
        await this.mutateState((state) => ({
          ...state,
          clientInformationByIssuer: {
            ...state.clientInformationByIssuer,
            [issuer]: info,
          },
          latestIssuer: issuer,
        }));
      },
      tokens: async (ctx?: OAuthClientInformationContext) => {
        const state = await this.readState();
        const issuer = ctx?.issuer ?? state.latestIssuer;
        return issuer ? state.tokensByIssuer?.[issuer] : undefined;
      },
      saveTokens: async (tokens, ctx) => {
        const issuer = ctx?.issuer ?? tokens.issuer;
        if (!issuer) {
          throw new Error('OAuth issuer missing while saving tokens.');
        }
        await this.mutateState((state) => ({
          ...state,
          latestIssuer: issuer,
          tokensByIssuer: { ...state.tokensByIssuer, [issuer]: tokens },
        }));
      },
      redirectToAuthorization: async (url) => {
        await this.mutateState((state) => ({
          ...state,
          authorizationUrl: url.toString(),
        }));
      },
      saveCodeVerifier: async (codeVerifier) => {
        await this.mutateState((state) => ({ ...state, codeVerifier }));
      },
      codeVerifier: async () => {
        const state = await this.readState();
        if (!state.codeVerifier) {
          throw new Error('Upwork OAuth PKCE verifier is missing or expired.');
        }
        return state.codeVerifier;
      },
      saveDiscoveryState: async (discoveryState) => {
        await this.mutateState((state) => ({ ...state, discoveryState }));
      },
      discoveryState: async () => (await this.readState()).discoveryState,
      invalidateCredentials: async (scope) => {
        await this.mutateState((state) => {
          if (scope === 'all') return {};
          if (scope === 'client')
            return { ...state, clientInformationByIssuer: {} };
          if (scope === 'tokens') return { ...state, tokensByIssuer: {} };
          if (scope === 'verifier')
            return { ...state, codeVerifier: undefined };
          return { ...state, discoveryState: undefined };
        });
      },
    };
  }

  private selectJobSearchTool(tools: McpTool[]): McpTool {
    const override = this.config
      .get<string>('UPWORK_MCP_JOB_SEARCH_TOOL')
      ?.trim();
    if (override) {
      const selected = tools.find((tool) => tool.name === override);
      if (selected) return selected;
      throw new ServiceUnavailableException(
        `UPWORK_MCP_JOB_SEARCH_TOOL=${override} was not found. Available tools: ${tools.map((tool) => tool.name).join(', ')}`,
      );
    }

    const ranked = tools
      .map((tool) => {
        const name = tool.name.toLowerCase();
        const description = (tool.description ?? '').toLowerCase();
        let score = 0;
        if (name === 'search_jobs' || name === 'find_jobs') score += 100;
        if (name.includes('search') || name.includes('find')) score += 20;
        if (name.includes('job')) score += 30;
        if (description.includes('search') || description.includes('find'))
          score += 5;
        if (description.includes('job')) score += 10;
        if (
          description.includes('freelancer') ||
          description.includes('find work')
        )
          score += 5;
        if (description.includes('post a job') || name.includes('proposal'))
          score -= 40;
        return { score, tool };
      })
      .sort((a, b) => b.score - a.score);

    if (!ranked[0] || ranked[0].score < 35) {
      throw new ServiceUnavailableException(
        `No Upwork MCP job-search tool was found. Available tools: ${tools.map((tool) => tool.name).join(', ')}`,
      );
    }
    return ranked[0].tool;
  }

  private buildSearchArguments(
    tool: McpTool,
    query: FetchUpworkJobsQueryDto,
    organizationUid?: string,
  ): JsonObject {
    if (this.isOfficialFindJobsTool(tool)) {
      if (!organizationUid) {
        throw new ServiceUnavailableException(
          'Upwork MCP did not return a freelancer organization for this connection.',
        );
      }
      return {
        action: 'smart_search',
        org_uid: organizationUid,
        params: {
          ...this.buildOfficialSearchParams(query),
          mode: 'most_recent',
        },
      };
    }

    const properties = tool.inputSchema?.properties ?? {};
    const args: JsonObject = {};
    const skills = (query.skills ?? '')
      .split('|')
      .map((v) => v.trim())
      .filter(Boolean);
    const searchText = [query.q?.replaceAll('|', ' OR '), skills.join(', ')]
      .filter(Boolean)
      .join('; skills: ');

    for (const [name, schema] of Object.entries(properties)) {
      const key = name
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .replaceAll('-', '_');
      if (
        [
          'q',
          'query',
          'input',
          'prompt',
          'search',
          'search_query',
          'search_term',
          'text',
          'keywords',
          'keyword',
        ].includes(key)
      ) {
        args[name] = schema.type === 'array' ? skills : searchText;
      } else if (key === 'skills' || key === 'skill') {
        args[name] = schema.type === 'string' ? skills.join(', ') : skills;
      } else if (
        [
          'limit',
          'count',
          'first',
          'page_size',
          'pagesize',
          'per_page',
        ].includes(key)
      ) {
        args[name] = query.limit ?? 20;
      } else if (
        ['cursor', 'next_cursor', 'after'].includes(key) &&
        query.next_cursor
      ) {
        args[name] = query.next_cursor;
      } else if (
        [
          'hourly_min',
          'hourly_min_usd',
          'min_hourly_rate',
          'min_rate',
        ].includes(key)
      ) {
        args[name] = query.hourly_min_usd;
      } else if (
        [
          'hourly_max',
          'hourly_max_usd',
          'max_hourly_rate',
          'max_rate',
        ].includes(key)
      ) {
        args[name] = query.hourly_max_usd;
      } else if (
        [
          'fixed_min',
          'fixed_min_usd',
          'min_fixed_budget',
          'min_budget',
        ].includes(key)
      ) {
        args[name] = query.fixed_min_usd;
      } else if (
        [
          'fixed_max',
          'fixed_max_usd',
          'max_fixed_budget',
          'max_budget',
        ].includes(key)
      ) {
        args[name] = query.fixed_max_usd;
      }
    }

    const missing = (tool.inputSchema?.required ?? []).filter(
      (name) =>
        args[name] === undefined && properties[name]?.default === undefined,
    );
    if (missing.length) {
      throw new ServiceUnavailableException(
        `Upwork MCP tool ${tool.name} requires unsupported input(s): ${missing.join(', ')}. Set UPWORK_MCP_JOB_SEARCH_TOOL to another search tool if one is available.`,
      );
    }
    return args;
  }

  private isOfficialFindJobsTool(tool: McpTool): boolean {
    const properties = tool.inputSchema?.properties ?? {};
    return Boolean(
      properties.action && properties.org_uid && properties.params,
    );
  }

  /**
   * smart_search is a personalized recommendation feed — it does not accept
   * query/skills/rate/budget params (confirmed via the API's own skills_note;
   * live testing showed passing skills collapses ~20-24 profile-matched
   * results down to ~2). Skill/keyword and budget targeting are applied by
   * our own post-fetch filter (see rejectionReason) instead.
   */
  private buildOfficialSearchParams(
    query: FetchUpworkJobsQueryDto,
  ): JsonObject {
    const params: JsonObject = {};
    if (query.next_cursor) params.cursor = query.next_cursor;
    params.days_posted = query.days_posted ?? 1;
    params.verified_payment_only = true;
    params.limit = Math.min(query.limit ?? 10, 10);

    return params;
  }

  private async resolveOrganizationUid(
    client: Client,
    tools: McpTool[],
  ): Promise<string> {
    const accountTool = tools.find(
      (tool) =>
        tool.name === 'upwork__list_accounts' ||
        tool.name.toLowerCase().endsWith('list_accounts'),
    );
    if (!accountTool) {
      throw new ServiceUnavailableException(
        'Upwork MCP requires org_uid, but no list_accounts tool is available.',
      );
    }

    const result = await client.callTool({
      name: accountTool.name,
      arguments: {},
    });
    if (result.isError) {
      throw new BadGatewayException(
        `Upwork MCP tool ${accountTool.name} returned an error: ${this.resultText(result.content)}`,
      );
    }

    const accounts = this.extractResultPayloads(result).flatMap((payload) =>
      this.findAccountObjects(payload),
    );
    const preferred =
      accounts.find((account) => {
        const role = this.stringAt(account, ['role', 'role_label']);
        return role ? /talent|freelancer/i.test(role) : false;
      }) ?? accounts[0];
    const organizationUid = preferred
      ? this.stringAt(preferred, ['org_uid', 'orgUid'])
      : undefined;

    if (!organizationUid) {
      throw new ServiceUnavailableException(
        'Upwork MCP did not return an organization ID. Make sure the connected Upwork account has a Freelancer profile.',
      );
    }
    return organizationUid;
  }

  private findAccountObjects(value: unknown, depth = 0): JsonObject[] {
    if (depth > 6 || value === null || value === undefined) return [];
    if (typeof value === 'string') {
      const parsed = this.tryParseJson(value);
      return parsed === undefined
        ? []
        : this.findAccountObjects(parsed, depth + 1);
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.findAccountObjects(item, depth + 1));
    }
    if (!this.isObject(value)) return [];
    if (typeof value.org_uid === 'string' || typeof value.orgUid === 'string') {
      return [value];
    }
    return Object.values(value).flatMap((item) =>
      this.findAccountObjects(item, depth + 1),
    );
  }

  private findJobObjects(value: unknown, depth = 0): JsonObject[] {
    if (depth > 8 || value === null || value === undefined) return [];
    if (typeof value === 'string') {
      const parsed = this.tryParseJson(value);
      return parsed === undefined ? [] : this.findJobObjects(parsed, depth + 1);
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.findJobObjects(item, depth + 1));
    }
    if (!this.isObject(value)) return [];

    const title = this.stringAt(value, ['title', 'jobTitle', 'job_title']);
    const id = this.stringAt(value, [
      'id',
      'jobId',
      'job_id',
      'ciphertext',
      'uid',
    ]);
    if (title && id) return [value];

    return Object.values(value).flatMap((item) =>
      this.findJobObjects(item, depth + 1),
    );
  }

  private normalizeMcpJob(raw: JsonObject): UpworkMcpJob | null {
    const sourceJobId = this.stringAt(raw, [
      'job_id',
      'jobId',
      'id',
      'uid',
      'ciphertext',
    ]);
    const title = this.stringAt(raw, ['title', 'job_title', 'jobTitle']);
    if (!sourceJobId || !title) return null;

    const client = this.objectAt(raw, ['client', 'buyer', 'clientInfo']);
    const budget = this.objectAt(raw, ['budget', 'amount']);
    const hourly = this.objectAt(raw, [
      'hourlyBudget',
      'hourly_budget',
      'hourlyRate',
    ]);
    const ciphertext = this.stringAt(raw, ['ciphertext']);
    const rawType = this.stringAt(raw, [
      'budget_type',
      'budgetType',
      'job_type',
      'type',
      'jobType',
    ]);
    const type = rawType?.toLowerCase().includes('hour')
      ? 'Hourly'
      : rawType?.toLowerCase().includes('fixed')
        ? 'Fixed'
        : hourly
          ? 'Hourly'
          : budget
            ? 'Fixed'
            : undefined;
    const budgetText = this.stringAt(raw, ['budget']);
    const hourlyRange =
      type === 'Hourly' && budgetText
        ? this.parseHourlyBudget(budgetText)
        : null;
    const proposalCount = this.stringOrNumberAt(raw, [
      'proposals',
      'proposalCount',
      'proposal_count',
      'proposalsTier',
    ]);
    const description = this.stringAt(raw, [
      'description',
      'description_snippet',
      'descriptionSnippet',
      'jobDescription',
      'job_description',
      'summary',
    ]);

    const url =
      this.stringAt(raw, [
        'url',
        'jobUrl',
        'job_url',
        'applyUrl',
        'apply_url',
      ]) ??
      (ciphertext
        ? `https://www.upwork.com/jobs/${ciphertext}`
        : `https://www.upwork.com/jobs/${sourceJobId}`);
    const skillValue = raw.skills ?? raw.attrs ?? raw.qualifications;
    const skills = Array.isArray(skillValue)
      ? skillValue
          .map((item) =>
            typeof item === 'string'
              ? item
              : this.isObject(item)
                ? this.stringAt(item, ['name', 'label', 'prefLabel', 'skill'])
                : undefined,
          )
          .filter((item): item is string => Boolean(item))
      : undefined;

    return {
      applied: this.booleanAt(raw, ['applied', 'hasApplied']),
      job_id: sourceJobId,
      url,
      title,
      description: description ? this.cleanMcpDescription(description) : '',
      published_at: this.stringAt(raw, [
        'published_at',
        'publishedAt',
        'published_date',
        'publishedOn',
        'publishedDateTime',
        'created_date',
        'createdAt',
        'created_at',
      ]),
      skills,
      budget_type: type,
      budget_total_usd: this.moneyString(raw, budget, [
        'budget_total_usd',
        'budgetTotalUsd',
        'fixedBudget',
        'fixed_budget',
        'budget',
        'amount',
      ]),
      hourly_min_usd:
        this.numberAt(hourly ?? raw, [
          'min',
          'minimum',
          'hourly_min_usd',
          'hourlyMinUsd',
          'minRate',
        ]) ?? hourlyRange?.min,
      hourly_max_usd:
        this.numberAt(hourly ?? raw, [
          'max',
          'maximum',
          'hourly_max_usd',
          'hourlyMaxUsd',
          'maxRate',
        ]) ?? hourlyRange?.max,
      experience_level: this.stringAt(raw, [
        'experience_level',
        'experienceLevel',
        'tier',
      ]),
      location: this.stringAt(client ?? raw, [
        'country',
        'location',
        'clientLocation',
        'client_location',
      ]),
      project_length: this.stringAt(raw, [
        'project_length',
        'projectLength',
        'duration',
      ]),
      hours_per_week: this.stringAt(raw, [
        'hours_per_week',
        'hoursPerWeek',
        'engagement',
      ]),
      proposals:
        proposalCount === undefined ? undefined : String(proposalCount),
      interviewing: this.stringOrNumberAt(raw, [
        'interviewing',
        'interviewCount',
        'interview_count',
      ]),
      invites_sent: this.stringOrNumberAt(raw, [
        'invites_sent',
        'invitesSent',
        'inviteCount',
      ]),
      client_total_hires: this.numberAt(client ?? raw, [
        'totalHires',
        'total_hires',
        'clientTotalHires',
      ]),
      client_active_hires: this.numberAt(client ?? raw, [
        'activeHires',
        'active_hires',
        'clientActiveHires',
      ]),
      client_spent: this.moneyString(client ?? raw, undefined, [
        'totalSpent',
        'total_spent',
        'clientSpent',
        'client_spent',
      ]),
      client_member_since: this.stringAt(client ?? raw, [
        'memberSince',
        'member_since',
        'clientMemberSince',
      ]),
      client_company_size: this.stringAt(client ?? raw, [
        'companySize',
        'company_size',
        'clientCompanySize',
      ]),
      client_score: this.numberAt(client ?? raw, [
        'score',
        'rating',
        'totalFeedback',
        'clientScore',
      ]),
      client_feedback_count: this.numberAt(client ?? raw, [
        'feedbackCount',
        'feedback_count',
        'total_reviews',
        'totalReviews',
        'clientFeedbackCount',
      ]),
      premium: this.booleanAt(raw, ['premium', 'isPremium']),
      category_name: this.stringAt(raw, [
        'category_name',
        'categoryName',
        'category',
      ]),
      category_group_name: this.stringAt(raw, [
        'category_group_name',
        'categoryGroupName',
        'categoryGroup',
      ]),
      total_jobs_with_hires: this.numberAt(client ?? raw, [
        'totalJobsWithHires',
        'total_jobs_with_hires',
      ]),
      open_count: this.numberAt(raw, ['open_count', 'openCount', 'openings']),
      is_contract_to_hire: this.booleanAt(raw, [
        'is_contract_to_hire',
        'isContractToHire',
        'contractToHire',
      ]),
      is_enterprise: this.booleanAt(raw, [
        'is_enterprise',
        'isEnterprise',
        'enterpriseJob',
      ]),
    };
  }

  private mergeJobDetails(
    job: UpworkMcpJob,
    payloads: unknown[],
  ): UpworkMcpJob {
    const posting = this.findNestedObject(payloads, 'marketplaceJobPosting');
    if (!posting) return job;

    const content = this.findNestedObject(posting, 'content');
    const activity = this.findNestedObject(posting, 'jobActivity');
    const contractTerms = this.findNestedObject(posting, 'contractTerms');
    const clientRecord = this.findNestedObject(payloads, 'client_record');
    const fullDescription = content
      ? this.stringAt(content, ['description'])
      : undefined;
    const contractType = contractTerms
      ? this.stringAt(contractTerms, ['contractType', 'contract_type'])
      : undefined;
    const fixedPrice = contractTerms
      ? this.findNestedObject(contractTerms, 'fixedPriceContract')
      : undefined;

    return {
      ...job,
      budget_type: contractType
        ? contractType.toLowerCase().includes('hour')
          ? 'Hourly'
          : contractType.toLowerCase().includes('fixed')
            ? 'Fixed'
            : job.budget_type
        : job.budget_type,
      budget_total_usd:
        fixedPrice !== undefined
          ? (this.moneyString(fixedPrice, undefined, [
              'amount',
              'value',
              'budget',
            ]) ?? job.budget_total_usd)
          : job.budget_total_usd,
      client_active_hires:
        (clientRecord
          ? this.numberAt(clientRecord, ['contracts_active', 'activeHires'])
          : undefined) ?? job.client_active_hires,
      client_feedback_count:
        (clientRecord
          ? this.numberAt(clientRecord, ['feedback_count', 'total_reviews'])
          : undefined) ?? job.client_feedback_count,
      client_score:
        (clientRecord
          ? this.numberAt(clientRecord, ['feedback_score', 'rating'])
          : undefined) ?? job.client_score,
      client_spent:
        (clientRecord
          ? this.moneyString(clientRecord, undefined, [
              'spend_total',
              'total_spent',
            ])
          : undefined) ?? job.client_spent,
      client_total_hires:
        (clientRecord
          ? this.numberAt(clientRecord, ['contracts_total', 'totalHires'])
          : undefined) ?? job.client_total_hires,
      description: fullDescription
        ? this.cleanMcpDescription(fullDescription)
        : job.description,
      experience_level:
        (contractTerms
          ? this.stringAt(contractTerms, [
              'experienceLevel',
              'experience_level',
            ])
          : undefined) ?? job.experience_level,
      interviewing:
        (activity
          ? this.numberAt(activity, [
              'totalInvitedToInterview',
              'total_invited_to_interview',
            ])
          : undefined) ?? job.interviewing,
      invites_sent:
        (activity
          ? this.numberAt(activity, ['invitesSent', 'invites_sent'])
          : undefined) ?? job.invites_sent,
      total_jobs_with_hires:
        (clientRecord
          ? this.numberAt(clientRecord, ['jobs_with_hires'])
          : undefined) ?? job.total_jobs_with_hires,
    };
  }

  private findNestedObject(
    value: unknown,
    key: string,
    depth = 0,
  ): JsonObject | undefined {
    if (depth > 8 || value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findNestedObject(item, key, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    if (!this.isObject(value)) return undefined;
    if (this.isObject(value[key])) return value[key];
    for (const item of Object.values(value)) {
      const found = this.findNestedObject(item, key, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  private findCursor(payloads: unknown[]): string | null {
    const keys = new Set(['next_cursor', 'nextCursor', 'cursor', 'endCursor']);
    const visit = (value: unknown, depth = 0): string | null => {
      if (depth > 6 || value === null || value === undefined) return null;
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = visit(item, depth + 1);
          if (found) return found;
        }
        return null;
      }
      if (!this.isObject(value)) return null;
      for (const [key, item] of Object.entries(value)) {
        if (
          keys.has(key) &&
          (typeof item === 'string' || typeof item === 'number')
        ) {
          return String(item);
        }
      }
      for (const item of Object.values(value)) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return null;
    };
    for (const payload of payloads) {
      const cursor = visit(payload);
      if (cursor) return cursor;
    }
    return null;
  }

  private dedupeJobs(jobs: UpworkMcpJob[]): UpworkMcpJob[] {
    return [...new Map(jobs.map((job) => [job.job_id, job])).values()];
  }

  private tryParseJson(text: string): unknown {
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
  }

  private extractResultPayloads(result: {
    content: unknown[];
    structuredContent?: unknown;
  }): unknown[] {
    const payloads: unknown[] = [];
    if (result.structuredContent !== undefined) {
      payloads.push(result.structuredContent);
    }
    for (const block of result.content) {
      if (!this.isObject(block)) continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        const parsed = this.tryParseJson(block.text);
        if (parsed !== undefined) payloads.push(parsed);
      } else if (block.type === 'resource' && this.isObject(block.resource)) {
        const text = block.resource.text;
        if (typeof text !== 'string') continue;
        const parsed = this.tryParseJson(text);
        if (parsed !== undefined) payloads.push(parsed);
      }
    }
    return payloads;
  }

  private resultText(content: unknown): string {
    if (!Array.isArray(content)) return 'Unknown MCP error';
    return content
      .filter(
        (block): block is { type: 'text'; text: string } =>
          this.isObject(block) &&
          block.type === 'text' &&
          typeof block.text === 'string',
      )
      .map((block) => block.text)
      .join(' ')
      .slice(0, 800);
  }

  private objectAt(object: JsonObject, keys: string[]): JsonObject | undefined {
    for (const key of keys) {
      if (this.isObject(object[key])) return object[key];
    }
    return undefined;
  }

  private stringAt(object: JsonObject, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (this.isObject(value)) {
        const nested = this.stringAt(value, [
          'name',
          'label',
          'value',
          'country',
        ]);
        if (nested) return nested;
      }
    }
    return undefined;
  }

  private numberAt(object: JsonObject, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = object[key];
      const candidate = this.isObject(value)
        ? (value.amount ?? value.value)
        : value;
      const parsed =
        typeof candidate === 'string'
          ? Number(candidate.replace(/[$,\s]/g, ''))
          : candidate;
      if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private stringOrNumberAt(
    object: JsonObject,
    keys: string[],
  ): string | number | undefined {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === 'string' || typeof value === 'number') return value;
    }
    return undefined;
  }

  private booleanAt(object: JsonObject, keys: string[]): boolean | undefined {
    for (const key of keys) {
      if (typeof object[key] === 'boolean') return object[key];
    }
    return undefined;
  }

  private moneyString(
    object: JsonObject,
    nested: JsonObject | undefined,
    keys: string[],
  ): string | undefined {
    const value =
      this.numberAt(nested ?? object, keys) ??
      (nested
        ? this.numberAt(nested, ['amount', 'value', 'total'])
        : undefined);
    return value === undefined ? undefined : String(value);
  }

  private parseHourlyBudget(
    value: string,
  ): { max: number; min: number } | null {
    const match = value.match(
      /\$?\s*([\d,.]+)\s*[-\u2013\u2014]\s*\$?\s*([\d,.]+)\s*\/\s*hr/i,
    );
    if (!match) return null;
    const min = Number(match[1].replaceAll(',', ''));
    const max = Number(match[2].replaceAll(',', ''));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { max: Math.max(min, max), min: Math.min(min, max) };
  }

  private cleanMcpDescription(value: string): string {
    return value.replace(/<\/?untrusted_participant_content>/gi, '').trim();
  }

  private rateLimitRetryAfterMs(errorText: string): number | null {
    if (!errorText.includes('SENSITIVE_RATE_LIMIT_EXCEEDED')) return null;
    const match = errorText.match(/"retry_after_seconds"\s*:\s*(\d+)/);
    const seconds = match ? Number(match[1]) : 5;
    return Math.max(1, seconds) * 1_000;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private async readState(): Promise<PersistedOAuthState> {
    const row = await this.prisma.upworkMcpAuth.findUnique({
      where: { id: 'default' },
    });
    if (!row) return {};
    try {
      return this.decrypt(row.encryptedPayload);
    } catch (error) {
      this.logger.error('Could not decrypt stored Upwork MCP credentials.');
      throw new ServiceUnavailableException(
        'Stored Upwork MCP credentials cannot be decrypted. Check UPWORK_MCP_CREDENTIALS_ENCRYPTION_KEY.',
        { cause: error },
      );
    }
  }

  private async mutateState(
    mutate: (state: PersistedOAuthState) => PersistedOAuthState,
  ): Promise<void> {
    const next = mutate(await this.readState());
    await this.prisma.upworkMcpAuth.upsert({
      create: { id: 'default', encryptedPayload: this.encrypt(next) },
      update: { encryptedPayload: this.encrypt(next) },
      where: { id: 'default' },
    });
  }

  private encrypt(value: PersistedOAuthState): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  private decrypt(payload: string): PersistedOAuthState {
    const [ivPart, tagPart, ciphertextPart] = payload.split('.');
    if (!ivPart || !tagPart || !ciphertextPart)
      throw new Error('Invalid encrypted payload.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as PersistedOAuthState;
  }

  private encryptionKey(): Buffer {
    const raw = this.config
      .get<string>('UPWORK_MCP_CREDENTIALS_ENCRYPTION_KEY')
      ?.trim();
    if (!raw) {
      throw new ServiceUnavailableException(
        'UPWORK_MCP_CREDENTIALS_ENCRYPTION_KEY is not configured.',
      );
    }
    const key = /^[a-f\d]{64}$/i.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'UPWORK_MCP_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex characters).',
      );
    }
    return key;
  }

  private serverUrl(): string {
    return (
      this.config.get<string>('UPWORK_MCP_URL')?.trim() ||
      'https://mcp.upwork.com/mcp'
    );
  }

  private redirectUri(): string {
    return this.config.get<string>('UPWORK_MCP_REDIRECT_URI')?.trim() ?? '';
  }

  private isConfigured(): boolean {
    return Boolean(
      this.redirectUri() &&
      this.config.get<string>('UPWORK_MCP_CREDENTIALS_ENCRYPTION_KEY')?.trim(),
    );
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Configure UPWORK_MCP_REDIRECT_URI and UPWORK_MCP_CREDENTIALS_ENCRYPTION_KEY before connecting Upwork.',
      );
    }
  }

  private rethrowMcpError(message: string, error: unknown): never {
    if (
      error instanceof BadGatewayException ||
      error instanceof BadRequestException ||
      error instanceof PreconditionFailedException ||
      error instanceof ServiceUnavailableException
    ) {
      throw error;
    }
    this.logger.error(
      message,
      error instanceof Error ? error.stack : undefined,
    );
    throw new BadGatewayException(
      `${message} ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
