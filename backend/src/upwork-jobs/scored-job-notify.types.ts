import type { UpworkJobPriority } from './upwork-job-score';

/** Payload for cron Slack/WhatsApp notifications (and bot per-job posts when `jobId` is set). */
export type ScoredUpworkJobForNotify = {
  budgetLine: string;
  clientLine: string;
  /** DB UUID when the row exists (required for Slack thread → generate proposal). */
  jobId?: string;
  location: string | null;
  postedLine: string;
  priority: UpworkJobPriority;
  proposalsDisplay: string;
  sourceJobId: string;
  title: string;
  url: string;
};
