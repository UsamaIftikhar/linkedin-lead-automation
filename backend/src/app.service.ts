import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      service: 'job-lead-generation-api',
      status: 'ok',
    };
  }
}
