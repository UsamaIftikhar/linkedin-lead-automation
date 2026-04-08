import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendOneEmailDto {
  @IsUUID()
  leadId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  body!: string;
}
