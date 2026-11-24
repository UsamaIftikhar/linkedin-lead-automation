import {
  checkBudget,
  checkChangeType,
  checkDeveloperRole,
  checkFreelancerGeoRestrictions,
  checkFreshness,
  checkKeywords,
  checkLocation,
  checkNotRepost,
  checkPaymentVerified,
  checkProposalCount,
  evaluateJobFilters,
} from './job-filters';
import { MappedUpworkJob } from '../blackfalcon.mapper';

describe('Upwork Job Filters', () => {
  const baseJob: MappedUpworkJob = {
    upworkJobId: '123456789',
    sourceJobId: '123456789',
    title: 'Senior Next.js Developer',
    description: 'Looking for a full stack developer for our SaaS MVP.',
    url: 'https://upwork.com/jobs/123456789',
    postedAt: new Date(),
    publishedAt: new Date(),
    paymentVerified: true,
    country: 'United States',
    countryCode: 'USA',
    proposalCount: 5,
    skills: ['Next.js', 'React', 'TypeScript'],
    jobType: 'HOURLY',
    fixedBudget: null,
    hourlyMin: 25,
    hourlyMax: 50,
    budgetCurrency: 'USD',
    budgetText: '$25–$50/hr',
    clientRating: 4.9,
    clientReviewCount: 10,
    clientTotalSpent: 5000,
    changeType: 'NEW',
    isRepost: false,
  };

  describe('Rule 1: checkChangeType', () => {
    it('passes when changeType is NEW', () => {
      expect(checkChangeType({ ...baseJob, changeType: 'NEW' }).passed).toBe(true);
    });

    it('passes when changeType is null', () => {
      expect(checkChangeType({ ...baseJob, changeType: null }).passed).toBe(true);
    });

    it('rejects when changeType is UPDATED', () => {
      const res = checkChangeType({ ...baseJob, changeType: 'UPDATED' });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('UPDATED');
    });

    it('rejects when changeType is REAPPEARED', () => {
      expect(checkChangeType({ ...baseJob, changeType: 'REAPPEARED' }).passed).toBe(false);
    });

    it('rejects when changeType is UNCHANGED', () => {
      expect(checkChangeType({ ...baseJob, changeType: 'UNCHANGED' }).passed).toBe(false);
    });

    it('rejects when changeType is EXPIRED', () => {
      expect(checkChangeType({ ...baseJob, changeType: 'EXPIRED' }).passed).toBe(false);
    });
  });

  describe('Rule 2: checkNotRepost', () => {
    it('passes when isRepost is false', () => {
      expect(checkNotRepost({ ...baseJob, isRepost: false }).passed).toBe(true);
    });

    it('rejects when isRepost is true', () => {
      const res = checkNotRepost({ ...baseJob, isRepost: true });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('repost');
    });
  });

  describe('Rule 3: checkFreshness', () => {
    const now = new Date('2026-11-16T12:00:00.000Z');

    it('passes when job was posted 9 minutes ago', () => {
      const postedAt = new Date('2026-11-16T11:51:00.000Z');
      expect(checkFreshness({ ...baseJob, postedAt }, now, 10).passed).toBe(true);
    });

    it('rejects when job was posted 10 minutes and 1 second ago', () => {
      const postedAt = new Date('2026-11-16T11:49:59.000Z');
      const res = checkFreshness({ ...baseJob, postedAt }, now, 10);
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('older than 10 minutes');
    });
  });

  describe('Rule 4: checkPaymentVerified', () => {
    it('passes when paymentVerified is true', () => {
      expect(checkPaymentVerified({ ...baseJob, paymentVerified: true }).passed).toBe(true);
    });

    it('rejects when paymentVerified is false', () => {
      const res = checkPaymentVerified({ ...baseJob, paymentVerified: false });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('payment not verified');
    });

    it('rejects when paymentVerified is null', () => {
      const res = checkPaymentVerified({ ...baseJob, paymentVerified: null });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('payment not verified');
    });
  });

  describe('Rule 5: checkLocation', () => {
    it('passes for non-excluded country and code', () => {
      expect(checkLocation({ ...baseJob, country: 'Germany', countryCode: 'DE' }).passed).toBe(true);
    });

    it('rejects Pakistan variants by name and code', () => {
      expect(checkLocation({ ...baseJob, country: 'Pakistan', countryCode: 'PK' }).passed).toBe(false);
      expect(checkLocation({ ...baseJob, country: 'PAKISTAN', countryCode: 'USA' }).passed).toBe(false);
      expect(checkLocation({ ...baseJob, country: 'United States', countryCode: 'PK' }).passed).toBe(false);
      expect(checkLocation({ ...baseJob, country: 'United States', countryCode: 'PAK' }).passed).toBe(false);
    });

    it('rejects India variants by name and code', () => {
      expect(checkLocation({ ...baseJob, country: 'India', countryCode: 'IN' }).passed).toBe(false);
      expect(checkLocation({ ...baseJob, country: 'INDIA', countryCode: 'USA' }).passed).toBe(false);
      expect(checkLocation({ ...baseJob, country: 'United States', countryCode: 'IN' }).passed).toBe(false);
      expect(checkLocation({ ...baseJob, country: 'United States', countryCode: 'IND' }).passed).toBe(false);
    });

    it('rejects when both country and countryCode are null', () => {
      const res = checkLocation({ ...baseJob, country: null, countryCode: null });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('missing country');
    });
  });

  describe('Rule 5b: checkFreelancerGeoRestrictions', () => {
    it('passes when no geo restrictions are mentioned', () => {
      const res = checkFreelancerGeoRestrictions(baseJob);
      expect(res.passed).toBe(true);
    });

    it('rejects when description specifies "US only"', () => {
      const res = checkFreelancerGeoRestrictions({
        ...baseJob,
        description: 'Great project, but US only applicants please.',
      });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('freelancer location restricted');
    });

    it('rejects when description specifies "US citizens only"', () => {
      const res = checkFreelancerGeoRestrictions({
        ...baseJob,
        description: 'Requires clearance. US citizens only.',
      });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('freelancer location restricted');
    });
  });

  describe('Rule 5c: checkDeveloperRole', () => {
    it('passes when job title is a software developer or engineer', () => {
      expect(checkDeveloperRole(baseJob).passed).toBe(true);
    });

    it('rejects non-dev title: Video Editor', () => {
      const res = checkDeveloperRole({
        ...baseJob,
        title: 'Experienced Video Editor for YouTube Channel',
      });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('non-developer job role title');
    });

    it('rejects non-dev title: B2B Copywriter', () => {
      const res = checkDeveloperRole({
        ...baseJob,
        title: 'B2B SaaS Content Writer and Copywriter',
      });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('non-developer job role title');
    });

    it('rejects non-dev title: Virtual Assistant', () => {
      const res = checkDeveloperRole({
        ...baseJob,
        title: 'Virtual Assistant for Founder',
      });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('non-developer job role title');
    });
  });

  describe('Rule 6: checkProposalCount', () => {
    it('passes when proposals is 19', () => {
      expect(checkProposalCount({ ...baseJob, proposalCount: 19 }, 20).passed).toBe(true);
    });

    it('rejects when proposals is exactly 20', () => {
      const res = checkProposalCount({ ...baseJob, proposalCount: 20 }, 20);
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('proposals (20) >= 20');
    });

    it('passes when proposals is null (fresh listing with 0 proposals)', () => {
      const res = checkProposalCount({ ...baseJob, proposalCount: null }, 20);
      expect(res.passed).toBe(true);
    });
  });

  describe('Rule 7: checkKeywords', () => {
    it('passes when keyword is in title', () => {
      const res = checkKeywords({
        ...baseJob,
        title: 'Looking for a Next.js Expert',
        description: 'Random description',
        skills: [],
      });
      expect(res.passed).toBe(true);
      expect(res.matchedKeywords).toContain('Next.js');
    });

    it('passes when keyword is only in skills (e.g. "AI Agent Development" matches "AI agent")', () => {
      const res = checkKeywords({
        ...baseJob,
        title: 'Backend Engineer',
        description: 'Build backend pipelines and integrations.',
        skills: ['AI Agent Development', 'Python'],
      });
      expect(res.passed).toBe(true);
      expect(res.matchedKeywords).toContain('AI agent');
    });

    it('rejects when no keywords match', () => {
      const res = checkKeywords({
        ...baseJob,
        title: 'PHP WordPress Webmaster',
        description: 'Fix CSS and styling on custom theme.',
        skills: ['PHP', 'WordPress', 'CSS'],
      });
      expect(res.passed).toBe(false);
      expect(res.matchedKeywords).toEqual([]);
    });
  });

  describe('Rule 8: checkBudget', () => {
    const options = { minFixedBudget: 1000, minHourlyRate: 15 };

    it('FIXED: rejects when fixedBudget is exactly 1000', () => {
      const res = checkBudget(
        { ...baseJob, jobType: 'FIXED', fixedBudget: 1000 },
        options,
      );
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('(1000) <= 1000');
    });

    it('FIXED: passes when fixedBudget is 1001', () => {
      const res = checkBudget(
        { ...baseJob, jobType: 'FIXED', fixedBudget: 1001 },
        options,
      );
      expect(res.passed).toBe(true);
    });

    it('FIXED: rejects when fixedBudget is null', () => {
      const res = checkBudget(
        { ...baseJob, jobType: 'FIXED', fixedBudget: null },
        options,
      );
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('missing fixed budget');
    });

    it('HOURLY: rejects when hourlyMin is exactly 15', () => {
      const res = checkBudget(
        { ...baseJob, jobType: 'HOURLY', hourlyMin: 15 },
        options,
      );
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('(15) <= 15');
    });

    it('HOURLY: passes when hourlyMin is 15.01', () => {
      const res = checkBudget(
        { ...baseJob, jobType: 'HOURLY', hourlyMin: 15.01 },
        options,
      );
      expect(res.passed).toBe(true);
    });

    it('HOURLY: passes when hourlyMin is null (unspecified/open rate)', () => {
      const res = checkBudget(
        { ...baseJob, jobType: 'HOURLY', hourlyMin: null },
        options,
      );
      expect(res.passed).toBe(true);
    });

    it('rejects unsupported jobType', () => {
      const res = checkBudget(
        { ...baseJob, jobType: 'OTHER' },
        options,
      );
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('unsupported or missing job type');
    });
  });

  describe('evaluateJobFilters (Full Pipeline)', () => {
    it('passes a fully compliant job', () => {
      const res = evaluateJobFilters(baseJob, {
        minFixedBudget: 1000,
        minHourlyRate: 15,
        now: baseJob.postedAt,
      });
      expect(res.passed).toBe(true);
      expect(res.rejectionReason).toBeNull();
      expect(res.matchedKeywords.length).toBeGreaterThan(0);
    });

    it('returns first failing reason on failure', () => {
      const res = evaluateJobFilters(
        { ...baseJob, isRepost: true },
        {
          minFixedBudget: 1000,
          minHourlyRate: 15,
          now: baseJob.postedAt,
        },
      );
      expect(res.passed).toBe(false);
      expect(res.rejectionReason).toContain('repost');
    });
  });
});
