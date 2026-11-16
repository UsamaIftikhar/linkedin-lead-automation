import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlackModule } from '../slack/slack.module';
import { UpworkJobsController } from './upwork-jobs.controller';
import { UpworkController } from './upwork.controller';
import { UpworkCronNotifyService } from './upwork-cron-notify.service';
import { UpworkDailySummaryService } from './upwork-daily-summary.service';
import { UpworkJobsService } from './upwork-jobs.service';
import { ApifyService } from './apify.service';

@Module({
  controllers: [UpworkJobsController, UpworkController],
  imports: [PrismaModule, SlackModule],
  providers: [
    UpworkCronNotifyService,
    UpworkDailySummaryService,
    UpworkJobsService,
    ApifyService,
  ],
  exports: [UpworkJobsService, ApifyService],
})
export class UpworkJobsModule {}
