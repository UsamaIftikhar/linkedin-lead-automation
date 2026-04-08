import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @IsIn(['assistant', 'system', 'user'])
  role!: 'assistant' | 'system' | 'user';

  @IsString()
  @MaxLength(48_000)
  @ValidateIf(
    (o: ChatMessageDto) =>
      o.role !== 'assistant' || o.reasoning_details == null,
  )
  @MinLength(1)
  content!: string;

  /** OpenRouter: pass back unmodified from the prior assistant turn for multi-turn reasoning. */
  @IsOptional()
  @Allow()
  reasoning_details?: unknown;
}

export class ChatRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}
