import { Module } from '@nestjs/common';
import { HunterModule } from '../pipeline/hunter.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  controllers: [LeadsController],
  exports: [LeadsService],
  imports: [HunterModule],
  providers: [LeadsService],
})
export class LeadsModule {}
