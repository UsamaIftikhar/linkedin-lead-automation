import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { waitUntil } from '@vercel/functions';
import type { Request } from 'express';
import { verifySlackSigningSecret } from './slack-verify-signature';
import {
  SlackUpworkThreadService,
  type SlackMessageEvent,
} from './slack-upwork-thread.service';

type SlackUrlVerification = { challenge: string; type: 'url_verification' };

type SlackEventCallback = {
  event?: { type?: string; [k: string]: unknown };
  type: 'event_callback';
};

@Controller('slack')
export class SlackEventsController {
  private readonly logger = new Logger(SlackEventsController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly slackUpworkThread: SlackUpworkThreadService,
  ) {}

  @Post('events')
  handleEvents(@Req() req: Request & { rawBody?: Buffer }): Record<string, unknown> {
    const signingSecret = this.configService.get<string>('SLACK_SIGNING_SECRET')?.trim();
    if (!signingSecret) {
      throw new ServiceUnavailableException('SLACK_SIGNING_SECRET is not configured.');
    }

    const rawBody = req.rawBody;
    if (!rawBody?.length) {
      throw new BadRequestException('Missing raw body for Slack signature verification.');
    }

    const ts = req.headers['x-slack-request-timestamp'];
    const sig = req.headers['x-slack-signature'];
    if (
      !verifySlackSigningSecret({
        rawBody,
        requestTimestamp: typeof ts === 'string' ? ts : undefined,
        signingSecret,
        slackSignature: typeof sig === 'string' ? sig : undefined,
      })
    ) {
      throw new UnauthorizedException('Invalid Slack signature.');
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON body.');
    }

    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Invalid payload.');
    }

    const t = (body as { type?: string }).type;
    if (t === 'url_verification') {
      const ch = (body as SlackUrlVerification).challenge;
      if (typeof ch !== 'string') {
        throw new BadRequestException('Missing challenge.');
      }
      return { challenge: ch };
    }

    if (t === 'event_callback') {
      const ev = (body as SlackEventCallback).event;
      if (ev?.type === 'message') {
        const messageEvent = ev as SlackMessageEvent;
        this.logger.log(
          `Received Slack message event channel=${messageEvent.channel ?? 'unknown'} thread_ts=${messageEvent.thread_ts ?? 'none'} ts=${messageEvent.ts ?? 'none'}`,
        );
        waitUntil(
          this.slackUpworkThread
            .handleThreadGenerateCommand(messageEvent)
            .catch((err) => {
              this.logger.warn(
                `Slack async handler error: ${err instanceof Error ? err.message : err}`,
              );
            }),
        );
      }
      return {};
    }

    return {};
  }
}
