import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  listLeads() {
    return this.leadsService.listLeads();
  }

  @Get('stats')
  getStats() {
    return this.leadsService.getStats();
  }

  @Post(':id/enrich-email')
  enrichEmail(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.enrichEmailForLead(id);
  }

  @Get(':id')
  getLead(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findLeadById(id);
  }
}
