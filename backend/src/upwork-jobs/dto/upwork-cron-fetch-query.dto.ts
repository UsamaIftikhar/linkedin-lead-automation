import { IsOptional, IsString, MaxLength } from 'class-validator';
import { FetchUpworkJobsQueryDto } from './fetch-upwork-jobs-query.dto';

/** Same query params as /upwork-jobs/fetch plus optional `cron_secret` (or use header X-Cron-Secret). */
export class UpworkCronFetchQueryDto extends FetchUpworkJobsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cron_secret?: string;
}
