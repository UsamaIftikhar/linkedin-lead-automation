import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const DATE_POSTED_VALUES = ['all', 'today', '3days', 'week', 'month'] as const;
const EMPLOYMENT_TYPE_VALUES = [
  'FULLTIME',
  'CONTRACTOR',
  'PARTTIME',
  'INTERN',
] as const;
const JOB_REQUIREMENT_VALUES = [
  'under_3_years_experience',
  'more_than_3_years_experience',
  'no_experience',
  'no_degree',
] as const;

function toArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return undefined;
}

export class FetchJobsQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  keyword!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  location!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  platform?: string;

  @IsOptional()
  @IsIn(DATE_POSTED_VALUES)
  datePosted?: (typeof DATE_POSTED_VALUES)[number];

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  workFromHome?: boolean;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsIn(EMPLOYMENT_TYPE_VALUES, { each: true })
  employmentTypes?: Array<(typeof EMPLOYMENT_TYPE_VALUES)[number]>;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsIn(JOB_REQUIREMENT_VALUES, { each: true })
  jobRequirements?: Array<(typeof JOB_REQUIREMENT_VALUES)[number]>;
}
