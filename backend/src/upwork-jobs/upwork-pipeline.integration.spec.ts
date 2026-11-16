import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { UpworkJobsService } from './upwork-jobs.service';
import { mapBlackfalconItem, RawBlackfalconItem } from './blackfalcon.mapper';

describe('Upwork Pipeline Integration (Mocked Apify & Slack)', () => {
  let service: UpworkJobsService;
  let mockApifyService: any;
  let mockSlackService: any;
  let mockPrisma: any;
  let mockCronNotify: any;
  let mockConfigService: any;

  const samplePath = path.resolve(__dirname, '../../../fixtures/blackfalcon-sample.json');
  const sampleData: RawBlackfalconItem[] = JSON.parse(
    fs.readFileSync(samplePath, 'utf8'),
  );

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'MIN_FIXED_BUDGET') return 1000;
        if (key === 'MIN_HOURLY_RATE') return 15;
        if (key === 'SLACK_MIN_SCORE') return 40;
        if (key === 'UPWORK_POLL_ENABLED') return 'true';
        return undefined;
      }),
    };

    mockApifyService = {
      hasToken: jest.fn().mockReturnValue(true),
      runAndFetchJobs: jest.fn(),
    };

    mockSlackService = {
      sendBlackfalconJobToWebhook: jest.fn().mockResolvedValue(true),
    };

    mockPrisma = {
      upworkJob: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'uuid-123' }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockCronNotify = {
      notifyNewJobs: jest.fn().mockResolvedValue({ slack: { ok: true } }),
    };

    service = new UpworkJobsService(
      mockConfigService as unknown as ConfigService,
      mockPrisma,
      mockCronNotify,
      mockApifyService,
      mockSlackService,
    );
  });

  it('runs on fixtures/blackfalcon-sample.json and makes 0 Slack calls when items are older than 10 minutes', async () => {
    const mapped = sampleData.map(mapBlackfalconItem);
    mockApifyService.runAndFetchJobs.mockResolvedValue(mapped);

    const result = await service.pollAndProcessJobs('integration-test');

    expect(result.fetched).toBe(mapped.length);
    // Since sample fixture items are older than 10 minutes, all are rejected by freshness
    expect(result.sent).toBe(0);
    expect(mockSlackService.sendBlackfalconJobToWebhook).not.toHaveBeenCalled();
  });

  it('sends to Slack and records slackSentAt for a fresh qualifying job', async () => {
    const freshJob: RawBlackfalconItem = {
      jobId: '999888777',
      title: 'Senior Next.js & Supabase Developer for SaaS MVP',
      description: 'Building an AI agent SaaS with Next.js, Supabase, and OpenAI.',
      url: 'https://www.upwork.com/jobs/~02999888777',
      publishTime: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
      clientPaymentVerified: true,
      clientCountry: 'United States',
      clientCountryCode: 'USA',
      totalApplicants: 3,
      skills: ['Next.js', 'React', 'Supabase', 'AI agent'],
      jobType: 'HOURLY',
      hourlyBudgetMin: 35,
      hourlyBudgetMax: 70,
      budgetAmount: null,
      budgetCurrency: 'USD',
      clientRating: 4.95,
      clientReviewCount: 8,
      clientTotalSpent: 15000,
      changeType: 'NEW',
      isRepost: false,
    };

    const mapped = [mapBlackfalconItem(freshJob)];
    mockApifyService.runAndFetchJobs.mockResolvedValue(mapped);

    const result = await service.pollAndProcessJobs('integration-test');

    expect(result.fetched).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.sent).toBe(1);
    expect(mockSlackService.sendBlackfalconJobToWebhook).toHaveBeenCalledTimes(1);
    expect(mockPrisma.upworkJob.updateMany).toHaveBeenCalledWith({
      where: { upworkJobId: '999888777' },
      data: { slackSentAt: expect.any(Date) },
    });
  });
});

