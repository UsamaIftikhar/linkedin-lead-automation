import { Controller, Get, Query } from '@nestjs/common';
import { FetchJobsQueryDto } from './dto/fetch-jobs-query.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('fetch')
  fetchJobs(@Query() query: FetchJobsQueryDto) {
    return this.jobsService.fetchAndStoreJobs(query);
  }
}
