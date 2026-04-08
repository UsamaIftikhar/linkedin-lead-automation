import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingService } from './embedding.service';
import { ProposalService } from './proposal.service';
import { ProposalsController } from './proposals.controller';
import { RetrievalService } from './retrieval.service';

@Module({
  controllers: [ProposalsController],
  exports: [ProposalService],
  imports: [PrismaModule],
  providers: [EmbeddingService, RetrievalService, ProposalService],
})
export class ProposalsModule {}
