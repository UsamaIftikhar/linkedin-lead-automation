import { IsUUID } from 'class-validator';

export class GenerateUpworkProposalDto {
  @IsUUID('4')
  jobId!: string;
}
