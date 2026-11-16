import { KEYWORDS } from '../../config/keywords';
import { MappedUpworkJob } from '../blackfalcon.mapper';

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

export interface KeywordFilterResult extends FilterResult {
  matchedKeywords: string[];
}

export interface FilterPipelineOptions {
  now?: Date;
  maxAgeMinutes?: number;
  maxProposals?: number;
  keywords?: readonly string[];
  minFixedBudget: number;
  minHourlyRate: number;
}

const EXCLUDED_LOCATIONS = new Set(['pakistan', 'pk', 'pak', 'india', 'in', 'ind']);
const NON_NEW_CHANGE_TYPES = new Set(['UPDATED', 'REAPPEARED', 'UNCHANGED', 'EXPIRED']);

/** Rule 1: Known non-new change */
export function checkChangeType(job: MappedUpworkJob): FilterResult {
  if (job.changeType && NON_NEW_CHANGE_TYPES.has(job.changeType)) {
    return {
      passed: false,
      reason: `non-new change type: ${job.changeType}`,
    };
  }
  return { passed: true };
}

/** Rule 2: Not a repost */
export function checkNotRepost(job: MappedUpworkJob): FilterResult {
  if (job.isRepost === true) {
    return { passed: false, reason: 'job is a repost' };
  }
  return { passed: true };
}

/** Rule 3: Freshness (postedAt >= now - 10 minutes) */
export function checkFreshness(
  job: MappedUpworkJob,
  now = new Date(),
  maxAgeMinutes = 10,
): FilterResult {
  const cutoff = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);
  if (job.postedAt.getTime() < cutoff.getTime()) {
    return {
      passed: false,
      reason: `job posted at ${job.postedAt.toISOString()} is older than ${maxAgeMinutes} minutes`,
    };
  }
  return { passed: true };
}

/** Rule 4: Payment verified */
export function checkPaymentVerified(job: MappedUpworkJob): FilterResult {
  if (job.paymentVerified !== true) {
    return { passed: false, reason: 'client payment not verified' };
  }
  return { passed: true };
}

/** Rule 5: Location (reject Pakistan and India; reject if country and countryCode are both null) */
export function checkLocation(job: MappedUpworkJob): FilterResult {
  const country = job.country?.trim().toLowerCase() || null;
  const countryCode = job.countryCode?.trim().toLowerCase() || null;

  if (!country && !countryCode) {
    return { passed: false, reason: 'missing country and country code' };
  }

  if (country && EXCLUDED_LOCATIONS.has(country)) {
    return { passed: false, reason: `excluded country: ${job.country}` };
  }

  if (countryCode && EXCLUDED_LOCATIONS.has(countryCode)) {
    return { passed: false, reason: `excluded country code: ${job.countryCode}` };
  }

  return { passed: true };
}

/** Rule 6: Proposals (reject if proposalCount is null or >= 20) */
export function checkProposalCount(
  job: MappedUpworkJob,
  maxProposals = 20,
): FilterResult {
  if (job.proposalCount === null || job.proposalCount === undefined) {
    return { passed: false, reason: 'missing proposal count' };
  }
  if (job.proposalCount >= maxProposals) {
    return {
      passed: false,
      reason: `proposals (${job.proposalCount}) >= ${maxProposals}`,
    };
  }
  return { passed: true };
}

/** Rule 7: Keywords (case-insensitive search in title, description, and skills) */
export function checkKeywords(
  job: MappedUpworkJob,
  keywords: readonly string[] = KEYWORDS,
): KeywordFilterResult {
  const matchedKeywords: string[] = [];

  const titleLower = job.title.toLowerCase();
  const descLower = (job.description ?? '').toLowerCase();
  const skillsLower = job.skills.map((s) => s.toLowerCase());

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    const matchesTitle = titleLower.includes(kwLower);
    const matchesDesc = descLower.includes(kwLower);
    const matchesSkill = skillsLower.some((s) => s.includes(kwLower));

    if (matchesTitle || matchesDesc || matchesSkill) {
      matchedKeywords.push(kw);
    }
  }

  if (matchedKeywords.length === 0) {
    return {
      passed: false,
      reason: 'no targeted keywords matched',
      matchedKeywords: [],
    };
  }

  return {
    passed: true,
    matchedKeywords,
  };
}

/** Rule 8: Budget */
export function checkBudget(
  job: MappedUpworkJob,
  options: { minFixedBudget: number; minHourlyRate: number },
): FilterResult {
  const type = job.jobType?.toUpperCase() || null;

  if (type === 'FIXED') {
    if (job.fixedBudget === null || job.fixedBudget === undefined) {
      return { passed: false, reason: 'missing fixed budget amount' };
    }
    if (job.fixedBudget <= options.minFixedBudget) {
      return {
        passed: false,
        reason: `fixed budget (${job.fixedBudget}) <= ${options.minFixedBudget}`,
      };
    }
    return { passed: true };
  }

  if (type === 'HOURLY') {
    if (job.hourlyMin === null || job.hourlyMin === undefined) {
      return { passed: false, reason: 'missing hourly minimum budget' };
    }
    if (job.hourlyMin <= options.minHourlyRate) {
      return {
        passed: false,
        reason: `hourly minimum (${job.hourlyMin}) <= ${options.minHourlyRate}`,
      };
    }
    return { passed: true };
  }

  return {
    passed: false,
    reason: `unsupported or missing job type: ${job.jobType || 'none'}`,
  };
}

export interface PipelineEvaluationResult {
  passed: boolean;
  rejectionReason: string | null;
  matchedKeywords: string[];
}

/**
 * Runs the full 8-step filter pipeline in exact order.
 * Returns immediately on the first failing rule with rejection reason.
 */
export function evaluateJobFilters(
  job: MappedUpworkJob,
  options: FilterPipelineOptions,
): PipelineEvaluationResult {
  // 1. Change type
  const r1 = checkChangeType(job);
  if (!r1.passed) {
    return { passed: false, rejectionReason: r1.reason!, matchedKeywords: [] };
  }

  // 2. Not repost
  const r2 = checkNotRepost(job);
  if (!r2.passed) {
    return { passed: false, rejectionReason: r2.reason!, matchedKeywords: [] };
  }

  // 3. Freshness
  const r3 = checkFreshness(job, options.now, options.maxAgeMinutes ?? 10);
  if (!r3.passed) {
    return { passed: false, rejectionReason: r3.reason!, matchedKeywords: [] };
  }

  // 4. Payment verified
  const r4 = checkPaymentVerified(job);
  if (!r4.passed) {
    return { passed: false, rejectionReason: r4.reason!, matchedKeywords: [] };
  }

  // 5. Location
  const r5 = checkLocation(job);
  if (!r5.passed) {
    return { passed: false, rejectionReason: r5.reason!, matchedKeywords: [] };
  }

  // 6. Proposals
  const r6 = checkProposalCount(job, options.maxProposals ?? 20);
  if (!r6.passed) {
    return { passed: false, rejectionReason: r6.reason!, matchedKeywords: [] };
  }

  // 7. Keywords
  const r7 = checkKeywords(job, options.keywords ?? KEYWORDS);
  if (!r7.passed) {
    return { passed: false, rejectionReason: r7.reason!, matchedKeywords: [] };
  }

  // 8. Budget
  const r8 = checkBudget(job, {
    minFixedBudget: options.minFixedBudget,
    minHourlyRate: options.minHourlyRate,
  });
  if (!r8.passed) {
    return {
      passed: false,
      rejectionReason: r8.reason!,
      matchedKeywords: r7.matchedKeywords,
    };
  }

  return {
    passed: true,
    rejectionReason: null,
    matchedKeywords: r7.matchedKeywords,
  };
}
