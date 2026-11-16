import {
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpworkJobsService } from './upwork-jobs.service';

@Controller('upwork')
export class UpworkController {
  constructor(
    private readonly config: ConfigService,
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

  @Get()
  listStoredJobs() {
    return this.upworkJobsService.listJobs();
  }
}

