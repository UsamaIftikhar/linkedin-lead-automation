import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlackModule } from '../slack/slack.module';
import { UpworkJobsController } from './upwork-jobs.controller';
import { UpworkCronNotifyService } from './upwork-cron-notify.service';
import { UpworkJobsService } from './upwork-jobs.service';

@Module({
  controllers: [UpworkJobsController],
  imports: [PrismaModule, SlackModule],
  providers: [UpworkCronNotifyService, UpworkJobsService],
})
export class UpworkJobsModule {}
