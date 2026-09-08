import axios from 'axios';
import {
  ChatCompleteResponse,
  ChatMessage,
  EmailDraftResponse,
  FetchJobsFilters,
  FetchJobsResponse,
  FetchUpworkJobsParams,
  FetchUpworkJobsResult,
  GenerateUpworkProposalResponse,
  Lead,
  LeadStats,
  SendOneEmailResponse,
  SendEmailsResponse,
  UpworkJob,
  UpworkMcpConnectResult,
  UpworkMcpStatus,
} from '@/types/api';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function getLeadStats() {
  const response = await apiClient.get<LeadStats>('/leads/stats');
  return response.data;
}

export async function getLeads() {
  const response = await apiClient.get<Lead[]>('/leads');
  return response.data;
}

export async function getLead(id: string) {
  const response = await apiClient.get<Lead>(`/leads/${id}`);
  return response.data;
}

export async function enrichLeadEmail(leadId: string) {
  const response = await apiClient.post<Lead>(
    `/leads/${leadId}/enrich-email`,
  );
  return response.data;
}

export async function fetchJobs(filters: FetchJobsFilters) {
  const response = await apiClient.get<FetchJobsResponse>('/jobs/fetch', {
    params: {
      keyword: filters.keyword,
      location: filters.location,
      platform: filters.platform,
      datePosted: filters.datePosted,
      workFromHome: filters.workFromHome,
      employmentTypes: filters.employmentTypes.join(','),
      jobRequirements: filters.jobRequirements.join(','),
    },
  });
  return response.data;
}

export async function sendEmails(limit = 25) {
  const response = await apiClient.post<SendEmailsResponse>('/emails/send', {
    limit,
  });
  return response.data;
}

export async function generateEmailDraft(leadId: string) {
  const response = await apiClient.post<EmailDraftResponse>('/emails/draft', {
    leadId,
  });
  return response.data;
}

export async function sendOneEmail(input: {
  body: string;
  leadId: string;
  subject: string;
}) {
  const response = await apiClient.post<SendOneEmailResponse>(
    '/emails/send-one',
    input,
  );
  return response.data;
}

export async function getUpworkJobs() {
  const response = await apiClient.get<UpworkJob[]>('/upwork-jobs');
  return response.data;
}

export async function fetchUpworkJobs(params: FetchUpworkJobsParams) {
  const response = await apiClient.get<FetchUpworkJobsResult>(
    '/upwork-jobs/fetch',
    {
      params: {
        ...params,
        next_cursor: params.next_cursor || undefined,
      },
    },
  );
  return response.data;
}

export async function getUpworkMcpStatus() {
  const response = await apiClient.get<UpworkMcpStatus>(
    '/upwork-jobs/mcp/status',
  );
  return response.data;
}

export async function connectUpworkMcp() {
  const response = await apiClient.post<UpworkMcpConnectResult>(
    '/upwork-jobs/mcp/connect',
  );
  return response.data;
}

export async function sendChatMessages(messages: ChatMessage[]) {
  const response = await apiClient.post<ChatCompleteResponse>('/chat', {
    messages,
  });
  return response.data;
}

export async function generateUpworkProposal(jobId: string) {
  const response = await apiClient.post<GenerateUpworkProposalResponse>(
    '/proposals/upwork/generate',
    { jobId },
  );
  return response.data;
}
