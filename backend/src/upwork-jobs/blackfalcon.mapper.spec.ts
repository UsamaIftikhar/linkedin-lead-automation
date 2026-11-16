import { mapBlackfalconItem, RawBlackfalconItem } from './blackfalcon.mapper';

describe('mapBlackfalconItem', () => {
  const fullRaw: RawBlackfalconItem = {
    jobId: '2122335221823763736',
    title: 'AI Agencies and Senior Engineers',
    description: 'Strong build team, thin pipeline? Read on.',
    url: 'https://www.upwork.com/jobs/~022122335221823763736',
    publishTime: '2026-11-16T17:33:01.213Z',
    clientPaymentVerified: true,
    clientCountry: 'United States',
    clientCountryCode: 'USA',
    totalApplicants: 1,
    skills: ['Generative AI', 'AI Development', 'Chatbot Development'],
    jobType: 'HOURLY',
    hourlyBudgetMin: 20,
    hourlyBudgetMax: 57,
    budgetAmount: null,
    budgetCurrency: 'USD',
    clientRating: 4.99,
    clientReviewCount: 6,
    clientTotalSpent: 12016.72,
    changeType: 'NEW',
    isRepost: false,
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    contactPhone: '+1234567890',
    extractedEmails: ['test@example.com'],
    extractedPhones: ['+1234567890'],
    extractedUrls: ['https://example.com'],
    socialProfiles: { linkedin: 'https://linkedin.com/in/test' },
  };

  it('maps a full record correctly', () => {
    const result = mapBlackfalconItem(fullRaw);

    expect(result.upworkJobId).toBe('2122335221823763736');
    expect(result.sourceJobId).toBe('2122335221823763736');
    expect(result.title).toBe('AI Agencies and Senior Engineers');
    expect(result.description).toBe('Strong build team, thin pipeline? Read on.');
    expect(result.url).toBe('https://www.upwork.com/jobs/~022122335221823763736');
    expect(result.postedAt).toEqual(new Date('2026-11-16T17:33:01.213Z'));
    expect(result.paymentVerified).toBe(true);
    expect(result.country).toBe('United States');
    expect(result.countryCode).toBe('USA');
    expect(result.proposalCount).toBe(1);
    expect(result.skills).toEqual(['Generative AI', 'AI Development', 'Chatbot Development']);
    expect(result.jobType).toBe('HOURLY');
    expect(result.hourlyMin).toBe(20);
    expect(result.hourlyMax).toBe(57);
    expect(result.fixedBudget).toBeNull();
    expect(result.clientRating).toBe(4.99);
    expect(result.clientReviewCount).toBe(6);
    expect(result.clientTotalSpent).toBe(12016.72);
    expect(result.changeType).toBe('NEW');
    expect(result.isRepost).toBe(false);
  });

  it('strictly excludes all contact and social fields from the output', () => {
    const result = mapBlackfalconItem(fullRaw);
    const keys = Object.keys(result);

    expect(keys).not.toContain('contactName');
    expect(keys).not.toContain('contactEmail');
    expect(keys).not.toContain('contactPhone');
    expect(keys).not.toContain('extractedEmails');
    expect(keys).not.toContain('extractedPhones');
    expect(keys).not.toContain('extractedUrls');
    expect(keys).not.toContain('socialProfiles');
  });

  it('preserves null clientPaymentVerified as null (never coerces to false)', () => {
    const result = mapBlackfalconItem({
      ...fullRaw,
      clientPaymentVerified: null,
    });
    expect(result.paymentVerified).toBeNull();
  });

  it('preserves null totalApplicants as null (never defaults to 0)', () => {
    const result = mapBlackfalconItem({
      ...fullRaw,
      totalApplicants: null,
    });
    expect(result.proposalCount).toBeNull();
  });

  it('allows missing description and sets it to null', () => {
    const { description: _, ...withoutDesc } = fullRaw;
    const result = mapBlackfalconItem(withoutDesc);
    expect(result.description).toBeNull();
  });

  it('throws when jobId is missing', () => {
    expect(() =>
      mapBlackfalconItem({
        ...fullRaw,
        jobId: null,
      }),
    ).toThrow('Missing required field: jobId');
  });

  it('throws and logs only jobId when title is missing', () => {
    expect(() =>
      mapBlackfalconItem({
        ...fullRaw,
        title: '',
      }),
    ).toThrow('Missing required field: title for job 2122335221823763736');
  });

  it('throws and logs only jobId when url is missing', () => {
    expect(() =>
      mapBlackfalconItem({
        ...fullRaw,
        url: '',
      }),
    ).toThrow('Missing required field: url for job 2122335221823763736');
  });

  it('throws when publishTime is invalid', () => {
    expect(() =>
      mapBlackfalconItem({
        ...fullRaw,
        publishTime: 'not-a-valid-date',
      }),
    ).toThrow('Invalid or missing publishTime for job 2122335221823763736');
  });
});

