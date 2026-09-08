import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { UpworkMcpService } from './upwork-mcp.service';
import { UpworkJobsService } from './upwork-jobs.service';

type McpInternals = {
  fetchAllJobDetails(
    client: { callTool: jest.Mock },
    tool: { name: string },
    organizationUid: string,
    jobs: Record<string, unknown>[],
    trace?: string,
    rejectionReason?: (job: Record<string, unknown>) => string | null,
  ): Promise<Record<string, unknown>[]>;
  buildSearchArguments(
    tool: {
      name: string;
      inputSchema: {
        properties: Record<string, { type: string }>;
        required?: string[];
      };
    },
    query: {
      q: string;
      skills: string;
      hourly_min_usd: number;
      limit: number;
      skills_match_mode?: string;
    },
    organizationUid?: string,
  ): Record<string, unknown>;
  normalizeMcpJob(raw: Record<string, unknown>): {
    applied?: boolean;
    budget_total_usd?: string;
    budget_type?: string;
    client_feedback_count?: number;
    client_score?: number;
    description?: string;
    hourly_max_usd?: number;
    hourly_min_usd?: number;
    job_id?: string;
    location?: string;
    proposals?: string;
    published_at?: string;
    skills?: string[];
  } | null;
  mergeJobDetails(
    job: Record<string, unknown>,
    payloads: unknown[],
  ): Record<string, unknown>;
};

describe('UpworkMcpService normalization', () => {
  const service = new UpworkMcpService(
    {} as ConfigService,
    {} as PrismaService,
  ) as unknown as McpInternals;

  it('requests details only for new jobs in a mixed batch', async () => {
    const findMany = jest.fn().mockResolvedValue([{ sourceJobId: 'old' }]);
    const subject = new UpworkMcpService(
      {} as ConfigService,
      { upworkJob: { findMany } } as unknown as PrismaService,
    ) as unknown as McpInternals;
    const callTool = jest.fn().mockResolvedValue({ content: [] });
    const jobs = [{ job_id: 'old' }, { job_id: 'new' }];

    expect(
      await subject.fetchAllJobDetails(
        { callTool },
        { name: 'upwork__find_jobs' },
        'org',
        jobs,
      ),
    ).toEqual(jobs);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith({
      name: 'upwork__find_jobs',
      arguments: { action: 'get', org_uid: 'org', params: { job_id: 'new' } },
    });

    callTool.mockClear();
    await subject.fetchAllJobDetails(
      { callTool },
      { name: 'upwork__find_jobs' },
      'org',
      [{ job_id: 'old' }],
    );
    expect(callTool).not.toHaveBeenCalled();
  });

  it('skips search-visible rejections but enriches jobs with missing details', async () => {
    const subject = new UpworkMcpService(
      {} as ConfigService,
      {
        upworkJob: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
    ) as unknown as McpInternals;
    const rules = UpworkJobsService as unknown as {
      rejectionReason(
        job: Record<string, unknown>,
        preferences: Record<string, unknown>,
      ): string | null;
    };
    const reject = (job: Record<string, unknown>) =>
      rules.rejectionReason(job, { fixed_min_usd: 100 });
    const rejected = [
      { job_id: 'busy', proposals: '300' },
      { job_id: 'applied', applied: true },
      { job_id: 'budget', budget_type: 'Fixed', budget_total_usd: '20' },
    ];
    const unknown = { job_id: 'unknown', budget_type: 'Fixed' };
    const callTool = jest.fn().mockResolvedValue({ content: [] });
    const jobs = [...rejected, unknown];
    expect(
      await subject.fetchAllJobDetails(
        { callTool },
        { name: 'upwork__find_jobs' },
        'org',
        jobs,
        'test',
        reject,
      ),
    ).toEqual(jobs);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith({
      name: 'upwork__find_jobs',
      arguments: {
        action: 'get',
        org_uid: 'org',
        params: { job_id: 'unknown' },
      },
    });
    callTool.mockClear();
    await subject.fetchAllJobDetails(
      { callTool },
      { name: 'upwork__find_jobs' },
      'org',
      rejected,
      'test',
      reject,
    );
    expect(callTool).not.toHaveBeenCalled();
  });

  it('maps MCP search parameters using camel-case schemas', () => {
    expect(
      service.buildSearchArguments(
        {
          name: 'search_jobs',
          inputSchema: {
            properties: {
              hourlyMinUsd: { type: 'number' },
              pageSize: { type: 'number' },
              searchQuery: { type: 'string' },
              skills: { type: 'array' },
            },
          },
        },
        {
          hourly_min_usd: 20,
          limit: 25,
          q: 'AI|React',
          skills: 'TypeScript|NestJS',
        },
      ),
    ).toEqual({
      hourlyMinUsd: 20,
      pageSize: 25,
      searchQuery: 'AI OR React; skills: TypeScript, NestJS',
      skills: ['TypeScript', 'NestJS'],
    });
  });

  it('builds the official Upwork find_jobs command envelope', () => {
    expect(
      service.buildSearchArguments(
        {
          name: 'upwork__find_jobs',
          inputSchema: {
            properties: {
              action: { type: 'string' },
              org_uid: { type: 'string' },
              params: { type: 'object' },
            },
            required: ['action', 'org_uid'],
          },
        },
        {
          hourly_min_usd: 20,
          limit: 25,
          q: 'AI|React',
          skills: 'TypeScript|NestJS',
        },
        'organization-123',
      ),
    ).toEqual({
      action: 'search',
      org_uid: 'organization-123',
      params: {
        limit: 10,
        query: 'AI OR React',
        rate_min: 20,
        skills: ['TypeScript', 'NestJS'],
      },
    });
  });

  it('normalizes nested Upwork job and client fields', () => {
    expect(
      service.normalizeMcpJob({
        client: {
          location: { country: 'United States' },
          rating: 4.9,
        },
        description: 'Build an AI assistant',
        hourlyBudget: { max: 45, min: 25 },
        id: '~012345',
        skills: [{ prefLabel: 'TypeScript' }, 'NestJS'],
        title: 'AI engineer',
      }),
    ).toMatchObject({
      budget_type: 'Hourly',
      client_score: 4.9,
      hourly_max_usd: 45,
      hourly_min_usd: 25,
      job_id: '~012345',
      location: 'United States',
      skills: ['TypeScript', 'NestJS'],
    });
  });

  it('normalizes the official Upwork find_jobs response shape', () => {
    expect(
      service.normalizeMcpJob({
        applied: true,
        budget: '1,500.00',
        client: {
          country: 'Australia',
          rating: 4.99,
          total_reviews: 74,
          total_spent: '$67,481.36',
        },
        description_snippet:
          '<untrusted_participant_content>\nModernize our SaaS platform.\n</untrusted_participant_content>',
        id: '2097022840806498542',
        job_type: 'fixed',
        proposal_count: 300,
        published_date: '2026-09-07T18:04:03.824Z',
        title: 'SaaS Platform Modernisation',
        url: 'https://www.upwork.com/jobs/~022097022840806498542',
      }),
    ).toMatchObject({
      applied: true,
      budget_total_usd: '1500',
      budget_type: 'Fixed',
      client_feedback_count: 74,
      client_score: 4.99,
      description: 'Modernize our SaaS platform.',
      job_id: '2097022840806498542',
      location: 'Australia',
      proposals: '300',
      published_at: '2026-09-07T18:04:03.824Z',
    });
  });

  it('extracts hourly rates from the official budget string', () => {
    expect(
      service.normalizeMcpJob({
        budget: '15.00–30.00/hr',
        id: 'hourly-job',
        job_type: 'hourly',
        title: 'React developer',
      }),
    ).toMatchObject({
      budget_type: 'Hourly',
      hourly_max_usd: 30,
      hourly_min_usd: 15,
    });
  });

  it('merges interviewing and other official job-detail fields', () => {
    expect(
      service.mergeJobDetails(
        {
          description: 'Short search snippet',
          job_id: '2097022840806498542',
          title: 'SaaS Platform Modernisation',
        },
        [
          {
            client_record: {
              contracts_active: 10,
              contracts_total: 106,
              feedback_count: 74,
              feedback_score: 4.99,
              jobs_with_hires: 84,
              spend_total: '67481.36',
            },
            data: {
              marketplaceJobPosting: {
                activityStat: {
                  jobActivity: {
                    invitesSent: 2,
                    totalInvitedToInterview: 3,
                  },
                },
                content: {
                  description:
                    '<untrusted_participant_content>Full job description</untrusted_participant_content>',
                },
                contractTerms: {
                  contractType: 'FIXED',
                  experienceLevel: 'EXPERT',
                },
              },
            },
          },
        ],
      ),
    ).toMatchObject({
      budget_type: 'Fixed',
      client_active_hires: 10,
      client_feedback_count: 74,
      client_score: 4.99,
      client_spent: '67481.36',
      client_total_hires: 106,
      description: 'Full job description',
      experience_level: 'EXPERT',
      interviewing: 3,
      invites_sent: 2,
      total_jobs_with_hires: 84,
    });
  });
});
