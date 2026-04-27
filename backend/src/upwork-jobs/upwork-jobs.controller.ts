import { Controller, Get, Headers, Query } from '@nestjs/common';
import { FetchUpworkJobsQueryDto } from './dto/fetch-upwork-jobs-query.dto';
import { UpworkCronFetchQueryDto } from './dto/upwork-cron-fetch-query.dto';
import { UpworkDailySummaryService } from './upwork-daily-summary.service';
import { UpworkJobsService } from './upwork-jobs.service';

@Controller('upwork-jobs')
export class UpworkJobsController {
  constructor(
    private readonly upworkDailySummary: UpworkDailySummaryService,
    private readonly upworkJobsService: UpworkJobsService,
  ) {}

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

  @Get('fetch')
  fetchAndStore(@Query() query: FetchUpworkJobsQueryDto) {
    return this.upworkJobsService.fetchAndStore(query);
  }

  @Get()
  listStoredJobs() {
    return this.upworkJobsService.listJobs();
  }
}
