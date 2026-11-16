import type { ScoredUpworkJobForNotify } from '../upwork-jobs/scored-job-notify.types';
import {
  connectsSpendHint,
  type UpworkPriorityTier,
} from '../upwork-jobs/upwork-job-score';

function escapeSlackLinkLabel(text: string): string {
  return text
    .replace(/\|/g, '·')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .slice(0, 300);
}

function postedDetail(postedLine: string): string {
  return postedLine.replace(/^Posted:\s*/i, '').trim() || postedLine;
}

function tierEmoji(tier: UpworkPriorityTier): string {
  switch (tier) {
    case 1:
      return '🟢';
    case 2:
      return '🟡';
    case 3:
      return '🟠';
    default:
      return '⚪';
  }
}

/** Shared mrkdwn for one job (each job = one Slack message). */
export function formatUpworkJobMrkdwnSection(
  job: ScoredUpworkJobForNotify,
): string {
  const p = job.priority;
  const te = tierEmoji(p.tier);
  const link = `<${job.url}|${escapeSlackLinkLabel(job.title)}>`;
  const reasons = p.reasons.join(' · ');
  const loc = job.location?.trim() || '—';
  const posted = postedDetail(job.postedLine);
  return (
    `${te} *${p.label}* · Opportunity score *${p.score}*\n` +
    `📋 *Proposal guidance:* _${p.proposalHint}_\n\n` +
    `${link}\n\n` +
    `🎯 Semantic fit: *${job.semanticFitScore}/100*` +
    `${job.matchedKeywords.length ? ` — Keywords: ${job.matchedKeywords.slice(0, 5).join(', ')}` : ''}\n` +
    `📋 Recommended template: *Template ${job.detectedTemplate}* (${job.detectedTemplateName})\n` +
    `⚡ Urgency: *${job.urgency}*\n` +
    `🔗 Connects to spend: *${connectsSpendHint(p.tier)}*\n` +
    `📍 ${loc} · 💰 ${job.budgetLine}\n` +
    `📊 Proposals: ${job.proposalsDisplay} · 🕐 ${posted}\n` +
    `👤 ${job.clientLine}\n\n` +
    `💡 _${reasons}_`
  );
}

export function buildSingleJobSlackBlocks(
  job: ScoredUpworkJobForNotify,
): Record<string, unknown>[] {
  return [
    {
      text: {
        emoji: true,
        text: '📌 New Upwork job',
        type: 'plain_text',
      },
      type: 'header',
    },
    {
      text: {
        text: formatUpworkJobMrkdwnSection(job),
        type: 'mrkdwn',
      },
      type: 'section',
    },
    {
      elements: [
        {
          text: '✍️ _Reply in this thread with_ `generate proposal` _to draft a proposal._',
          type: 'mrkdwn',
        },
      ],
      type: 'context',
    },
  ];
}

export interface SlackBlackfalconJobPayload {
  dbId?: string;
  upworkJobId?: string;
  title: string;
  url: string;
  score: number;
  budgetText: string | null;
  country: string | null;
  countryCode: string | null;
  proposalCount: number | null;
  matchedKeywords: string[];
  postedAt: Date;
  proposalGuidance?: string | null;
  semanticFitScore?: number | null;
  semanticKeywords?: string[];
  detectedTemplate?: number | null;
  detectedTemplateName?: string | null;
  clientRating?: number | null;
  clientReviewCount?: number | null;
  clientTotalSpent?: number | null;
}

/**
 * Builds Slack Block Kit message per Step 7:
 * - Title linked to url
 * - Proposal guidance
 * - Semantic fit & keywords
 * - Recommended template
 * - Client rating, review count, total spent
 * - Opportunity score
 * - Budget
 * - Country
 * - Proposal count
 * - Posted time
 * - "View job" button
 * - NO contact or social fields
 */
export function buildBlackfalconSlackBlocks(
  job: SlackBlackfalconJobPayload,
): Record<string, unknown>[] {
  const link = `<${job.url}|*${escapeSlackLinkLabel(job.title)}*>`;
  const location = job.country || job.countryCode || 'Unknown';
  const budget = job.budgetText || 'Hourly (unspecified / open to offers)';
  const proposals = job.proposalCount != null ? String(job.proposalCount) : 'Unknown';
  const posted = job.postedAt.toUTCString();

  const keywordsList =
    job.semanticKeywords && job.semanticKeywords.length
      ? job.semanticKeywords
      : job.matchedKeywords;
  const keywordsStr = keywordsList.length ? keywordsList.join(', ') : 'None';

  const guidance =
    job.proposalGuidance ||
    (job.score >= 80
      ? 'Send immediately — high semantic fit + strong client. Spend 10-12 connects.'
      : job.score >= 65
      ? 'Send within 2 hours — good fit, competitive window open. Spend 8-10 connects.'
      : job.score >= 45
      ? 'Apply if you have connects to spare. Customize template carefully. Spend 6-8 connects.'
      : 'Not worth applying — low fit, high competition, or weak client.');

  const semanticFitVal =
    job.semanticFitScore != null ? job.semanticFitScore : job.score;
  const templateId = job.detectedTemplate ?? 2;
  const templateName = job.detectedTemplateName ?? 'SaaS / CRM / Dashboard';

  const clientReviews = job.clientReviewCount ?? 0;
  const clientRating = job.clientRating != null ? job.clientRating : 0;
  const spentStr =
    job.clientTotalSpent != null && job.clientTotalSpent > 0
      ? ` · $${Math.round(job.clientTotalSpent).toLocaleString()} spent`
      : '';
  const clientLine = `👤 ⭐ ${clientRating} (${clientReviews} reviews)${spentStr}`;

  const textLines = [
    `🎯 ${link}`,
    `📋 *Proposal guidance:* ${guidance}`,
    `🎯 *Semantic fit:* ${semanticFitVal}/100 — Keywords: ${keywordsStr}`,
    `📋 *Recommended template:* Template ${templateId} (${templateName})`,
    `⭐ *Score:* ${job.score}/100`,
    `💰 *Budget:* ${budget}`,
    `📍 *Country:* ${location}`,
    `📊 *Proposals:* ${proposals}`,
    clientLine,
    `🕐 *Posted Time (UTC):* ${posted}`,
  ].join('\n');

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚡ Qualified Upwork Lead',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: textLines,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View job',
            emoji: true,
          },
          url: job.url,
          action_id: 'view_job_button',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '✍️ _Reply in this thread with_ `generate proposal` _to draft a proposal._',
        },
      ],
    },
  ];
}

