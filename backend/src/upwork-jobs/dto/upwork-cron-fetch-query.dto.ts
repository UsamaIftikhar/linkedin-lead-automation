import { FetchUpworkJobsQueryDto } from './fetch-upwork-jobs-query.dto';

/** Same query params as /upwork-jobs/fetch; `cron_secret` is inherited (use query or `X-Cron-Secret` for `/cron/fetch`). */
export class UpworkCronFetchQueryDto extends FetchUpworkJobsQueryDto {}
