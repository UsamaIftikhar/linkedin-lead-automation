export interface RawBlackfalconItem {
  jobId?: string | number | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  publishTime?: string | null;
  clientPaymentVerified?: boolean | null;
  clientCountry?: string | null;
  clientCountryCode?: string | null;
  totalApplicants?: number | null;
  skills?: unknown;
  jobType?: string | null;
  budgetAmount?: number | null;
  hourlyBudgetMin?: number | null;
  hourlyBudgetMax?: number | null;
  budgetCurrency?: string | null;
  clientRating?: number | null;
  clientReviewCount?: number | null;
  clientTotalSpent?: number | null;
  changeType?: string | null;
  isRepost?: boolean | null;
  [key: string]: unknown;
}

export interface MappedUpworkJob {
  upworkJobId: string;
  sourceJobId: string;
  title: string;
  description: string | null;
  url: string;
  postedAt: Date;
  publishedAt: Date;
  paymentVerified: boolean | null;
  country: string | null;
  countryCode: string | null;
  proposalCount: number | null;
  skills: string[];
  jobType: string | null;
  fixedBudget: number | null;
  hourlyMin: number | null;
  hourlyMax: number | null;
  budgetCurrency: string | null;
  budgetText: string | null;
  clientRating: number | null;
  clientReviewCount: number | null;
  clientTotalSpent: number | null;
  changeType: string | null;
  isRepost: boolean;
}

function formatBudgetText(input: {
  jobType?: string | null;
  fixedBudget?: number | null;
  hourlyMin?: number | null;
  hourlyMax?: number | null;
  currency?: string | null;
}): string | null {
  const curr = input.currency || '$';
  const prefix = curr === 'USD' ? '$' : curr ? `${curr} ` : '$';

  if (input.hourlyMin != null && input.hourlyMax != null) {
    return `${prefix}${input.hourlyMin}–${prefix}${input.hourlyMax}/hr`;
  }
  if (input.hourlyMin != null) {
    return `${prefix}${input.hourlyMin}/hr`;
  }
  if (input.fixedBudget != null) {
    return `${prefix}${input.fixedBudget}`;
  }
  return null;
}

/**
 * Pure function mapping a raw item from blackfalcondata/upwork-scraper to MappedUpworkJob.
 *
 * Strict Rules:
 * - Never map or store contactName, contactEmail, contactPhone, extractedEmails,
 *   extractedPhones, extractedUrls, or socialProfiles.
 * - Never coerce null to true or false. Never default a missing number to 0.
 * - If jobId, title, url, or publishTime is missing or invalid, throw with only the job ID (not raw item).
 */
export function mapBlackfalconItem(raw: RawBlackfalconItem): MappedUpworkJob {
  const rawId = raw.jobId;
  const jobIdStr =
    rawId !== undefined && rawId !== null ? String(rawId).trim() : '';

  if (!jobIdStr) {
    throw new Error('Missing required field: jobId');
  }

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : null;
  if (!title) {
    throw new Error(`Missing required field: title for job ${jobIdStr}`);
  }

  const url =
    typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : null;
  if (!url) {
    throw new Error(`Missing required field: url for job ${jobIdStr}`);
  }

  if (
    typeof raw.publishTime !== 'string' ||
    !raw.publishTime.trim()
  ) {
    throw new Error(`Invalid or missing publishTime for job ${jobIdStr}`);
  }

  const parsedDate = new Date(raw.publishTime.trim());
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid or missing publishTime for job ${jobIdStr}`);
  }

  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : null;

  const paymentVerified =
    typeof raw.clientPaymentVerified === 'boolean'
      ? raw.clientPaymentVerified
      : null;

  const country =
    typeof raw.clientCountry === 'string' && raw.clientCountry.trim()
      ? raw.clientCountry.trim()
      : null;

  const countryCode =
    typeof raw.clientCountryCode === 'string' && raw.clientCountryCode.trim()
      ? raw.clientCountryCode.trim()
      : null;

  const proposalCount =
    typeof raw.totalApplicants === 'number' &&
    Number.isFinite(raw.totalApplicants)
      ? raw.totalApplicants
      : null;

  const skills: string[] = Array.isArray(raw.skills)
    ? raw.skills
        .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
        .map((s) => s.trim())
    : [];

  const jobType =
    typeof raw.jobType === 'string' && raw.jobType.trim()
      ? raw.jobType.trim().toUpperCase()
      : null;

  const fixedBudget =
    typeof raw.budgetAmount === 'number' && Number.isFinite(raw.budgetAmount)
      ? raw.budgetAmount
      : null;

  const hourlyMin =
    typeof raw.hourlyBudgetMin === 'number' &&
    Number.isFinite(raw.hourlyBudgetMin)
      ? raw.hourlyBudgetMin
      : null;

  const hourlyMax =
    typeof raw.hourlyBudgetMax === 'number' &&
    Number.isFinite(raw.hourlyBudgetMax)
      ? raw.hourlyBudgetMax
      : null;

  const budgetCurrency =
    typeof raw.budgetCurrency === 'string' && raw.budgetCurrency.trim()
      ? raw.budgetCurrency.trim()
      : null;

  const budgetText = formatBudgetText({
    jobType,
    fixedBudget,
    hourlyMin,
    hourlyMax,
    currency: budgetCurrency,
  });

  const clientRating =
    typeof raw.clientRating === 'number' && Number.isFinite(raw.clientRating)
      ? raw.clientRating
      : null;

  const clientReviewCount =
    typeof raw.clientReviewCount === 'number' &&
    Number.isFinite(raw.clientReviewCount)
      ? raw.clientReviewCount
      : null;

  const clientTotalSpent =
    typeof raw.clientTotalSpent === 'number' &&
    Number.isFinite(raw.clientTotalSpent)
      ? raw.clientTotalSpent
      : null;

  const changeType =
    typeof raw.changeType === 'string' && raw.changeType.trim()
      ? raw.changeType.trim().toUpperCase()
      : null;

  const isRepost = Boolean(raw.isRepost);

  return {
    upworkJobId: jobIdStr,
    sourceJobId: jobIdStr,
    title,
    description,
    url,
    postedAt: parsedDate,
    publishedAt: parsedDate,
    paymentVerified,
    country,
    countryCode,
    proposalCount,
    skills,
    jobType,
    fixedBudget,
    hourlyMin,
    hourlyMax,
    budgetCurrency,
    budgetText,
    clientRating,
    clientReviewCount,
    clientTotalSpent,
    changeType,
    isRepost,
  };
}
