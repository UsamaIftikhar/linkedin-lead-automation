import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FetchUpworkJobsQueryDto } from './dto/fetch-upwork-jobs-query.dto';
import type { UpworkCronFetchQueryDto } from './dto/upwork-cron-fetch-query.dto';
import { UpworkCronNotifyService } from './upwork-cron-notify.service';
import type { ScoredUpworkJobForNotify } from './scored-job-notify.types';
import type { UpworkJobScoreInput } from './upwork-job-score';
import {
  formatBudgetLine,
  formatClientLine,
  formatPostedLine,
  scoreUpworkJobRecord,
} from './upwork-job-score';
import { calculateSemanticFit, detectProposalTemplate } from './job-fit.util';
import {
  UpworkMcpService,
  type UpworkMcpJob as UpworkApiJob,
} from './upwork-mcp.service';

@Injectable()
export class UpworkJobsService {
  private readonly logger = new Logger(UpworkJobsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cronNotify: UpworkCronNotifyService,
    private readonly upworkMcp: UpworkMcpService,
  ) {}

  async listJobs() {
    try {
      const rows = await this.prisma.upworkJob.findMany({
        include: {
          proposalDrafts: {
            orderBy: { createdAt: 'desc' },
            select: {
              body: true,
              connectsRecommended: true,
              createdAt: true,
              id: true,
              templateName: true,
              templateUsed: true,
            },
            take: 1,
          },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      });

      return rows.map(({ proposalDrafts, ...job }) => ({
        ...job,
        latestProposal: proposalDrafts[0] ?? null,
      }));
    } catch (error) {
      this.throwIfTableMissing(error);
    }
  }

  async fetchAndStore(query: FetchUpworkJobsQueryDto) {
    const started = Date.now();
    this.logger.log('Manual fetch started');
    const pulled = await this.pullFromMcp(query);

    if (!pulled.records.length) {
      this.logger.log(
        `Manual fetch finished in ${Date.now() - started}ms: received=${pulled.totalFromApi}, excluded=${pulled.excludedByFilter}, inserted=0`,
      );
      return {
        excludedByFilter: pulled.excludedByFilter,
        inserted: 0,
        insertedJobIds: [],
        nextCursor: pulled.nextCursor,
        skipped: 0,
        totalFromApi: pulled.totalFromApi,
      };
    }

    let count: number;
    const storageStarted = Date.now();
    this.logger.log(
      `Saving ${pulled.records.length} eligible records; checking duplicates`,
    );
    const sourceJobIds = pulled.records.map((record) => record.sourceJobId);
    const existing = await this.prisma.upworkJob.findMany({
      select: { sourceJobId: true },
      where: { sourceJobId: { in: sourceJobIds } },
    });
    const existingSourceJobIds = new Set(
      existing.map((record) => record.sourceJobId),
    );
    const insertedSourceJobIds = sourceJobIds.filter(
      (sourceJobId) => !existingSourceJobIds.has(sourceJobId),
    );

    try {
      const result = await this.prisma.upworkJob.createMany({
        data: pulled.records,
        skipDuplicates: true,
      });
      count = result.count;
    } catch (error) {
      this.throwIfTableMissing(error);
    }

    const insertedJobs = insertedSourceJobIds.length
      ? await this.prisma.upworkJob.findMany({
          select: { id: true },
          where: { sourceJobId: { in: insertedSourceJobIds } },
        })
      : [];

    this.logger.log(
      `Manual fetch finished in ${Date.now() - started}ms: database stage=${Date.now() - storageStarted}ms, received=${pulled.totalFromApi}, excluded=${pulled.excludedByFilter}, inserted=${count}, duplicates=${pulled.records.length - count}`,
    );
    return {
      excludedByFilter: pulled.excludedByFilter,
      inserted: count,
      insertedJobIds: insertedJobs.map((job) => job.id),
      nextCursor: pulled.nextCursor,
      skipped: pulled.records.length - count,
      totalFromApi: pulled.totalFromApi,
    };
  }

  /**
   * Secured fetch for cron-job.org: official Upwork MCP pull + DB insert, then Slack/WhatsApp for jobs
   * that were not already stored (by sourceJobId).
   */
  async runCronFetch(
    dto: UpworkCronFetchQueryDto,
    headerSecret: string | undefined,
  ): Promise<{
    excludedByFilter: number;
    inserted: number;
    newJobsForNotify: number;
    nextCursor: string | null;
    notifications: {
      slack: { detail?: string; ok: boolean; skipped: boolean };
      whatsapp: { ok: boolean; skipped: boolean };
    };
    skipped: number;
    totalFromApi: number;
  }> {
    const { cron_secret: querySecret, ...rawFetch } = dto;
    const provided = (querySecret ?? headerSecret ?? '').trim();
    this.assertCronSecret(provided);

    const query = this.mergeCronDefaults(rawFetch);
    const pulled = await this.pullFromMcp(query);

    if (!pulled.records.length) {
      return {
        excludedByFilter: pulled.excludedByFilter,
        inserted: 0,
        newJobsForNotify: 0,
        nextCursor: pulled.nextCursor,
        notifications: {
          slack: { ok: true, skipped: true },
          whatsapp: { ok: true, skipped: true },
        },
        skipped: 0,
        totalFromApi: pulled.totalFromApi,
      };
    }

    const sourceIds = pulled.records
      .map((r) => r.sourceJobId)
      .filter((id): id is string => Boolean(id));

    const existingRows = await this.prisma.upworkJob.findMany({
      select: { sourceJobId: true },
      where: { sourceJobId: { in: sourceIds } },
    });
    const existingSet = new Set(existingRows.map((r) => r.sourceJobId));

    const newRecords = pulled.records.filter(
      (r) => r.sourceJobId && !existingSet.has(r.sourceJobId),
    );

    let inserted = 0;
    try {
      const result = await this.prisma.upworkJob.createMany({
        data: pulled.records,
        skipDuplicates: true,
      });
      inserted = result.count;
    } catch (error) {
      this.throwIfTableMissing(error);
    }

    const newSourceIds = newRecords
      .map((r) => r.sourceJobId)
      .filter((id): id is string => Boolean(id));
    const idBySource =
      newSourceIds.length > 0
        ? new Map(
            (
              await this.prisma.upworkJob.findMany({
                select: { id: true, sourceJobId: true },
                where: { sourceJobId: { in: newSourceIds } },
              })
            ).map((row) => [row.sourceJobId, row.id]),
          )
        : new Map<string, string>();

    const newJobsForNotify: ScoredUpworkJobForNotify[] = newRecords.map((r) => {
      const semantic = calculateSemanticFit(r.title, r.description);
      const detectedTemplate = detectProposalTemplate(r.title, r.description);
      const priority = scoreUpworkJobRecord(r);
      return {
        budgetLine: formatBudgetLine(r),
        clientLine: formatClientLine(r),
        detectedTemplate: detectedTemplate.templateId,
        detectedTemplateName: detectedTemplate.templateName,
        disqualifiedBy: semantic.disqualifiedBy,
        jobId: idBySource.get(r.sourceJobId),
        location: r.location ?? null,
        matchedKeywords: semantic.matchedKeywords,
        postedLine: formatPostedLine(r),
        priority,
        proposalsDisplay: r.proposals?.trim() || 'n/a',
        semanticFitScore: semantic.score,
        sourceJobId: r.sourceJobId,
        title: r.title,
        urgency: priority.urgency,
        url: r.url,
      };
    });

    const notifications =
      newJobsForNotify.length > 0
        ? await this.cronNotify.notifyNewJobs(newJobsForNotify)
        : {
            slack: { ok: true, skipped: true } as const,
            whatsapp: { ok: true, skipped: true } as const,
          };

    return {
      excludedByFilter: pulled.excludedByFilter,
      inserted,
      newJobsForNotify: newJobsForNotify.length,
      nextCursor: pulled.nextCursor,
      notifications,
      skipped: pulled.records.length - inserted,
      totalFromApi: pulled.totalFromApi,
    };
  }

  /**
   * If `UPWORK_CRON_SECRET` is set, require the same value via `cron_secret` query or
   * `X-Cron-Secret` header. If unset/empty, the cron URL is open (protect with network rules in production).
   */
  private assertCronSecret(provided: string): void {
    const expected = this.configService
      .get<string>('UPWORK_CRON_SECRET')
      ?.trim();
    if (!expected) {
      return;
    }
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid cron secret.');
    }
  }

  private readCronNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key)?.trim();
    if (!raw) {
      return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  private mergeCronDefaults(
    query: Omit<UpworkCronFetchQueryDto, 'cron_secret'>,
  ): FetchUpworkJobsQueryDto {
    const envStr = (key: string, fallback: string) =>
      this.configService.get<string>(key)?.trim() || fallback;

    return {
      fixed_max_usd:
        query.fixed_max_usd ??
        this.readCronNumber('UPWORK_CRON_FIXED_MAX_USD', 10_000),
      fixed_min_usd:
        query.fixed_min_usd ??
        this.readCronNumber('UPWORK_CRON_FIXED_MIN_USD', 100),
      hourly_max_usd:
        query.hourly_max_usd ??
        this.readCronNumber('UPWORK_CRON_HOURLY_MAX_USD', 30),
      hourly_min_usd:
        query.hourly_min_usd ??
        this.readCronNumber('UPWORK_CRON_HOURLY_MIN_USD', 15),
      limit: query.limit ?? this.readCronNumber('UPWORK_CRON_LIMIT', 20),
      next_cursor: query.next_cursor,
      q: query.q?.trim() || envStr('UPWORK_CRON_Q', 'JavaScript|React'),
      skills:
        query.skills?.trim() ||
        envStr('UPWORK_CRON_SKILLS', 'JavaScript|React'),
      skills_match_mode:
        query.skills_match_mode?.trim() ||
        envStr('UPWORK_CRON_SKILLS_MATCH_MODE', 'all'),
    };
  }

  private async pullFromMcp(query: FetchUpworkJobsQueryDto): Promise<{
    excludedByFilter: number;
    nextCursor: string | null;
    records: Prisma.UpworkJobCreateManyInput[];
    totalFromApi: number;
  }> {
    const result = await this.upworkMcp.searchJobs(query, (job) =>
      UpworkJobsService.rejectionReason(job, query),
    );
    const filterStarted = Date.now();
    const rows = result.jobs;
    const eligible = rows.filter(
      (job) => !UpworkJobsService.shouldExcludeUpworkJob(job, query),
    );
    const excludedByFilter = rows.length - eligible.length;

    const records = eligible
      .map((job) => this.normalizeJob(job))
      .filter((row): row is Prisma.UpworkJobCreateManyInput => row !== null);

    this.logger.log(
      `Filtering/normalization took ${Date.now() - filterStarted}ms: received=${rows.length}, excluded=${excludedByFilter}, eligible=${records.length}, invalid=${eligible.length - records.length}. Search-visible rejections skip details; detail-only rejections are checked after enrichment.`,
    );

    return {
      excludedByFilter,
      nextCursor: result.nextCursor,
      records,
      totalFromApi: rows.length,
    };
  }

  /** Already-applied jobs, jobs in India, jobs with invites sent or 50+ proposals, and jobs failing quality/fit filters are not stored. */
  private static shouldExcludeUpworkJob(
    job: UpworkApiJob,
    preferences: FetchUpworkJobsQueryDto,
  ): boolean {
    return UpworkJobsService.rejectionReason(job, preferences) !== null;
  }

  private static rejectionReason(
    job: UpworkApiJob,
    preferences: FetchUpworkJobsQueryDto,
  ): string | null {
    const semantic = calculateSemanticFit(job.title, job.description);
    if (job.applied === true) {
      return 'already applied';
    }
    if (UpworkJobsService.locationIsIndia(job.location)) {
      return 'excluded location';
    }
    if (UpworkJobsService.hasPositiveInvitesSent(job.invites_sent)) {
      return 'invites already sent';
    }
    if (UpworkJobsService.proposalsIndicateFiftyOrMore(job.proposals)) {
      return '50+ proposals';
    }
    if (semantic.disqualified) {
      return 'disqualifying keywords';
    }
    if (!UpworkJobsService.matchesBudgetPreferences(job, preferences)) {
      return 'outside budget preferences';
    }
    if (UpworkJobsService.hasZeroClientHistory(job)) {
      return 'no client spend or reviews';
    }
    return null;
  }

  private static matchesBudgetPreferences(
    job: UpworkApiJob,
    preferences: FetchUpworkJobsQueryDto,
  ): boolean {
    const bt = job.budget_type?.trim().toLowerCase();
    if (bt === 'fixed') {
      if (!job.budget_total_usd?.trim()) return true;
      const n = Number((job.budget_total_usd ?? '').replace(/[$,\s]/g, ''));
      if (!Number.isFinite(n)) return true;
      if (preferences.fixed_min_usd != null && n < preferences.fixed_min_usd) {
        return false;
      }
      if (preferences.fixed_max_usd != null && n > preferences.fixed_max_usd) {
        return false;
      }
    }
    if (bt === 'hourly') {
      const min =
        typeof job.hourly_min_usd === 'number' ? job.hourly_min_usd : null;
      const max =
        typeof job.hourly_max_usd === 'number' ? job.hourly_max_usd : null;
      if (
        preferences.hourly_min_usd != null &&
        max != null &&
        max < preferences.hourly_min_usd
      ) {
        return false;
      }
      if (
        preferences.hourly_max_usd != null &&
        min != null &&
        min > preferences.hourly_max_usd
      ) {
        return false;
      }
    }
    return true;
  }

  private static hasZeroClientHistory(job: UpworkApiJob): boolean {
    if (
      job.client_spent === undefined ||
      typeof job.client_feedback_count !== 'number'
    ) {
      return false;
    }
    const spent = Number(job.client_spent.replace(/[$,\s]/g, ''));
    return !Number.isNaN(spent) && spent <= 0 && job.client_feedback_count <= 0;
  }

  private static locationIsIndia(location: string | undefined): boolean {
    if (!location?.trim()) {
      return false;
    }
    return location
      .split(',')
      .some((part) => part.trim().toLowerCase() === 'india');
  }

  private static hasPositiveInvitesSent(
    invites: string | number | undefined | null,
  ): boolean {
    if (invites === undefined || invites === null) {
      return false;
    }
    const s = String(invites).trim();
    if (s === '') {
      return false;
    }
    const n = Number(s);
    if (!Number.isNaN(n)) {
      return n > 0;
    }
    return s !== '0';
  }

  /**
   * Upwork returns human-readable buckets (e.g. "20 to 50", "Less than 5").
   * Exclude when the range implies **50 or more** proposals.
   */
  private static proposalsIndicateFiftyOrMore(
    proposals: string | undefined,
  ): boolean {
    if (!proposals?.trim()) {
      return false;
    }
    const s = proposals.trim().toLowerCase();

    const lessThan = s.match(/less than (\d+)/);
    if (lessThan) {
      return Number(lessThan[1]) > 50;
    }

    const between = s.match(/(\d+)\s*to\s*(\d+)/);
    if (between) {
      const hi = Math.max(Number(between[1]), Number(between[2]));
      return hi >= 50;
    }

    const plus = s.match(/(\d+)\s*\+/);
    if (plus) {
      return Number(plus[1]) >= 50;
    }

    const moreThan = s.match(/more than (\d+)/);
    if (moreThan) {
      return Number(moreThan[1]) >= 50;
    }

    const digits = s.match(/\d+/g)?.map(Number) ?? [];
    if (digits.length) {
      return Math.max(...digits) >= 50;
    }

    return false;
  }

  private normalizeJob(
    job: UpworkApiJob,
  ): Prisma.UpworkJobCreateManyInput | null {
    const sourceJobId = job.job_id?.trim();
    const url = job.url?.trim();
    const title = job.title?.trim();
    const description = job.description?.trim();

    if (!sourceJobId || !url || !title || description === undefined) {
      return null;
    }

    const publishedAt = job.published_at
      ? new Date(job.published_at)
      : undefined;

    const skills =
      Array.isArray(job.skills) && job.skills.length
        ? (job.skills as Prisma.InputJsonValue)
        : undefined;

    const budgetType = job.budget_type?.trim() || null;
    let hourlyMinUsd =
      typeof job.hourly_min_usd === 'number'
        ? Math.round(job.hourly_min_usd)
        : null;
    let hourlyMaxUsd =
      typeof job.hourly_max_usd === 'number'
        ? Math.round(job.hourly_max_usd)
        : null;

    if (
      budgetType?.toLowerCase() === 'hourly' &&
      (hourlyMinUsd === null || hourlyMaxUsd === null)
    ) {
      const fromText =
        UpworkJobsService.extractHourlyRangeFromDescription(description);
      if (fromText) {
        hourlyMinUsd = hourlyMinUsd ?? fromText.min;
        hourlyMaxUsd = hourlyMaxUsd ?? fromText.max;
      }
    }

    const scoreInput: UpworkJobScoreInput = {
      budgetTotalUsd: job.budget_total_usd?.trim() || null,
      budgetType,
      clientFeedbackCount:
        typeof job.client_feedback_count === 'number'
          ? job.client_feedback_count
          : null,
      clientMemberSince: job.client_member_since?.trim() || null,
      clientScore:
        typeof job.client_score === 'number' ? job.client_score : null,
      clientSpent: job.client_spent?.trim() || null,
      description,
      hourlyMaxUsd,
      hourlyMinUsd,
      hoursPerWeek: job.hours_per_week?.trim() || null,
      premium: Boolean(job.premium),
      proposals: job.proposals?.trim() || null,
      publishedAt:
        publishedAt && !Number.isNaN(publishedAt.getTime())
          ? publishedAt
          : null,
      title,
    };

    const semantic = calculateSemanticFit(title, description);
    const detected = detectProposalTemplate(title, description);
    const priority = scoreUpworkJobRecord(scoreInput);

    return {
      budgetTotalUsd: scoreInput.budgetTotalUsd,
      budgetType,
      categoryGroupName: job.category_group_name?.trim() || null,
      categoryName: job.category_name?.trim() || null,
      clientActiveHires:
        typeof job.client_active_hires === 'number'
          ? job.client_active_hires
          : null,
      clientCompanySize: job.client_company_size?.trim() || null,
      clientFeedbackCount: scoreInput.clientFeedbackCount,
      clientMemberSince: scoreInput.clientMemberSince,
      clientScore: scoreInput.clientScore,
      clientSpent: scoreInput.clientSpent,
      clientTotalHires:
        typeof job.client_total_hires === 'number'
          ? job.client_total_hires
          : null,
      description,
      detectedTemplate: detected.templateId,
      detectedTemplateName: detected.templateName,
      disqualified: semantic.disqualified,
      disqualifiedBy: semantic.disqualifiedBy,
      experienceLevel: job.experience_level?.trim() || null,
      hourlyMaxUsd,
      hourlyMinUsd,
      hoursPerWeek: scoreInput.hoursPerWeek,
      invitesSent:
        job.invites_sent === undefined || job.invites_sent === null
          ? null
          : String(job.invites_sent).trim() || null,
      interviewing:
        job.interviewing === undefined || job.interviewing === null
          ? null
          : String(job.interviewing).trim() || null,
      isContractToHire: job.is_contract_to_hire ?? null,
      isEnterprise: job.is_enterprise ?? null,
      location: job.location?.trim() || null,
      matchedKeywords: semantic.matchedKeywords,
      openCount: typeof job.open_count === 'number' ? job.open_count : null,
      premium: scoreInput.premium ?? false,
      projectLength: job.project_length?.trim() || null,
      proposals: scoreInput.proposals,
      publishedAt: scoreInput.publishedAt ?? null,
      semanticFitScore: semantic.score,
      skills: skills ?? undefined,
      sourceJobId,
      title,
      totalJobsWithHires:
        typeof job.total_jobs_with_hires === 'number'
          ? job.total_jobs_with_hires
          : null,
      urgency: priority.urgency,
      url,
    };
  }

  /** Parse common "$15-25/hr" patterns from Upwork descriptions when the API omits structured hourly fields. */
  private static extractHourlyRangeFromDescription(
    text: string,
  ): { max: number; min: number } | null {
    const patterns = [
      /\$\s*(\d+(?:\.\d+)?)\s*[-–—]\s*\$?\s*(\d+(?:\.\d+)?)\s*\/?\s*hr\b/i,
      /Rate:\s*\$?\s*(\d+(?:\.\d+)?)\s*[-–—]\s*\$?\s*(\d+(?:\.\d+)?)\s*\/?\s*hr/i,
      /\$\s*(\d+(?:\.\d+)?)\s*[-–—]\s*\$?\s*(\d+(?:\.\d+)?)\s+per\s+hour\b/i,
    ];

    for (const re of patterns) {
      const match = text.match(re);
      if (match) {
        const min = Math.round(Number(match[1]));
        const max = Math.round(Number(match[2]));
        if (!Number.isNaN(min) && !Number.isNaN(max)) {
          return { max, min };
        }
      }
    }

    return null;
  }

  private throwIfTableMissing(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      throw new ServiceUnavailableException(
        'The upwork_jobs table is missing. From the backend folder run: npx prisma db push',
      );
    }

    throw error;
  }
}
