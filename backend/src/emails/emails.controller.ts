import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadIdDto } from './dto/lead-id.dto';
import { SendEmailsDto } from './dto/send-emails.dto';
import { SendOneEmailDto } from './dto/send-one-email.dto';
import { EmailsService } from './emails.service';

@Controller('emails')
export class EmailsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailsService: EmailsService,
  ) {}

  @Post('draft')
  generateDraft(@Body() body: LeadIdDto) {
    return this.emailsService.generateOutreachDraft(body.leadId);
  }

  @Post('send-one')
  sendOne(@Body() body: SendOneEmailDto) {
    return this.emailsService.sendOneEmail(body);
  }

  @Post('send')
  sendEmails(@Body() body: SendEmailsDto) {
    const enabled =
      this.configService.get<string>('ENABLE_BULK_OUTREACH') === 'true';

    if (!enabled) {
      throw new ForbiddenException(
        'Bulk email send is disabled. Compose and send one lead at a time from the dashboard.',
      );
    }

    return this.emailsService.sendPendingEmails(body.limit);
  }
}
