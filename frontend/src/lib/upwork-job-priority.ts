import type { UpworkJob } from '@/types/api';

const PRIMARY_KEYWORDS = [
  'ai assistant',
  'ai chatbot',
  'llm',
  'openai',
  'langchain',
  'rag',
  'retrieval augmented',
  'saas',
  'full stack',
  'fullstack',
  'react',
  'next.js',
  'nextjs',
  'node.js',
  'nodejs',
  'ai agent',
  'conversational ai',
  'voice ai',
  'elevenlabs',
  'deepseek',
  'mistral',
  'vector database',
  'ai integration',
  'crm',
  'dashboard',
  'api integration',
  'rest api',
] as const;

const SECONDARY_KEYWORDS = [
  'typescript',
  'nestjs',
  'postgresql',
  'mysql',
  'redis',
  'aws',
  'docker',
  'vercel',
  'real-time',
  'websocket',
  'webhook',
  'mobile app',
  'react native',
  'nuxt',
  'vue',
  'vuejs',
  'express',
  'mongodb',
  'prisma',
] as const;

const DISQUALIFYING_KEYWORDS = [
  'wordpress',
  'shopify',
  'woocommerce',
  'php',
  'laravel',
  'flutter only',
  'java only',
  'python only',
  'django only',
  'ruby on rails',
  'angular',
  'svelte',
  'blockchain',
  'smart contract',
  'solidity',
  'web3',
  'unity',
  'game dev',
  'devops only',
  'data science',
  'machine learning model training',
  'ios swift',
  'android kotlin',
  'c#',
  '.net',
  'asp.net',
] as const;

function calculateSemanticFit(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  const disqualifiedBy = DISQUALIFYING_KEYWORDS.filter((kw) => text.includes(kw));
  if (disqualifiedBy.length > 0) {
    return { disqualified: true, disqualifiedBy, score: 0 };
  }
  const matchedPrimary = PRIMARY_KEYWORDS.filter((kw) => text.includes(kw));
  const matchedSecondary = SECONDARY_KEYWORDS.filter((kw) => text.includes(kw));
  const rawScore = matchedPrimary.length * 3 + matchedSecondary.length;
  return {
    disqualified: false,
    disqualifiedBy: [] as string[],
    score: Math.min(100, Math.round((rawScore / 25) * 100)),
  };
}

export type UpworkPriorityTier = 1 | 2 | 3 | 4;

export type UpworkJobPriority = {
  label: string;
  reasons: string[];
  score: number;
  tier: UpworkPriorityTier;
  urgency: 'HIGH' | 'MEDIUM' | 'SKIP' | 'URGENT';
};

const MS_HOUR = 60 * 60 * 1000;

export function parseClientSpentUsd(raw: string | null): number | null {
  if (!raw?.trim()) {
    return null;
  }
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Higher = fewer competing proposals (better for you). Max ~40. */
export function scoreProposalCompetition(proposals: string | null): number {
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

/** Fresh posts get a boost. Max ~35. */
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

function accountTenureYears(memberSince: string | null): number | null {
  if (!memberSince?.trim()) {
    return null;
  }
  const d = new Date(memberSince.trim());
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

/** Spend + rating + history. Max ~38 before bonuses. */
export function scoreClientQuality(job: UpworkJob): {
  established: boolean;
  points: number;
} {
  let points = 0;
  const spent = parseClientSpentUsd(job.clientSpent);
  const score = job.clientScore;
  const reviews = job.clientFeedbackCount ?? 0;
  const years = accountTenureYears(job.clientMemberSince);

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

export function scoreUpworkJob(job: UpworkJob): UpworkJobPriority {
  const spent = parseClientSpentUsd(job.clientSpent);
  const prop = scoreProposalCompetition(job.proposals);
  const rec = scoreRecency(job.publishedAt);
  const cli = scoreClientQuality(job);
  const semantic = calculateSemanticFit(job.title, job.description);
  const proposalCompetitionScore = Math.max(0, Math.min(100, (prop / 40) * 100));
  const recencyScore = Math.max(0, Math.min(100, (rec.points / 35) * 100));
  const clientQualityScore = Math.max(0, Math.min(100, (cli.points / 45) * 100));
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
    reasons.push(`Disqualifying keywords: ${semantic.disqualifiedBy.slice(0, 3).join(', ')}`);
  } else if (semantic.score >= 70) {
    reasons.push('Strong semantic match with target niche');
  } else if (semantic.score >= 45) {
    reasons.push('Moderate semantic alignment');
  }

  return {
    label,
    reasons: reasons.length ? reasons : ['Review manually'],
    score,
    tier,
    urgency: tier === 1 ? 'URGENT' : tier === 2 ? 'HIGH' : tier === 3 ? 'MEDIUM' : 'SKIP',
  };
}

export function tierRowClass(tier: UpworkPriorityTier): string {
  switch (tier) {
    case 1:
      return 'bg-emerald-50/95 border-l-[5px] border-emerald-500 hover:bg-emerald-100/80';
    case 2:
      return 'bg-lime-50/90 border-l-[5px] border-lime-500 hover:bg-lime-100/70';
    case 3:
      return 'bg-amber-50/85 border-l-[5px] border-amber-400 hover:bg-amber-100/65';
    default:
      return 'border-l-[5px] border-slate-200 bg-white hover:bg-slate-50/80';
  }
}

export function tierBadgeClass(tier: UpworkPriorityTier): string {
  switch (tier) {
    case 1:
      return 'bg-emerald-600 text-white';
    case 2:
      return 'bg-lime-600 text-white';
    case 3:
      return 'bg-amber-500 text-amber-950';
    default:
      return 'bg-slate-200 text-slate-700';
  }
}
