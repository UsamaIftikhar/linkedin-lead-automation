import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SlackUpworkThreadService } from '../slack/slack-upwork-thread.service';
import type { ScoredUpworkJobForNotify } from './scored-job-notify.types';

export type { ScoredUpworkJobForNotify } from './scored-job-notify.types';

@Injectable()
export class UpworkCronNotifyService {
  private readonly logger = new Logger(UpworkCronNotifyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly slackUpworkThread: SlackUpworkThreadService,
  ) {}

  private buildPlainDigest(jobs: ScoredUpworkJobForNotify[]): string {
    return jobs
      .map((j, i) => {
        const p = j.priority;
        return `${i + 1}. [${p.label} · ${p.score}] ${j.title}\n   ${j.url}\n   Proposal: ${p.proposalHint}`;
      })
      .join('\n\n');
  }

  async notifySlack(
    jobs: ScoredUpworkJobForNotify[],
  ): Promise<{ ok: boolean; skipped: boolean; detail?: string }> {
    if (!jobs.length) {
      return { ok: true, skipped: true };
    }

    const sorted = [...jobs].sort((a, b) => b.priority.score - a.priority.score);

    if (this.slackUpworkThread.isBotNotifyConfigured()) {
      const bot = await this.slackUpworkThread.notifyNewJobsViaBot(sorted);
      if (bot.ok) {
        return bot;
      }
      this.logger.warn(
        `Slack bot notify did not succeed (${bot.detail ?? 'unknown'}); trying incoming webhook per job.`,
      );
    }

    const url = this.configService.get<string>('SLACK_WEBHOOK_URL')?.trim();
    if (!url) {
      return {
        detail: this.slackUpworkThread.isBotNotifyConfigured()
          ? 'SLACK_WEBHOOK_URL unset (bot failed and no webhook)'
          : 'Set SLACK_BOT_TOKEN + SLACK_UPWORK_CHANNEL_ID or SLACK_WEBHOOK_URL',
        ok: false,
        skipped: true,
      };
    }

    return this.slackUpworkThread.notifyNewJobsViaIncomingWebhook(url, sorted);
  }

  async notifyWhatsApp(
    jobs: ScoredUpworkJobForNotify[],
  ): Promise<{ ok: boolean; skipped: boolean }> {
    if (!jobs.length) {
      return { ok: true, skipped: true };
    }

    const sorted = [...jobs].sort((a, b) => b.priority.score - a.priority.score);
    const body = `Upwork — ${jobs.length} new job(s)\n\n${this.buildPlainDigest(sorted)}`;

    const twilioSid = this.configService.get<string>('TWILIO_ACCOUNT_SID')?.trim();
    const twilioToken = this.configService.get<string>('TWILIO_AUTH_TOKEN')?.trim();
    const twilioFrom = this.configService.get<string>('TWILIO_WHATSAPP_FROM')?.trim();
    const twilioTo = this.configService.get<string>('TWILIO_WHATSAPP_TO')?.trim();

    if (twilioSid && twilioToken && twilioFrom && twilioTo) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const params = new URLSearchParams({
          Body: body.slice(0, 1600),
          From: twilioFrom,
          To: twilioTo,
        });
        await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          params.toString(),
          {
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 20_000,
          },
        );
        return { ok: true, skipped: false };
      } catch (err) {
        this.logger.warn(
          `Twilio WhatsApp failed: ${err instanceof Error ? err.message : err}`,
        );
        return { ok: false, skipped: false };
      }
    }

    const callKey = this.configService
      .get<string>('WHATSAPP_CALLMEBOT_APIKEY')
      ?.trim();
    const callPhone = this.configService
      .get<string>('WHATSAPP_CALLMEBOT_PHONE')
      ?.trim();

    if (callKey && callPhone) {
      try {
        const textParam = encodeURIComponent(body.slice(0, 4000));
        await axios.get(
          `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(callPhone)}&text=${textParam}&apikey=${encodeURIComponent(callKey)}`,
          { timeout: 20_000 },
        );
        return { ok: true, skipped: false };
      } catch (err) {
        this.logger.warn(
          `CallMeBot WhatsApp failed: ${err instanceof Error ? err.message : err}`,
        );
        return { ok: false, skipped: false };
      }
    }

    return { ok: false, skipped: true };
  }

  async notifyNewJobs(jobs: ScoredUpworkJobForNotify[]): Promise<{
    slack: { ok: boolean; skipped: boolean; detail?: string };
    whatsapp: { ok: boolean; skipped: boolean };
  }> {
    const [slack, whatsapp] = await Promise.all([
      this.notifySlack(jobs),
      this.notifyWhatsApp(jobs),
    ]);
    return { slack, whatsapp };
  }
}
