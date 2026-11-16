import {
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FetchUpworkJobsQueryDto } from './dto/fetch-upwork-jobs-query.dto';
import { UpworkCronFetchQueryDto } from './dto/upwork-cron-fetch-query.dto';
import { UpworkDailySummaryService } from './upwork-daily-summary.service';
import { UpworkJobsService } from './upwork-jobs.service';

@Controller('upwork-jobs')
export class UpworkJobsController {
  constructor(
    private readonly config: ConfigService,
    private readonly upworkDailySummary: UpworkDailySummaryService,
    private readonly upworkJobsService: UpworkJobsService,
  ) {}

  @Post('poll')
  async poll(
    @Headers('x-admin-token') xAdminToken?: string,
    @Query('admin_token') queryToken?: string,
  ) {
    const secret =
      this.config.get<string>('ADMIN_TOKEN') ||
      this.config.get<string>('UPWORK_CRON_SECRET');

    if (secret) {
      const provided = (xAdminToken || queryToken || '').trim();
      if (!provided || provided !== secret.trim()) {
        throw new UnauthorizedException('Invalid admin token');
      }
    }

    return this.upworkJobsService.pollAndProcessJobs('api');
  }

  /**
   * GET for cron-job.org (e.g. every 30 min). If `UPWORK_CRON_SECRET` is set, pass it as
   * query `cron_secret` or header `X-Cron-Secret`. If unset, no secret is required (lock down
   * by network / reverse proxy in production). Saves new jobs; notifies Slack / WhatsApp.
   */
  @Get('cron/fetch')
  cronFetch(
    @Query() query: UpworkCronFetchQueryDto,
    @Headers('x-cron-secret') xCronSecret?: string,
  ) {
    return this.upworkJobsService.runCronFetch(query, xCronSecret);
  }

  /**
   * Daily digest (9:00 Asia/Karachi via `@Cron` when enabled). Optional HTTP trigger for
   * cron-job.org: same `cron_secret` / `X-Cron-Secret` as `cron/fetch` when `UPWORK_CRON_SECRET` is set.
   */
  @Get('cron/daily-summary')
  cronDailySummary(
    @Query('cron_secret') cronSecret?: string,
    @Headers('x-cron-secret') xCronSecret?: string,
  ) {
    return this.upworkDailySummary.runManualWithAuth(cronSecret, xCronSecret);
  }

  /** Manual pull into the database. */
  @Get('fetch')
  fetchAndStore(@Query() query: FetchUpworkJobsQueryDto) {
    return this.upworkJobsService.fetchAndStore(query);
  }

  @Get()
  listStoredJobs() {
    return this.upworkJobsService.listJobs();
  }
}

