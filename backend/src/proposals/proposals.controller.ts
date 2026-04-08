import { Body, Controller, Post } from '@nestjs/common';
import { GenerateUpworkProposalDto } from './dto/generate-upwork-proposal.dto';
import { ProposalService } from './proposal.service';

@Controller('proposals')
export class ProposalsController {
  constructor(private readonly proposalService: ProposalService) {}

  @Post('upwork/generate')
  generateUpwork(@Body() body: GenerateUpworkProposalDto) {
    return this.proposalService.generateForUpworkJob(body.jobId);
  }
}
