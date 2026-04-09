import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LeadsService } from '../leads/leads.service';
import { LeadSeedInput } from '../leads/lead.types';
import { extractDomain } from '../shared/utils/domain.util';
import { inferPublisherFromApplyLink } from '../shared/utils/job-publisher.util';
import { RateLimitedQueue } from '../shared/utils/rate-limited-queue';
import { FetchJobsQueryDto } from './dto/fetch-jobs-query.dto';

interface JSearchJob {
  employer_name?: string;
  employer_website?: string;
  job_apply_link?: string;
  job_city?: string;
  job_country?: string;
  job_publisher?: string;
  job_state?: string;
  job_title?: string;
}

interface JSearchResponse {
  data?: JSearchJob[];
}

const EMPLOYMENT_TYPES = new Set([
  'FULLTIME',
  'CONTRACTOR',
  'PARTTIME',
  'INTERN',
]);

const JOB_REQUIREMENTS = new Set([
  'under_3_years_experience',
  'more_than_3_years_experience',
  'no_experience',
  'no_degree',
]);

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly requestQueue = new RateLimitedQueue(1100);

  constructor(
    private readonly configService: ConfigService,
    private readonly leadsService: LeadsService,
  ) {}

  async fetchAndStoreJobs(query: FetchJobsQueryDto) {
    const rapidApiKey = this.configService.get<string>('RAPIDAPI_KEY');

    if (!rapidApiKey) {
      throw new ServiceUnavailableException(
        'RAPIDAPI_KEY is not configured. Job fetching is unavailable.',
      );
    }

    const rapidApiHost =
      this.configService.get<string>('RAPIDAPI_HOST') ??
      'jsearch.p.rapidapi.com';
    const endpoint =
      this.configService.get<string>('JSEARCH_ENDPOINT') ??
      'https://jsearch.p.rapidapi.com/search';

    const response = await this.requestQueue.add(async () =>
      axios.get<JSearchResponse>(endpoint, {
        headers: {
          'x-rapidapi-host': rapidApiHost,
          'x-rapidapi-key': rapidApiKey,
        },
        params: {
          query: this.buildSearchQuery(query),
          page: '1',
          num_pages: '1',
          date_posted:
            query.datePosted && query.datePosted !== 'all'
              ? query.datePosted
              : undefined,
          work_from_home: query.workFromHome ? true : undefined,
          employment_types: this.normalizeCsvFilter(
            query.employmentTypes,
            EMPLOYMENT_TYPES,
          ),
          job_requirements: this.normalizeCsvFilter(
            query.jobRequirements,
            JOB_REQUIREMENTS,
          ),
        },
      }),
    );

    const jobs = Array.isArray(response?.data?.data) ? response.data.data : [];
    const normalizedJobs = jobs
      .map((job) => this.normalizeJob(job, query.location))
      .filter((job): job is LeadSeedInput => Boolean(job));
    const storeResult =
      await this.leadsService.storeFetchedJobs(normalizedJobs);

    this.logger.log(
      `Fetched ${jobs.length} jobs for "${query.keyword}" in "${query.location}". Inserted ${storeResult.inserted}.`,
    );

    return {
      ...storeResult,
      fetched: jobs.length,
      keyword: query.keyword,
      location: query.location,
      platform: this.normalizePlatform(query.platform),
    };
  }

  private buildSearchQuery(query: FetchJobsQueryDto): string {
    const parts = [`${query.keyword.trim()} jobs in ${query.location.trim()}`];
    const platform = this.normalizePlatform(query.platform);

    if (platform) {
      parts.push(`via ${platform}`);
    }

    return parts.join(' ');
  }

  private normalizePlatform(platform?: string): string | null {
    if (!platform) {
      return null;
    }

    const normalizedPlatform = platform.trim().toLowerCase();

    if (!normalizedPlatform || normalizedPlatform === 'all') {
      return null;
    }

    return normalizedPlatform;
  }

  private normalizeCsvFilter(
    values: string[] | undefined,
    allowedValues: Set<string>,
  ): string | undefined {
    if (!values?.length) {
      return undefined;
    }

    const normalizedValues = values.filter((value) => allowedValues.has(value));

    return normalizedValues.length ? normalizedValues.join(',') : undefined;
  }

  private normalizeJob(
    job: JSearchJob,
    fallbackLocation: string,
  ): LeadSeedInput | null {
    const companyName = job.employer_name?.trim();
    const jobTitle = job.job_title?.trim();
    const applyLink = job.job_apply_link?.trim();

    if (!companyName || !jobTitle || !applyLink) {
      return null;
    }

    const employerWebsite = job.employer_website?.trim() || null;
    const apiPublisher = job.job_publisher?.trim() || null;
    const jobPublisher =
      (apiPublisher && this.prettyPublisherName(apiPublisher)) ||
      inferPublisherFromApplyLink(applyLink);

    return {
      applyLink,
      companyName,
      domain: extractDomain(employerWebsite),
      employerWebsite,
      jobPublisher,
      jobTitle,
      location: this.buildLocation(job, fallbackLocation),
    };
  }

  private prettyPublisherName(raw: string): string {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '');
    const map: Record<string, string> = {
      bebee: 'beBee',
      careerbuilder: 'CareerBuilder',
      glassdoor: 'Glassdoor',
      indeed: 'Indeed',
      linkedin: 'LinkedIn',
      monster: 'Monster',
      ziprecruiter: 'ZipRecruiter',
    };
    if (map[key]) {
      return map[key];
    }
    return raw.trim();
  }

  private buildLocation(job: JSearchJob, fallbackLocation: string): string {
    const parts = [job.job_city, job.job_state, job.job_country]
      .map((value) => value?.trim())
      .filter(Boolean);

    return parts.length ? parts.join(', ') : fallbackLocation;
  }
}
