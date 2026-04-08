import { Module } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { JobsModule } from '../jobs/jobs.module';
import { LeadsModule } from '../leads/leads.module';
import { HunterModule } from './hunter.module';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [EmailsModule, HunterModule, JobsModule, LeadsModule],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
