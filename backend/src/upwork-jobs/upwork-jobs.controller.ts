import { Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { FetchUpworkJobsQueryDto } from './dto/fetch-upwork-jobs-query.dto';
import { UpworkCronFetchQueryDto } from './dto/upwork-cron-fetch-query.dto';
import { UpworkDailySummaryService } from './upwork-daily-summary.service';
import { UpworkJobsService } from './upwork-jobs.service';
import { UpworkMcpService } from './upwork-mcp.service';

@Controller('upwork-jobs')
export class UpworkJobsController {
  constructor(
    private readonly config: ConfigService,
    private readonly upworkDailySummary: UpworkDailySummaryService,
    private readonly upworkJobsService: UpworkJobsService,
    private readonly upworkMcp: UpworkMcpService,
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

  /** Manual pull from the official Upwork MCP server into the database. */
  @Get('fetch')
  fetchAndStore(@Query() query: FetchUpworkJobsQueryDto) {
    return this.upworkJobsService.fetchAndStore(query);
  }

  @Get()
  listStoredJobs() {
    return this.upworkJobsService.listJobs();
  }

  @Get('mcp/status')
  mcpStatus() {
    return this.upworkMcp.getStatus();
  }

  @Post('mcp/connect')
  mcpConnect() {
    return this.upworkMcp.startAuthorization();
  }

  @Get('mcp/callback')
  async mcpCallback(
    @Query() query: Record<string, string | string[] | undefined>,
    @Res() response: Response,
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') params.set(key, value);
    }
    const result = await this.upworkMcp.completeAuthorization(params);
    const successUrl = this.config
      .get<string>('UPWORK_MCP_SUCCESS_REDIRECT_URI')
      ?.trim();
    if (successUrl) {
      response.redirect(successUrl);
      return;
    }
    response.json(result);
  }
}
