export interface Lead {
  id: string;
  companyName: string;
  domain: string | null;
  employerWebsite: string | null;
  email: string | null;
  emailConfidence: number | null;
  jobPublisher: string | null;
  jobTitle: string;
  location: string;
  applyLink: string;
  contacted: boolean;
  createdAt: string;
}

export interface LeadStats {
  total: number;
  contacted: number;
  uncontacted: number;
}

export interface FetchJobsResponse {
  fetched: number;
  inserted: number;
  keyword: string;
  location: string;
  platform: string | null;
  skipped: number;
  total: number;
}

export type ChatMessageRole = 'assistant' | 'user';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  /** OpenRouter: returned on assistant turns; sent back unchanged on follow-ups. */
  reasoning_details?: unknown;
}

export interface ChatCompleteResponse {
  content: string;
  reasoning_details?: unknown;
}

export interface FetchJobsFilters {
  keyword: string;
  location: string;
  platform: string;
  datePosted: 'all' | 'today' | '3days' | 'week' | 'month';
  workFromHome: boolean;
  employmentTypes: string[];
  jobRequirements: string[];
}

export interface SendEmailsResponse {
  attempted: number;
  failed: number;
  sent: number;
  skipped: number;
}

export type EmailDraftSource = 'openai' | 'template';

export interface EmailDraftResponse {
  body: string;
  lead: Pick<
    Lead,
    | 'id'
    | 'companyName'
    | 'jobTitle'
    | 'location'
    | 'email'
    | 'contacted'
  >;
  source: EmailDraftSource;
  subject: string;
}

export interface SendOneEmailResponse {
  contactedLeadId: string;
  to: string;
}

export interface UpworkProposalSummary {
  body: string;
  createdAt: string;
  id: string;
}

export interface UpworkJob {
  id: string;
  sourceJobId: string;
  url: string;
  title: string;
  description: string;
  publishedAt: string | null;
  skills: unknown;
  budgetType: string | null;
  budgetTotalUsd: string | null;
  hourlyMinUsd: number | null;
  hourlyMaxUsd: number | null;
  experienceLevel: string | null;
  location: string | null;
  projectLength: string | null;
  hoursPerWeek: string | null;
  proposals: string | null;
  interviewing: string | null;
  invitesSent: string | null;
  categoryName: string | null;
  categoryGroupName: string | null;
  clientTotalHires: number | null;
  clientActiveHires: number | null;
  clientSpent: string | null;
  clientMemberSince: string | null;
  clientCompanySize: string | null;
  clientScore: number | null;
  clientFeedbackCount: number | null;
  premium: boolean;
  totalJobsWithHires: number | null;
  openCount: number | null;
  isContractToHire: boolean | null;
  isEnterprise: boolean | null;
  createdAt: string;
  updatedAt: string;
  /** Latest saved draft from proposal generator, if any. */
  latestProposal?: UpworkProposalSummary | null;
}

export interface FetchUpworkJobsParams {
  q: string;
  skills: string;
  skills_match_mode: string;
  hourly_min_usd: number;
  hourly_max_usd: number;
  fixed_min_usd: number;
  fixed_max_usd: number;
  limit: number;
  next_cursor?: string;
}

export interface FetchUpworkJobsResult {
  excludedByFilter: number;
  inserted: number;
  nextCursor: string | null;
  skipped: number;
  totalFromApi: number;
}

export interface GenerateUpworkProposalResponse {
  proposal: string;
  retrievedSummaries: string[];
  draftId: string;
}
