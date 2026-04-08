import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Lead } from '@prisma/client';
import { HunterService } from '../pipeline/hunter.service';
import { PrismaService } from '../prisma/prisma.service';
import { inferPublisherFromApplyLink } from '../shared/utils/job-publisher.util';
import { LeadEmailUpdateInput, LeadSeedInput, LeadStats } from './lead.types';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly hunterService: HunterService,
    private readonly prisma: PrismaService,
  ) {}

  async listLeads(): Promise<Lead[]> {
    try {
      const rows = await this.prisma.lead.findMany({
        orderBy: {
          createdAt: 'desc',
        },
      });
      return rows.map((lead) => ({
        ...lead,
        jobPublisher:
          lead.jobPublisher ?? inferPublisherFromApplyLink(lead.applyLink),
      }));
    } catch (error) {
      throw this.handleDatabaseError(error);
    }
  }

  async findLeadById(id: string): Promise<Lead> {
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id },
      });
      if (!lead) {
        throw new NotFoundException(`Lead "${id}" was not found.`);
      }
      return {
        ...lead,
        jobPublisher:
          lead.jobPublisher ?? inferPublisherFromApplyLink(lead.applyLink),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw this.handleDatabaseError(error);
    }
  }

  /**
   * Look up a business email via Hunter for this lead's domain and persist it.
   */
  async enrichEmailForLead(leadId: string): Promise<Lead> {
    const lead = await this.findLeadById(leadId);

    if (lead.email?.trim()) {
      return lead;
    }

    const domain = lead.domain?.trim();
    if (!domain) {
      throw new BadRequestException(
        'This lead has no company website domain on file, so Hunter cannot look up an email. Try a job listing that includes an employer site.',
      );
    }

    const enrichment =
      await this.hunterService.findBusinessEmailByDomain(domain);

    if (!enrichment?.email) {
      throw new ServiceUnavailableException(
        'No qualifying business email was found for this domain. Check HUNTER_API_KEY, try again later, or the domain may not be in Hunter’s index.',
      );
    }

    try {
      await this.prisma.lead.update({
        data: {
          email: enrichment.email,
          emailConfidence: enrichment.confidence ?? null,
        },
        where: { id: leadId },
      });
    } catch (error) {
      throw this.handleDatabaseError(error);
    }

    this.logger.log(
      `Enriched lead "${leadId}" with email via Hunter (domain "${domain}").`,
    );

    return this.findLeadById(leadId);
  }

  async getStats(): Promise<LeadStats> {
    try {
      const [total, contacted] = await this.prisma.$transaction([
        this.prisma.lead.count(),
        this.prisma.lead.count({
          where: {
            contacted: true,
          },
        }),
      ]);

      return {
        total,
        contacted,
        uncontacted: total - contacted,
      };
    } catch (error) {
      throw this.handleDatabaseError(error);
    }
  }

  async storeFetchedJobs(leads: LeadSeedInput[]) {
    if (!leads.length) {
      return {
        inserted: 0,
        skipped: 0,
        total: 0,
      };
    }

    const { count } = await this.prisma.lead.createMany({
      data: leads.map((lead) => ({
        applyLink: lead.applyLink,
        companyName: lead.companyName,
        domain: lead.domain ?? null,
        employerWebsite: lead.employerWebsite ?? null,
        jobPublisher: lead.jobPublisher ?? null,
        jobTitle: lead.jobTitle,
        location: lead.location,
      })),
      skipDuplicates: true,
    });

    return {
      inserted: count,
      skipped: leads.length - count,
      total: leads.length,
    };
  }

  async getLeadsPendingEmailEnrichment(limit = 100) {
    return this.prisma.lead.findMany({
      where: {
        contacted: false,
        domain: {
          not: null,
        },
        email: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async updateLeadEmails(updates: LeadEmailUpdateInput[]) {
    if (!updates.length) {
      return 0;
    }

    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.lead.update({
          where: {
            id: update.leadId,
          },
          data: {
            email: update.email,
            emailConfidence: update.confidence ?? null,
          },
        }),
      ),
    );

    return updates.length;
  }

  async getUncontactedLeadsReadyForEmail(limit = 25) {
    return this.prisma.lead.findMany({
      where: {
        contacted: false,
        email: {
          not: null,
        },
      },
      orderBy: [
        {
          emailConfidence: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      take: limit,
    });
  }

  async markLeadAsContacted(leadId: string) {
    return this.prisma.lead.update({
      where: {
        id: leadId,
      },
      data: {
        contacted: true,
      },
    });
  }

  async markLeadsAsContactedByEmail(email: string) {
    return this.prisma.lead.updateMany({
      where: {
        contacted: false,
        email,
      },
      data: {
        contacted: true,
      },
    });
  }

  private handleDatabaseError(error: unknown) {
    this.logger.error(
      'Lead query failed.',
      error instanceof Error ? error.stack : undefined,
    );

    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P1008'
    ) {
      return new ServiceUnavailableException(
        'Database request timed out. Check your Supabase network access and DATABASE_URL.',
      );
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P1001'
    ) {
      return new ServiceUnavailableException(
        'Database is unreachable. Verify your Supabase host, credentials, and IP/network settings.',
      );
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2022'
    ) {
      return new ServiceUnavailableException(
        'Database schema is out of date (missing column or table). From the backend folder run: npx prisma db push',
      );
    }

    return new ServiceUnavailableException(
      'Database query failed. Confirm the database is reachable and the Prisma schema has been pushed (npx prisma db push from backend).',
    );
  }
}
