import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';
import { EmailsModule } from './emails/emails.module';
import { JobsModule } from './jobs/jobs.module';
import { LeadsModule } from './leads/leads.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppService } from './app.service';
import { UpworkJobsModule } from './upwork-jobs/upwork-jobs.module';
import { ChatModule } from './chat/chat.module';
import { ProposalsModule } from './proposals/proposals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    LeadsModule,
    JobsModule,
    EmailsModule,
    PipelineModule,
    UpworkJobsModule,
    ChatModule,
    ProposalsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
