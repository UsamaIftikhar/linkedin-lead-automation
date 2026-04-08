export interface LeadSeedInput {
  companyName: string;
  domain?: string | null;
  employerWebsite?: string | null;
  jobTitle: string;
  location: string;
  applyLink: string;
  jobPublisher?: string | null;
}

export interface LeadEmailUpdateInput {
  leadId: string;
  email: string;
  confidence?: number | null;
}

export interface LeadStats {
  total: number;
  contacted: number;
  uncontacted: number;
}
