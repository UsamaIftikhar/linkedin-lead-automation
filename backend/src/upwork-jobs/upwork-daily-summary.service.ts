import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SlackUpworkThreadService } from '../slack/slack-upwork-thread.service';
import { detectProposalTemplate } from './job-fit.util';
import {
  formatBudgetLine,
  scoreUpworkJobRecord,
} from './upwork-job-score';

export type DailySummaryPayload = {
  connectsRemaining: number | null;
  connectsUsedToday: number | null;
  date: string;
  proposalsSentToday: number;
  tier1Jobs: number;
  tier2Jobs: number;
  tier3Jobs: number;
  topJobs: Array<{
    budget: string;
    detectedTemplate: number;
    proposalsCount: string;
    score: number;
    tier: number;
    title: string;
    urgency: string;
  }>;
  totalJobsFetched: number | null;
  totalJobsFiltered: number;
};

@Injectable()
export class UpworkDailySummaryService {
  private readonly logger = new Logger(UpworkDailySummaryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly slackUpworkThread: SlackUpworkThreadService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Karachi' })
  async scheduledPakistanMorningDigest(): Promise<void> {
    if (
      this.configService
        .get<string>('UPWORK_DAILY_SUMMARY_ENABLED')
        ?.trim()
        .toLowerCase() === 'false'
    ) {
      return;
    }
    const { detail, sent } = await this.buildAndSendDailySummary();
    if (!sent) {
      this.logger.warn(`Daily Upwork summary not sent: ${detail ?? 'unknown'}`);
    }
  }

  private assertCronSecret(
    providedRaw: string | undefined,
    headerRaw: string | undefined,
  ): void {
    const expected = this.configService
      .get<string>('UPWORK_CRON_SECRET')
      ?.trim();
    if (!expected) {
      return;
    }
    const provided = (providedRaw ?? headerRaw ?? '').trim();
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid cron secret.');
    }
  }

  /**
   * Same auth as `GET /upwork-jobs/cron/fetch` when `UPWORK_CRON_SECRET` is set.
   */
  async runManualWithAuth(
    querySecret: string | undefined,
    headerSecret: string | undefined,
  ): Promise<{
    detail?: string;
    ok: boolean;
    sent: boolean;
    summary: DailySummaryPayload;
  }> {
    this.assertCronSecret(querySecret, headerSecret);
    return this.buildAndSendDailySummary();
  }

  async buildAndSendDailySummary(): Promise<{
    detail?: string;
    ok: boolean;
    sent: boolean;
    summary: DailySummaryPayload;
  }> {
    const dateStr = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Karachi',
    });
    const dayStart = new Date(`${dateStr}T00:00:00+05:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999+05:00`);

    const jobsToday = await this.prisma.upworkJob.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });

    const scored = jobsToday.map((row) => {
      const priority = scoreUpworkJobRecord({
        budgetTotalUsd: row.budgetTotalUsd,
        budgetType: row.budgetType,
        clientFeedbackCount: row.clientFeedbackCount,
        clientMemberSince: row.clientMemberSince,
        clientScore: row.clientScore,
        clientSpent: row.clientSpent,
        description: row.description,
        hourlyMaxUsd: row.hourlyMaxUsd,
        hourlyMinUsd: row.hourlyMinUsd,
        hoursPerWeek: row.hoursPerWeek,
        premium: row.premium,
        proposals: row.proposals,
        publishedAt: row.publishedAt,
        title: row.title,
      });
      const template = detectProposalTemplate(row.title, row.description);
      return { priority, row, template };
    });

    let tier1Jobs = 0;
    let tier2Jobs = 0;
    let tier3Jobs = 0;
    for (const { priority } of scored) {
      if (priority.tier === 1) {
        tier1Jobs += 1;
      } else if (priority.tier === 2) {
        tier2Jobs += 1;
      } else if (priority.tier === 3) {
        tier3Jobs += 1;
      }
    }

    const topSource = [...scored].sort(
      (a, b) => b.priority.score - a.priority.score,
    );
    const topJobs = topSource.slice(0, 5).map(({ priority, row, template }) => ({
      budget: formatBudgetLine({
        budgetTotalUsd: row.budgetTotalUsd,
        budgetType: row.budgetType,
        hourlyMaxUsd: row.hourlyMaxUsd,
        hourlyMinUsd: row.hourlyMinUsd,
        hoursPerWeek: row.hoursPerWeek,
      }),
      detectedTemplate: template.templateId,
      proposalsCount: row.proposals?.trim() || 'n/a',
      score: priority.score,
      tier: priority.tier,
      title: row.title,
      urgency: priority.urgency,
    }));

    const proposalsSentToday = await this.prisma.upworkProposalDraft.count({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });

    const connectsUsedRaw = this.configService
      .get<string>('UPWORK_CONNECTS_USED_TODAY')
      ?.trim();
    const connectsRemRaw = this.configService
      .get<string>('UPWORK_CONNECTS_REMAINING')
      ?.trim();
    const connectsUsedToday = connectsUsedRaw
      ? Number(connectsUsedRaw)
      : null;
    const connectsRemaining = connectsRemRaw
      ? Number(connectsRemRaw)
      : null;

    const summary: DailySummaryPayload = {
      connectsRemaining: Number.isFinite(connectsRemaining ?? NaN)
        ? connectsRemaining
        : null,
      connectsUsedToday: Number.isFinite(connectsUsedToday ?? NaN)
        ? connectsUsedToday
        : null,
      date: dateStr,
      proposalsSentToday,
      tier1Jobs,
      tier2Jobs,
      tier3Jobs,
      topJobs,
      totalJobsFetched: null,
      totalJobsFiltered: jobsToday.length,
    };

    const lines = [
      `*Upwork daily summary* (${summary.date} PKT)`,
      '',
      `Jobs stored today (passed filters): *${summary.totalJobsFiltered}*`,
      `API fetch total: *not tracked in DB* (see cron fetch responses).`,
      '',
      `*Tiers:* Tier 1: ${summary.tier1Jobs} · Tier 2: ${summary.tier2Jobs} · Tier 3: ${summary.tier3Jobs}`,
      `*Proposals generated today:* ${summary.proposalsSentToday}`,
      `*Connects (manual env):* used ${summary.connectsUsedToday ?? '—'} · remaining ${summary.connectsRemaining ?? '—'}`,
      '',
      summary.topJobs.length
        ? `*Top jobs today:*\n${summary.topJobs
            .map(
              (j, i) =>
                `${i + 1}. [T${j.tier} · ${j.score}] ${j.title}\n   ${j.budget} · proposals ${j.proposalsCount} · ${j.urgency} · template ${j.detectedTemplate}`,
            )
            .join('\n')}`
        : '_No jobs stored for this calendar day._',
    ];

    const text = lines.join('\n');
    const post = await this.slackUpworkThread.postPlainTextToUpworkChannel(text);
    if (!post.ok) {
      return {
        detail: post.detail,
        ok: false,
        sent: false,
        summary,
      };
    }
    return { ok: true, sent: true, summary };
  }
}
