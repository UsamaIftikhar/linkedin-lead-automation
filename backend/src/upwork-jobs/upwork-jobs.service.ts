import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SlackUpworkThreadService } from '../slack/slack-upwork-thread.service';
import { ApifyService } from './apify.service';
import { MappedUpworkJob } from './blackfalcon.mapper';
import { evaluateJobFilters } from './filters/job-filters';
import { scoreBlackfalconJob } from './upwork-job-score';
import { FetchUpworkJobsQueryDto } from './dto/fetch-upwork-jobs-query.dto';
import type { UpworkCronFetchQueryDto } from './dto/upwork-cron-fetch-query.dto';
import { UpworkCronNotifyService } from './upwork-cron-notify.service';

@Injectable()
export class UpworkJobsService {
  private readonly logger = new Logger(UpworkJobsService.name);
  private isPolling = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cronNotify: UpworkCronNotifyService,
    private readonly apifyService: ApifyService,
    private readonly slackThreadService: SlackUpworkThreadService,
  ) {}

  @Cron('*/10 * * * *')
  async handleScheduledPoll(): Promise<void> {
    const enabled =
      this.configService.get<string>('UPWORK_POLL_ENABLED')?.trim() !== 'false';
    if (!enabled) {
      this.logger.debug(
        'Scheduled Upwork poll skipped (UPWORK_POLL_ENABLED is false).',
      );
      return;
    }
    await this.pollAndProcessJobs('cron');
  }

  async pollAndProcessJobs(trigger = 'manual'): Promise<{
    fetched: number;
    inserted: number;
    rejected: number;
    sent: number;
    skippedBecauseBusy?: boolean;
  }> {
    if (this.isPolling) {
      this.logger.log(
        `Skipping poll tick (${trigger}): previous run is still in progress.`,
      );
      return {
        fetched: 0,
        inserted: 0,
        rejected: 0,
        sent: 0,
        skippedBecauseBusy: true,
      };
    }

    if (!this.apifyService.hasToken()) {
      this.logger.warn(
        `Skipping Upwork poll (${trigger}): APIFY_TOKEN is not configured in environment variables.`,
      );
      return { fetched: 0, inserted: 0, rejected: 0, sent: 0 };
    }

    this.isPolling = true;
    try {
      this.logger.log(`Starting Upwork poll (${trigger})...`);
      const mappedJobs = await this.apifyService.runAndFetchJobs();
      const totalFetched = mappedJobs.length;

      if (totalFetched === 0) {
        this.logger.log(`0 fresh jobs fetched from Apify (${trigger}).`);
        return { fetched: 0, inserted: 0, rejected: 0, sent: 0 };
      }

      const minFixedBudget =
        Number(this.configService.get<number>('MIN_FIXED_BUDGET')) || 1000;
      const minHourlyRate =
        Number(this.configService.get<number>('MIN_HOURLY_RATE')) || 15;
      const minScore =
        Number(this.configService.get<number>('SLACK_MIN_SCORE')) || 40;

      const passingJobs: Array<
        MappedUpworkJob & { matchedKeywords: string[]; score: number }
      > = [];
      const rejectedJobs: Array<
        MappedUpworkJob & { rejectionReason: string }
      > = [];

      for (const job of mappedJobs) {
        const evaluation = evaluateJobFilters(job, {
          minFixedBudget,
          minHourlyRate,
          now: new Date(),
          maxAgeMinutes: 10,
          maxProposals: 20,
        });

        if (evaluation.passed) {
          const score = scoreBlackfalconJob({
            matchedKeywords: evaluation.matchedKeywords,
            proposalCount: job.proposalCount,
            fixedBudget: job.fixedBudget,
            hourlyMin: job.hourlyMin,
            hourlyMax: job.hourlyMax,
            clientRating: job.clientRating,
            clientReviewCount: job.clientReviewCount,
            clientTotalSpent: job.clientTotalSpent,
          });
          passingJobs.push({
            ...job,
            score,
            matchedKeywords: evaluation.matchedKeywords,
          });
        } else {
          this.logger.debug(
            `Job ${job.upworkJobId} rejected: ${evaluation.rejectionReason}`,
          );
          rejectedJobs.push({
            ...job,
            rejectionReason: evaluation.rejectionReason ?? 'Unknown reason',
          });
        }
      }

      // Step 5: Dedupe and persistence
      const candidateIds = passingJobs.map((j) => j.upworkJobId);
      const existingPassing =
        candidateIds.length > 0
          ? await this.prisma.upworkJob.findMany({
              where: { upworkJobId: { in: candidateIds } },
              select: { upworkJobId: true },
            })
          : [];
      const existingPassingIds = new Set(
        existingPassing.map((e) => e.upworkJobId),
      );
      const newlyInserted = passingJobs.filter(
        (j) => !existingPassingIds.has(j.upworkJobId),
      );

      // Persist passing jobs
      if (passingJobs.length > 0) {
        await this.prisma.upworkJob.createMany({
          data: passingJobs.map((j) => ({
            upworkJobId: j.upworkJobId,
            sourceJobId: j.sourceJobId,
            title: j.title,
            description: j.description,
            url: j.url,
            postedAt: j.postedAt,
            publishedAt: j.publishedAt,
            paymentVerified: j.paymentVerified,
            country: j.country,
            countryCode: j.countryCode,
            proposalCount: j.proposalCount,
            skills: j.skills,
            jobType: j.jobType,
            fixedBudget: j.fixedBudget,
            hourlyMin: j.hourlyMin,
            hourlyMax: j.hourlyMax,
            budgetCurrency: j.budgetCurrency,
            budgetText: j.budgetText,
            clientRating: j.clientRating,
            clientReviewCount: j.clientReviewCount,
            clientTotalSpent: j.clientTotalSpent,
            changeType: j.changeType,
            isRepost: j.isRepost,
            score: j.score,
            matchedKeywords: j.matchedKeywords,
            rejectionReason: null,
          })),
          skipDuplicates: true,
        });
      }

      // Persist rejected jobs for dashboard visibility
      if (rejectedJobs.length > 0) {
        await this.prisma.upworkJob.createMany({
          data: rejectedJobs.map((j) => ({
            upworkJobId: j.upworkJobId,
            sourceJobId: j.sourceJobId,
            title: j.title,
            description: j.description,
            url: j.url,
            postedAt: j.postedAt,
            publishedAt: j.publishedAt,
            paymentVerified: j.paymentVerified,
            country: j.country,
            countryCode: j.countryCode,
            proposalCount: j.proposalCount,
            skills: j.skills,
            jobType: j.jobType,
            fixedBudget: j.fixedBudget,
            hourlyMin: j.hourlyMin,
            hourlyMax: j.hourlyMax,
            budgetCurrency: j.budgetCurrency,
            budgetText: j.budgetText,
            clientRating: j.clientRating,
            clientReviewCount: j.clientReviewCount,
            clientTotalSpent: j.clientTotalSpent,
            changeType: j.changeType,
            isRepost: j.isRepost,
            score: 0,
            matchedKeywords: [],
            rejectionReason: j.rejectionReason,
          })),
          skipDuplicates: true,
        });
      }

      // Step 6 & 7: Slack delivery for newly inserted qualifying jobs
      const slackCandidates = newlyInserted.filter((j) => j.score >= minScore);

      let sentCount = 0;
      if (slackCandidates.length > 0) {
        for (const candidate of slackCandidates) {
          const ok = await this.slackThreadService.sendBlackfalconJobToWebhook({
            title: candidate.title,
            url: candidate.url,
            score: candidate.score,
            budgetText: candidate.budgetText,
            country: candidate.country,
            countryCode: candidate.countryCode,
            proposalCount: candidate.proposalCount,
            matchedKeywords: candidate.matchedKeywords,
            postedAt: candidate.postedAt,
          });

          if (ok) {
            await this.prisma.upworkJob.updateMany({
              where: { upworkJobId: candidate.upworkJobId },
              data: { slackSentAt: new Date() },
            });
            sentCount++;
          }
        }
      }

      // Step 7: Log one summary line per run
      this.logger.log(
        `Poll complete (${trigger}): fetched=${totalFetched}, inserted=${newlyInserted.length}, rejected=${rejectedJobs.length}, sent=${sentCount}`,
      );

      return {
        fetched: totalFetched,
        inserted: newlyInserted.length,
        rejected: rejectedJobs.length,
        sent: sentCount,
      };
    } finally {
      this.isPolling = false;
    }
  }

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
        orderBy: [
          { postedAt: 'desc' },
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return rows.map(({ proposalDrafts, ...job }) => ({
        ...job,
        status: job.slackSentAt
          ? 'sent'
          : job.rejectionReason
            ? 'rejected'
            : 'pending',
        latestProposal: proposalDrafts[0] ?? null,
      }));
    } catch (error) {
      this.throwIfTableMissing(error);
    }
  }

  async fetchAndStore(_query: FetchUpworkJobsQueryDto) {
    this.logger.log('Manual fetch triggered');
    return {
      excludedByFilter: 0,
      inserted: 0,
      insertedJobIds: [] as string[],
      nextCursor: null as string | null,
      skipped: 0,
      totalFromApi: 0,
    };
  }

  async runCronFetch(
    dto: UpworkCronFetchQueryDto,
    headerSecret: string | undefined,
  ): Promise<{
    status: string;
    trigger: string;
    fetched: number;
    inserted: number;
    rejected: number;
    sentToSlack: number;
    skippedBecauseBusy: boolean;
  }> {
    const { cron_secret: querySecret } = dto;
    const provided = (querySecret ?? headerSecret ?? '').trim();
    this.assertCronSecret(provided);

    const result = await this.pollAndProcessJobs('cronjob.org');
    return {
      status: 'ok',
      trigger: 'cronjob.org',
      fetched: result.fetched,
      inserted: result.inserted,
      rejected: result.rejected,
      sentToSlack: result.sent,
      skippedBecauseBusy: Boolean(result.skippedBecauseBusy),
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
      days_posted:
        query.days_posted ?? this.readCronNumber('UPWORK_CRON_DAYS_POSTED', 1),
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
