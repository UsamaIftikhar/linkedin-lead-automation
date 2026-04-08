import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cron, { ScheduledTask } from 'node-cron';
import { EmailsService } from '../emails/emails.service';
import { JobsService } from '../jobs/jobs.service';
import { LeadsService } from '../leads/leads.service';
import { parseCsv } from '../shared/utils/csv.util';
import { HunterService } from './hunter.service';

@Injectable()
export class PipelineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineService.name);
  private scheduledTask: ScheduledTask | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailsService: EmailsService,
    private readonly hunterService: HunterService,
    private readonly jobsService: JobsService,
    private readonly leadsService: LeadsService,
  ) {}

  onModuleInit() {
    const schedule = process.env.CRON_SCHEDULE || '0 8 * * *';

    this.scheduledTask = cron.schedule(schedule, () => {
      this.logger.log('Starting scheduled job lead generation pipeline.');
      void this.runConfiguredPipeline();
    });

    this.logger.log(
      `Registered daily lead pipeline with schedule "${schedule}".`,
    );
  }

  async onModuleDestroy() {
    await this.scheduledTask?.stop();
  }

  async runConfiguredPipeline() {
    const keywords = parseCsv(process.env.DEFAULT_JOB_KEYWORDS);
    const locations = parseCsv(process.env.DEFAULT_JOB_LOCATIONS);

    const jobRuns: Array<{
      fetched: number;
      inserted: number;
      keyword: string;
      location: string;
      skipped: number;
      total: number;
    }> = [];

    for (const keyword of keywords) {
      for (const location of locations) {
        try {
          const result = await this.jobsService.fetchAndStoreJobs({
            keyword,
            location,
          });
          jobRuns.push(result);
        } catch (error) {
          this.logger.error(
            `Failed to fetch jobs for "${keyword}" in "${location}".`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }

    const enrichment = await this.enrichPendingLeads();
    const autoSend =
      this.configService.get<string>('PIPELINE_AUTO_SEND_EMAILS') === 'true';

    const emails = autoSend
      ? await this.emailsService.sendPendingEmails()
      : {
          attempted: 0,
          failed: 0,
          sent: 0,
          skipped: 0,
        };

    if (!autoSend) {
      this.logger.log(
        'Skipping automatic outbound email send (set PIPELINE_AUTO_SEND_EMAILS=true to enable).',
      );
    }

    return {
      emails,
      enrichment,
      jobRuns,
    };
  }

  async enrichPendingLeads(limit = 100) {
    const pendingLeads =
      await this.leadsService.getLeadsPendingEmailEnrichment(limit);
    const leadIdsByDomain = new Map<string, string[]>();
    let skippedWithoutDomain = 0;

    for (const lead of pendingLeads) {
      if (!lead.domain) {
        skippedWithoutDomain += 1;
        this.logger.warn(
          `Skipping enrichment for lead "${lead.companyName}" because no domain was extracted.`,
        );
        continue;
      }

      const existingIds = leadIdsByDomain.get(lead.domain) ?? [];
      existingIds.push(lead.id);
      leadIdsByDomain.set(lead.domain, existingIds);
    }

    let updated = 0;

    this.logger.log(
      `Preparing enrichment for ${pendingLeads.length} pending leads across ${leadIdsByDomain.size} domains. Skipped ${skippedWithoutDomain} leads without domains.`,
    );

    for (const [domain, leadIds] of leadIdsByDomain.entries()) {
      this.logger.log(
        `Requesting Hunter enrichment for "${domain}" across ${leadIds.length} lead(s).`,
      );
      const enrichment =
        await this.hunterService.findBusinessEmailByDomain(domain);

      if (!enrichment) {
        this.logger.warn(`No enrichment result found for "${domain}".`);
        continue;
      }

      updated += await this.leadsService.updateLeadEmails(
        leadIds.map((leadId) => ({
          confidence: enrichment.confidence,
          email: enrichment.email,
          leadId,
        })),
      );

      this.logger.log(
        `Updated ${leadIds.length} lead(s) for "${domain}" with ${enrichment.email}.`,
      );
    }

    return {
      domainsProcessed: leadIdsByDomain.size,
      leadsQueued: pendingLeads.length,
      skippedWithoutDomain,
      updated,
    };
  }
}
