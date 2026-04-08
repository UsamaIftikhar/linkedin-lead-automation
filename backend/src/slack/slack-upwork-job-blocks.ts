import type { ScoredUpworkJobForNotify } from '../upwork-jobs/scored-job-notify.types';
import type { UpworkPriorityTier } from '../upwork-jobs/upwork-job-score';

function escapeSlackLinkLabel(text: string): string {
  return text.replace(/\|/g, '·').replace(/</g, '‹').replace(/>/g, '›').slice(0, 300);
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
export function formatUpworkJobMrkdwnSection(job: ScoredUpworkJobForNotify): string {
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
