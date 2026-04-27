import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ProposalService } from '../proposals/proposal.service';
import type { ScoredUpworkJobForNotify } from '../upwork-jobs/scored-job-notify.types';
import { buildSingleJobSlackBlocks } from './slack-upwork-job-blocks';

const SLACK_POST_URL = 'https://slack.com/api/chat.postMessage';
const MAX_SLACK_TEXT = 3900;
const MAX_JOBS_PER_NOTIFY = 12;

/** Subtypes we should not treat as a user typing in a thread. */
const SKIP_MESSAGE_SUBTYPES = new Set([
  'bot_message',
  'message_changed',
  'message_deleted',
  'channel_join',
  'channel_leave',
  'group_join',
  'group_leave',
  'file_share',
  'ekm_access_denied',
]);

function stripSlackDecorators(text: string): string {
  return text
    .replace(/<@[^>]+>/g, ' ')
    .replace(/<#[^|>]+\|[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wantsGenerateProposal(raw: string): boolean {
  const t = stripSlackDecorators(raw)
    .replace(/[\u201c\u201d\u2018\u2019]/g, '')
    .replace(/…/g, '.')
    .trim();
  return /^\s*generate\s+proposal\s*[.!?]*\s*$/i.test(t);
}

function chunkForSlack(text: string, max = MAX_SLACK_TEXT): string[] {
  if (!text.length) {
    return ['(empty)'];
  }
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    chunks.push(text.slice(i, i + max));
  }
  return chunks;
}

export type SlackMessageEvent = {
  bot_id?: string;
  channel?: string;
  subtype?: string;
  text?: string;
  thread_ts?: string;
  ts?: string;
  user?: string;
};

@Injectable()
export class SlackUpworkThreadService {
  private readonly logger = new Logger(SlackUpworkThreadService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly proposalService: ProposalService,
  ) {}

  isBotNotifyConfigured(): boolean {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN')?.trim();
    const channel = this.configService
      .get<string>('SLACK_UPWORK_CHANNEL_ID')
      ?.trim();
    return Boolean(token && channel);
  }

  /**
   * Incoming webhook: one HTTP POST per job → separate Slack messages.
   * Stores parent `ts` (+ channel) so `generate proposal` in that message’s thread resolves the job.
   */
  async notifyNewJobsViaIncomingWebhook(
    webhookUrl: string,
    jobs: ScoredUpworkJobForNotify[],
  ): Promise<{ detail?: string; ok: boolean; skipped: boolean }> {
    const channelFallback =
      this.configService.get<string>('SLACK_UPWORK_CHANNEL_ID')?.trim() ?? '';
    const sorted = [...jobs]
      .sort((a, b) => b.priority.score - a.priority.score)
      .slice(0, MAX_JOBS_PER_NOTIFY);

    const results = await Promise.allSettled(
      sorted.map(async (job) => {
        const blocks = buildSingleJobSlackBlocks(job);
        const textFallback = `${job.title} · score ${job.priority.score}`;
        try {
          const res = await axios.post<unknown>(
            webhookUrl,
            {
              blocks,
              text: textFallback.slice(0, 500),
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 20_000,
            },
          );
          const raw: unknown = res.data;
          if (typeof raw === 'string') {
            this.logger.warn(
              `Slack webhook returned non-JSON body (no ts) — use an app-based Incoming Webhook and set SLACK_UPWORK_CHANNEL_ID (${job.sourceJobId})`,
            );
            return false;
          }
          const data = raw as {
            channel?: string;
            error?: string;
            ok?: boolean;
            ts?: string;
          };
          if (data == null) {
            return false;
          }
          if (data.ok === false) {
            this.logger.warn(
              `Slack webhook rejected job post: ${data.error ?? 'unknown'} (${job.sourceJobId})`,
            );
            return false;
          }
          const ts = data.ts;
          const channelId = data.channel?.trim() || channelFallback;
          if (!ts || !channelId) {
            this.logger.warn(
              `Slack webhook did not return ts/channel — set SLACK_UPWORK_CHANNEL_ID and use a modern Incoming Webhook from an app (${job.sourceJobId})`,
            );
            return false;
          }
          if (job.jobId) {
            await this.prisma.slackUpworkJobMessage.create({
              data: {
                channelId,
                messageTs: ts,
                upworkJobId: job.jobId,
              },
            });
          }
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Slack webhook post exception (${job.sourceJobId}): ${msg}`,
          );
          return false;
        }
      }),
    );

    const failures = results.filter(
      (result) => result.status === 'rejected' || result.value === false,
    ).length;

    if (failures === sorted.length) {
      return {
        detail: 'All per-job Slack webhook posts failed',
        ok: false,
        skipped: false,
      };
    }
    if (failures > 0) {
      return {
        detail: `${failures} of ${sorted.length} webhook job posts failed (or missing ts)`,
        ok: true,
        skipped: false,
      };
    }
    return { ok: true, skipped: false };
  }

  /**
   * One parent message per job so thread replies map to a single Upwork row.
   */
  async notifyNewJobsViaBot(
    jobs: ScoredUpworkJobForNotify[],
  ): Promise<{ detail?: string; ok: boolean; skipped: boolean }> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN')?.trim();
    const channel = this.configService
      .get<string>('SLACK_UPWORK_CHANNEL_ID')
      ?.trim();
    if (!token || !channel) {
      return {
        detail: 'SLACK_BOT_TOKEN or SLACK_UPWORK_CHANNEL_ID unset',
        ok: false,
        skipped: true,
      };
    }
    if (!jobs.length) {
      return { ok: true, skipped: true };
    }

    const sorted = [...jobs]
      .sort((a, b) => b.priority.score - a.priority.score)
      .slice(0, MAX_JOBS_PER_NOTIFY);

    const results = await Promise.allSettled(
      sorted.map(async (job) => {
        const blocks = buildSingleJobSlackBlocks(job);
        const textFallback = `${job.title} · score ${job.priority.score}`;
        try {
          const res = await axios.post(
            SLACK_POST_URL,
            {
              blocks,
              channel,
              text: textFallback.slice(0, 500),
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8',
              },
              timeout: 25_000,
            },
          );
          const data = res.data as {
            ok?: boolean;
            error?: string;
            ts?: string;
          };
          if (!data.ok || !data.ts) {
            this.logger.warn(
              `Slack chat.postMessage failed: ${data.error ?? 'unknown'} (${job.sourceJobId})`,
            );
            return false;
          }
          if (job.jobId) {
            await this.prisma.slackUpworkJobMessage.create({
              data: {
                channelId: channel,
                messageTs: data.ts,
                upworkJobId: job.jobId,
              },
            });
          }
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Slack post exception (${job.sourceJobId}): ${msg}`);
          return false;
        }
      }),
    );

    const failures = results.filter(
      (result) => result.status === 'rejected' || result.value === false,
    ).length;

    if (failures === sorted.length) {
      return {
        detail: 'All Slack bot posts failed',
        ok: false,
        skipped: false,
      };
    }
    if (failures > 0) {
      return {
        detail: `${failures} of ${sorted.length} Slack posts failed`,
        ok: true,
        skipped: false,
      };
    }
    return { ok: true, skipped: false };
  }

  async handleThreadGenerateCommand(ev: SlackMessageEvent): Promise<void> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN')?.trim();
    const webhookUrl = this.configService
      .get<string>('SLACK_WEBHOOK_URL')
      ?.trim();
    this.logger.log(
      `Slack thread command received channel=${ev.channel ?? 'unknown'} thread_ts=${ev.thread_ts ?? 'none'} ts=${ev.ts ?? 'none'} subtype=${ev.subtype ?? 'none'} bot=${ev.bot_id ? 'yes' : 'no'} text="${(ev.text ?? '').slice(0, 120)}"`,
    );
    if (!token && !webhookUrl) {
      this.logger.warn(
        'Slack thread command ignored because neither SLACK_BOT_TOKEN nor SLACK_WEBHOOK_URL is configured.',
      );
      return;
    }
    if (ev.bot_id) {
      this.logger.log(
        'Slack thread command ignored because the event came from a bot.',
      );
      return;
    }
    if (ev.subtype && SKIP_MESSAGE_SUBTYPES.has(ev.subtype)) {
      this.logger.log(
        `Slack thread command ignored because subtype=${ev.subtype} is skipped.`,
      );
      return;
    }
    if (!ev.thread_ts || !ev.channel || !ev.ts) {
      this.logger.warn(
        'Slack thread command ignored because channel, thread_ts, or ts is missing.',
      );
      return;
    }
    if (ev.thread_ts === ev.ts) {
      this.logger.log(
        'Slack thread command ignored because it is the parent message, not a reply.',
      );
      return;
    }
    const text = ev.text?.trim() ?? '';
    if (!wantsGenerateProposal(text)) {
      this.logger.log(
        `Slack thread command ignored because text did not match "generate proposal": "${text.slice(0, 120)}"`,
      );
      return;
    }

    this.logger.log(
      `Slack thread command matched "generate proposal"; looking up job mapping for channel=${ev.channel} thread_ts=${ev.thread_ts}.`,
    );

    let row: { upworkJobId: string } | null;
    try {
      row = await this.prisma.slackUpworkJobMessage.findUnique({
        select: { upworkJobId: true },
        where: {
          channelId_messageTs: {
            channelId: ev.channel.trim(),
            messageTs: ev.thread_ts.trim(),
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2021'
      ) {
        this.logger.error(
          'Slack thread command lookup failed because table slack_upwork_job_messages is missing. Run `npx prisma db push` for the deployed database.',
        );
      }
      throw err;
    }
    if (!row) {
      this.logger.warn(
        `Slack: "generate proposal" in thread but no job mapping for channel=${ev.channel} thread_ts=${ev.thread_ts} (post jobs via this app’s bot/webhook so each job gets a stored message ts).`,
      );
      return;
    }
    this.logger.log(
      `Slack thread command mapped thread to Upwork job ${row.upworkJobId}; starting proposal generation.`,
    );

    const reply = async (t: string) => {
      this.logger.log(
        `Slack thread reply send start channel=${ev.channel} thread_ts=${ev.thread_ts} chars=${t.length} via=${token ? 'bot' : 'webhook'}`,
      );
      if (token) {
        const res = await axios.post(
          SLACK_POST_URL,
          {
            channel: ev.channel,
            text: t,
            thread_ts: ev.thread_ts,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
            timeout: 25_000,
          },
        );
        const data = res.data as { error?: string; ok?: boolean };
        if (!data.ok) {
          throw new Error(data.error ?? 'chat.postMessage failed');
        }
        this.logger.log(
          `Slack thread reply sent via bot channel=${ev.channel} thread_ts=${ev.thread_ts}.`,
        );
        return;
      }
      const res = await axios.post(
        webhookUrl!,
        { text: t, thread_ts: ev.thread_ts },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 25_000,
        },
      );
      if (typeof res.data === 'string') {
        if (!res.data.toLowerCase().includes('ok')) {
          throw new Error(
            `incoming webhook reply failed: ${res.data.slice(0, 200)}`,
          );
        }
        this.logger.log(
          `Slack thread reply sent via webhook channel=${ev.channel} thread_ts=${ev.thread_ts}.`,
        );
        return;
      }
      const data = res.data as { error?: string; ok?: boolean };
      if (data && typeof data === 'object' && data.ok === false) {
        throw new Error(data.error ?? 'incoming webhook thread reply failed');
      }
      this.logger.log(
        `Slack thread reply sent via webhook channel=${ev.channel} thread_ts=${ev.thread_ts}.`,
      );
    };

    try {
      await reply('_Generating proposal…_');
      const { proposal } = await this.proposalService.generateForUpworkJob(
        row.upworkJobId,
      );
      this.logger.log(
        `Slack proposal generated for job ${row.upworkJobId}; length=${proposal.length}.`,
      );
      const parts = chunkForSlack(proposal);
      for (let i = 0; i < parts.length; i += 1) {
        const prefix =
          parts.length > 1
            ? `*Proposal* (${i + 1}/${parts.length})\n\n`
            : '*Proposal*\n\n';
        await reply(`${prefix}${parts[i]}`);
      }
      this.logger.log(
        `Slack proposal posted in ${parts.length} message part(s) for job ${row.upworkJobId}.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Proposal generation for Slack thread failed: ${msg}`);
      await reply(`Could not generate a proposal: ${msg.slice(0, 500)}`);
    }
  }

  /**
   * Post a plain-text message to the configured Upwork Slack channel (e.g. daily digest).
   */
  async postPlainTextToUpworkChannel(
    text: string,
  ): Promise<{ detail?: string; ok: boolean }> {
    const truncated = text.slice(0, 39_000);
    const token = this.configService.get<string>('SLACK_BOT_TOKEN')?.trim();
    const channel = this.configService
      .get<string>('SLACK_UPWORK_CHANNEL_ID')
      ?.trim();
    if (token && channel) {
      try {
        const res = await axios.post(
          SLACK_POST_URL,
          {
            channel,
            text: truncated,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
            timeout: 25_000,
          },
        );
        const data = res.data as { error?: string; ok?: boolean };
        if (!data.ok) {
          return {
            detail: data.error ?? 'chat.postMessage failed',
            ok: false,
          };
        }
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { detail: msg, ok: false };
      }
    }
    const webhookUrl = this.configService
      .get<string>('SLACK_WEBHOOK_URL')
      ?.trim();
    if (webhookUrl) {
      try {
        await axios.post(
          webhookUrl,
          { text: truncated },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20_000,
          },
        );
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { detail: msg, ok: false };
      }
    }
    return {
      detail: 'No SLACK_BOT_TOKEN + SLACK_UPWORK_CHANNEL_ID or SLACK_WEBHOOK_URL',
      ok: false,
    };
  }
}
