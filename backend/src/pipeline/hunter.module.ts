import { Module } from '@nestjs/common';
import { HunterService } from './hunter.service';

@Module({
  exports: [HunterService],
  providers: [HunterService],
})
export class HunterModule {}
