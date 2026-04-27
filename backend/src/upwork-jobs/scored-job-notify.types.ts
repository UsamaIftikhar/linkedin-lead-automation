import type { UpworkJobPriority } from './upwork-job-score';

/** Payload for cron Slack/WhatsApp notifications (and bot per-job posts when `jobId` is set). */
export type ScoredUpworkJobForNotify = {
  budgetLine: string;
  clientLine: string;
  detectedTemplate: 1 | 2 | 3;
  detectedTemplateName: string;
  disqualifiedBy: string[];
  /** DB UUID when the row exists (required for Slack thread → generate proposal). */
  jobId?: string;
  location: string | null;
  matchedKeywords: string[];
  postedLine: string;
  priority: UpworkJobPriority;
  proposalsDisplay: string;
  semanticFitScore: number;
  sourceJobId: string;
  title: string;
  urgency: UpworkJobPriority['urgency'];
  url: string;
};
