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
  title: string;
  url: string;
  score: number;
  budgetText: string | null;
  country: string | null;
  countryCode: string | null;
  proposalCount: number | null;
  matchedKeywords: string[];
  postedAt: Date;
}

/**
 * Builds Slack Block Kit message per Step 7:
 * - Title linked to url
 * - Score
 * - Budget
 * - Country
 * - Proposal count
 * - Matched keywords
 * - Posted time
 * - "View job" button
 * - NO contact or social fields
 */
export function buildBlackfalconSlackBlocks(
  job: SlackBlackfalconJobPayload,
): Record<string, unknown>[] {
  const link = `<${job.url}|*${escapeSlackLinkLabel(job.title)}*>`;
  const location = job.country || job.countryCode || 'Unknown';
  const budget = job.budgetText || 'Not specified';
  const proposals = job.proposalCount != null ? String(job.proposalCount) : 'Unknown';
  const keywords = job.matchedKeywords.length ? job.matchedKeywords.join(', ') : 'None';
  const posted = job.postedAt.toUTCString();

  const textLines = [
    `🎯 ${link}`,
    `⭐ *Score:* ${job.score}/100`,
    `💰 *Budget:* ${budget}`,
    `📍 *Country:* ${location}`,
    `📊 *Proposals:* ${proposals}`,
    `🏷️ *Matched Keywords:* ${keywords}`,
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
  ];
}

