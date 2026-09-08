import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class FetchUpworkJobsQueryDto {
  /** Ignored by `GET /upwork-jobs/fetch` — allowed so cron-style URLs do not trigger 422/400 validation. Use `/cron/fetch` when you need secret auth + notifications. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cron_secret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  skills?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  skills_match_mode?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(0)
  hourly_min_usd?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(0)
  hourly_max_usd?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(0)
  fixed_min_usd?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(0)
  fixed_max_usd?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  next_cursor?: string;
}
