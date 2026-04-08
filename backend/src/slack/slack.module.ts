import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { SlackEventsController } from './slack-events.controller';
import { SlackUpworkThreadService } from './slack-upwork-thread.service';

@Module({
  controllers: [SlackEventsController],
  exports: [SlackUpworkThreadService],
  imports: [PrismaModule, ProposalsModule],
  providers: [SlackUpworkThreadService],
})
export class SlackModule {}
