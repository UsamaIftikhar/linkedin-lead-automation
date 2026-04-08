import { IsUUID } from 'class-validator';

export class LeadIdDto {
  @IsUUID()
  leadId!: string;
}
