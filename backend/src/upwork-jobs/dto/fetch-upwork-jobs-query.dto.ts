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
