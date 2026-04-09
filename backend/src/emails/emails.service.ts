import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Lead } from '@prisma/client';
import { Resend } from 'resend';
import { LeadsService } from '../leads/leads.service';
import { RateLimitedQueue } from '../shared/utils/rate-limited-queue';
import type { SendOneEmailDto } from './dto/send-one-email.dto';

interface OutreachTemplateArgs {
  companyName: string;
  jobTitle: string;
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);
  private readonly sendQueue = new RateLimitedQueue(1000);

  constructor(
    private readonly configService: ConfigService,
    private readonly leadsService: LeadsService,
  ) {}

  async sendPendingEmails(limit = 25) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL');

    if (!resendApiKey || !fromEmail) {
      throw new ServiceUnavailableException(
        'RESEND_API_KEY and RESEND_FROM_EMAIL must be configured before sending emails.',
      );
    }

    const leads =
      await this.leadsService.getUncontactedLeadsReadyForEmail(limit);
    const uniqueLeads = leads.filter(
      (lead, index, items) =>
        items.findIndex((candidate) => candidate.email === lead.email) ===
        index,
    );
    const resend = new Resend(resendApiKey);
    let sent = 0;
    let failed = 0;

    await Promise.all(
      uniqueLeads.map((lead) =>
        this.sendQueue.add(async () => {
          if (!lead.email) {
            return;
          }

          const template = this.buildEmailTemplate({
            companyName: lead.companyName,
            jobTitle: lead.jobTitle,
          });

          try {
            await resend.emails.send({
              from: fromEmail,
              html: template.html,
              replyTo:
                this.configService.get<string>('OUTREACH_REPLY_TO') ||
                undefined,
              subject: template.subject,
              text: template.text,
              to: lead.email,
            });

            await this.leadsService.markLeadsAsContactedByEmail(lead.email);
            sent += 1;
          } catch (error) {
            failed += 1;
            this.logger.error(
              `Failed to send outreach email to ${lead.email}.`,
              error instanceof Error ? error.stack : undefined,
            );
          }
        }),
      ),
    );

    return {
      attempted: uniqueLeads.length,
      failed,
      sent,
      skipped: Math.max(leads.length - uniqueLeads.length, 0),
    };
  }

  async generateOutreachDraft(leadId: string) {
    const lead = await this.leadsService.findLeadById(leadId);
    const meta = this.leadDraftMeta(lead);

    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();

    if (!apiKey) {
      const template = this.buildEmailTemplate({
        companyName: lead.companyName,
        jobTitle: lead.jobTitle,
      });
      return {
        ...meta,
        body: template.text,
        source: 'template' as const,
        subject: template.subject,
      };
    }

    try {
      const draft = await this.fetchOpenAiDraft(lead);
      return {
        ...meta,
        body: draft.body,
        source: 'openai' as const,
        subject: draft.subject,
      };
    } catch (error) {
      this.logger.warn(
        'OpenAI draft generation failed; falling back to static template.',
        error instanceof Error ? error.message : undefined,
      );
      const template = this.buildEmailTemplate({
        companyName: lead.companyName,
        jobTitle: lead.jobTitle,
      });
      return {
        ...meta,
        body: template.text,
        source: 'template' as const,
        subject: template.subject,
      };
    }
  }

  async sendOneEmail(dto: SendOneEmailDto) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL');

    if (!resendApiKey || !fromEmail) {
      throw new ServiceUnavailableException(
        'RESEND_API_KEY and RESEND_FROM_EMAIL must be configured before sending emails.',
      );
    }

    const lead = await this.leadsService.findLeadById(dto.leadId);
    const to = lead.email?.trim();

    if (!to) {
      throw new BadRequestException(
        'This lead does not have an email address yet. Wait for enrichment or verify the domain.',
      );
    }

    const resend = new Resend(resendApiKey);
    const html = this.plainTextToHtml(dto.body);

    try {
      await resend.emails.send({
        from: fromEmail,
        html,
        replyTo:
          this.configService.get<string>('OUTREACH_REPLY_TO') || undefined,
        subject: dto.subject.trim(),
        text: dto.body,
        to,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Resend rejected the message. Check logs and your sender domain.',
      );
    }

    await this.leadsService.markLeadAsContacted(lead.id);

    return {
      contactedLeadId: lead.id,
      to,
    };
  }

  buildEmailTemplate({ companyName, jobTitle }: OutreachTemplateArgs) {
    const subject = `Quick intro regarding ${companyName}'s ${jobTitle} role`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>Hello ${companyName} team,</p>
        <p>
          I noticed the open <strong>${jobTitle}</strong> position and wanted to introduce myself.
          I work with growth-focused teams and would love to share how I can help create faster,
          more reliable outbound lead generation workflows.
        </p>
        <p>
          If this is relevant, I would be happy to send over a short plan tailored to your current hiring goals.
        </p>
        <p>Best regards,<br />Your Name</p>
      </div>
    `.trim();
    const text =
      `Hello ${companyName} team,\n\n` +
      `I noticed the open ${jobTitle} position and wanted to introduce myself. ` +
      `I work with growth-focused teams and would love to share how I can help create faster, more reliable outbound lead generation workflows.\n\n` +
      `If this is relevant, I would be happy to send over a short plan tailored to your current hiring goals.\n\n` +
      `Best regards,\nYour Name`;

    return {
      html,
      subject,
      text,
    };
  }

  private leadDraftMeta(lead: Lead) {
    return {
      lead: {
        companyName: lead.companyName,
        contacted: lead.contacted,
        email: lead.email,
        id: lead.id,
        jobTitle: lead.jobTitle,
        location: lead.location,
      },
    };
  }

  private plainTextToHtml(text: string): string {
    const escape = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return text
      .trim()
      .split(/\n{2,}/)
      .map((block) => `<p>${escape(block).replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }

  private async fetchOpenAiDraft(
    lead: Lead,
  ): Promise<{ body: string; subject: string }> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')!;
    const model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    const payload = {
      companyName: lead.companyName,
      jobTitle: lead.jobTitle,
      location: lead.location,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      body: JSON.stringify({
        messages: [
          {
            content:
              'You write concise, professional B2B cold outreach to hiring teams about an open role. ' +
              'Respond with ONLY valid JSON: {"subject":"...","body":"..."}. ' +
              'subject: single line, under 120 characters. ' +
              'body: plain text only, 3-5 short paragraphs separated by blank lines, no markdown, ' +
              'sign off with "Best regards" and a placeholder line "Your Name" for the sender to replace.',
            role: 'system',
          },
          {
            content: `Write outreach for this job lead: ${JSON.stringify(payload)}`,
            role: 'user',
          },
        ],
        model,
        response_format: { type: 'json_object' },
        temperature: 0.65,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errBody}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('OpenAI returned an empty message.');
    }

    const parsed = JSON.parse(raw) as { body?: string; subject?: string };
    const subject = parsed.subject?.trim();
    const body = parsed.body?.trim();

    if (!subject || !body) {
      throw new Error('OpenAI JSON missing subject or body.');
    }

    return { body, subject };
  }
}
