import { calculateSemanticFit } from './job-fit.util';

/**
 * Mirrors frontend `upwork-job-priority.ts` so cron/Slack use the same opportunity score.
 */

export type UpworkPriorityTier = 1 | 2 | 3 | 4;

export type UpworkJobScoreInput = {
  description?: string | null;
  budgetTotalUsd?: string | null;
  budgetType?: string | null;
  clientFeedbackCount?: number | null;
  clientMemberSince?: string | null;
  clientScore?: number | null;
  clientSpent?: string | null;
  hourlyMaxUsd?: number | null;
  hourlyMinUsd?: number | null;
  hoursPerWeek?: string | null;
  premium?: boolean | null;
  proposals?: string | null;
  publishedAt?: Date | string | null;
  title?: string | null;
};

export type UpworkJobPriority = {
  label: string;
  proposalHint: string;
  reasons: string[];
  score: number;
  tier: UpworkPriorityTier;
  urgency: 'HIGH' | 'MEDIUM' | 'SKIP' | 'URGENT';
};

const MS_HOUR = 60 * 60 * 1000;

function publishedToIso(
  publishedAt: Date | string | null | undefined,
): string | null {
  if (publishedAt == null) {
    return null;
  }
  if (publishedAt instanceof Date) {
    return Number.isNaN(publishedAt.getTime())
      ? null
      : publishedAt.toISOString();
  }
  return publishedAt;
}

export function parseClientSpentUsd(
  raw: string | null | undefined,
): number | null {
  if (!raw?.trim()) {
    return null;
  }
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function scoreProposalCompetition(
  proposals: string | null | undefined,
): number {
  if (!proposals?.trim()) {
    return 10;
  }
  const s = proposals.trim().toLowerCase();

  if (s.includes('less than 5')) {
    return 40;
  }

  const between = s.match(/(\d+)\s*to\s*(\d+)/);
  if (between) {
    const hi = Math.max(Number(between[1]), Number(between[2]));
    if (hi < 5) {
      return 40;
    }
    if (hi <= 10) {
      return 34;
    }
    if (hi <= 15) {
      return 28;
    }
    if (hi <= 20) {
      return 22;
    }
    if (hi < 50) {
      return 12;
    }
    return 0;
  }

  const plus = s.match(/(\d+)\s*\+/);
  if (plus) {
    const n = Number(plus[1]);
    return n >= 50 ? 0 : n <= 20 ? 18 : 6;
  }

  const lessThan = s.match(/less than (\d+)/);
  if (lessThan) {
    const cap = Number(lessThan[1]);
    if (cap <= 5) {
      return 40;
    }
    if (cap <= 10) {
      return 34;
    }
    if (cap <= 20) {
      return 24;
    }
    if (cap <= 50) {
      return 12;
    }
    return 4;
  }

  const nums = s.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length) {
    const hi = Math.max(...nums);
    if (hi < 5) {
      return 38;
    }
    if (hi <= 10) {
      return 32;
    }
    if (hi <= 20) {
      return 20;
    }
    if (hi < 50) {
      return 10;
    }
    return 0;
  }

  return 10;
}

export function scoreRecency(publishedAt: string | null): {
  hoursAgo: number | null;
  points: number;
} {
  if (!publishedAt) {
    return { hoursAgo: null, points: 0 };
  }
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) {
    return { hoursAgo: null, points: 0 };
  }
  const hoursAgo = (Date.now() - t) / MS_HOUR;
  if (hoursAgo < 0) {
    return { hoursAgo: 0, points: 20 };
  }
  if (hoursAgo <= 2) {
    return { hoursAgo, points: 35 };
  }
  if (hoursAgo <= 3) {
    return { hoursAgo, points: 30 };
  }
  if (hoursAgo <= 6) {
    return { hoursAgo, points: 22 };
  }
  if (hoursAgo <= 24) {
    return { hoursAgo, points: 15 };
  }
  if (hoursAgo <= 72) {
    return { hoursAgo, points: 8 };
  }
  return { hoursAgo, points: 0 };
}

function accountTenureYears(
  memberSince: string | null | undefined,
): number | null {
  if (!memberSince?.trim()) {
    return null;
  }
  const d = new Date(memberSince.trim());
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

export function scoreClientQuality(job: UpworkJobScoreInput): {
  established: boolean;
  points: number;
} {
  let points = 0;
  const spent = parseClientSpentUsd(job.clientSpent ?? null);
  const score = job.clientScore;
  const reviews = job.clientFeedbackCount ?? 0;
  const years = accountTenureYears(job.clientMemberSince ?? null);

  if (spent != null) {
    if (spent >= 100_000) {
      points += 18;
    } else if (spent >= 10_000) {
      points += 14;
    } else if (spent >= 1_000) {
      points += 10;
    } else if (spent >= 100) {
      points += 6;
    }
  }

  if (score != null) {
    if (score >= 4.95 && reviews >= 15) {
      points += 14;
    } else if (score >= 4.85 && reviews >= 8) {
      points += 11;
    } else if (score >= 4.7 && reviews >= 5) {
      points += 8;
    } else if (score >= 4.5 && reviews >= 3) {
      points += 5;
    } else if (score >= 4.2) {
      points += 3;
    }
  }

  if (years != null) {
    if (years >= 5) {
      points += 6;
    } else if (years >= 3) {
      points += 4;
    } else if (years >= 2) {
      points += 2;
    }
  }

  if (job.premium) {
    points += 3;
  }

  const established =
    (score != null && score >= 4.5 && reviews >= 3) ||
    (spent != null && spent >= 1_000) ||
    (years != null && years >= 2);

  if (established) {
    points += 4;
  }

  if (
    (score === 0 || score == null) &&
    reviews === 0 &&
    spent == null &&
    (years == null || years < 0.25)
  ) {
    points -= 8;
  }

  return { established, points: Math.max(0, points) };
}

function proposalHintForTier(tier: UpworkPriorityTier): string {
  switch (tier) {
    case 1:
      return 'Send immediately — high semantic fit + strong client. Use Template 1 or 2. Spend 10-12 connects.';
    case 2:
      return 'Send within 2 hours — good fit, competitive window open. Use Template 2 or 3. Spend 8-10 connects.';
    case 3:
      return 'Apply if you have connects to spare. Customize template carefully. Spend 6-8 connects.';
    default:
      return 'Not worth applying — low fit, high competition, or weak client.';
  }
}

function urgencyForTier(
  tier: UpworkPriorityTier,
): UpworkJobPriority['urgency'] {
  if (tier === 1) {
    return 'URGENT';
  }
  if (tier === 2) {
    return 'HIGH';
  }
  if (tier === 3) {
    return 'MEDIUM';
  }
  return 'SKIP';
}

function normalize(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function scoreUpworkJobRecord(
  job: UpworkJobScoreInput,
): UpworkJobPriority {
  const spent = parseClientSpentUsd(job.clientSpent ?? null);
  const prop = scoreProposalCompetition(job.proposals);
  const rec = scoreRecency(publishedToIso(job.publishedAt));
  const cli = scoreClientQuality(job);
  const semantic = calculateSemanticFit(
    job.title ?? null,
    job.description ?? null,
  );

  const proposalCompetitionScore = normalize(prop, 40);
  const recencyScore = normalize(rec.points, 35);
  const clientQualityScore = normalize(cli.points, 45);
  const semanticFitScore = semantic.score;
  const score = Math.round(
    proposalCompetitionScore * 0.25 +
      recencyScore * 0.2 +
      clientQualityScore * 0.25 +
      semanticFitScore * 0.3,
  );

  let tier: UpworkPriorityTier = 4;
  let label = 'Skip';

  if (score >= 80) {
    tier = 1;
    label = 'Perfect Match';
  } else if (score >= 65) {
    tier = 2;
    label = 'Strong Fit';
  } else if (score >= 45) {
    tier = 3;
    label = 'Worth Applying';
  }

  const reasons: string[] = [];
  if (prop >= 28) {
    reasons.push('Low proposal competition');
  }
  if (rec.points >= 28) {
    reasons.push('Posted in last ~3h');
  } else if (rec.points >= 15) {
    reasons.push('Recent post');
  }
  if (cli.established) {
    reasons.push('Solid client signals');
  }
  if (spent != null && spent >= 10_000) {
    reasons.push('High historical spend');
  }
  if (semantic.disqualified) {
    reasons.push(
      `Disqualifying keywords: ${semantic.disqualifiedBy.slice(0, 3).join(', ')}`,
    );
  } else if (semantic.score >= 70) {
    reasons.push('Strong semantic match with target niche');
  } else if (semantic.score >= 45) {
    reasons.push('Moderate semantic alignment');
  }

  return {
    label,
    proposalHint: proposalHintForTier(tier),
    reasons: reasons.length ? reasons : ['Review manually'],
    score,
    tier,
    urgency: urgencyForTier(tier),
  };
}

export function formatBudgetLine(job: UpworkJobScoreInput): string {
  const bt = job.budgetType?.toLowerCase();
  if (bt === 'hourly') {
    if (job.hourlyMinUsd != null && job.hourlyMaxUsd != null) {
      return `$${job.hourlyMinUsd}–$${job.hourlyMaxUsd}/hr${job.hoursPerWeek ? ` · ${job.hoursPerWeek}` : ''}`;
    }
    return 'Hourly';
  }
  if (bt === 'fixed' && job.budgetTotalUsd?.trim()) {
    return `Fixed ${job.budgetTotalUsd.trim()}`;
  }
  if (job.budgetTotalUsd?.trim()) {
    return job.budgetTotalUsd.trim();
  }
  return job.budgetType?.trim() || 'Budget n/a';
}

export function formatPostedLine(job: UpworkJobScoreInput): string {
  const iso = publishedToIso(job.publishedAt);
  if (!iso) {
    return 'Posted: unknown';
  }
  const d = new Date(iso);
  const { hoursAgo } = scoreRecency(iso);
  const rel =
    hoursAgo != null
      ? hoursAgo < 1
        ? '<1h ago'
        : hoursAgo < 24
          ? `${Math.round(hoursAgo)}h ago`
          : `${Math.round(hoursAgo / 24)}d ago`
      : '';
  return `Posted: ${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${rel ? ` (${rel})` : ''}`;
}

export function formatClientLine(job: UpworkJobScoreInput): string {
  const parts: string[] = [];
  if (job.clientScore != null) {
    parts.push(
      `⭐ ${job.clientScore}${job.clientFeedbackCount != null ? ` (${job.clientFeedbackCount} reviews)` : ''}`,
    );
  }
  if (job.clientSpent?.trim()) {
    parts.push(`Spent ${job.clientSpent.trim()}`);
  }
  return parts.length ? parts.join(' · ') : 'Limited data on file';
}
