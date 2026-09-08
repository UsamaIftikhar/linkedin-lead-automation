import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlackModule } from '../slack/slack.module';
import { UpworkJobsController } from './upwork-jobs.controller';
import { UpworkCronNotifyService } from './upwork-cron-notify.service';
import { UpworkDailySummaryService } from './upwork-daily-summary.service';
import { UpworkJobsService } from './upwork-jobs.service';
import { UpworkMcpService } from './upwork-mcp.service';

@Module({
  controllers: [UpworkJobsController],
  imports: [PrismaModule, SlackModule],
  providers: [
    UpworkCronNotifyService,
    UpworkDailySummaryService,
    UpworkJobsService,
    UpworkMcpService,
  ],
})
export class UpworkJobsModule {}
