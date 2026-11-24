import { ConfigService } from '@nestjs/config';
import { KEYWORDS } from './keywords';

export interface BlackfalconActorInput {
  query: string;
  sort: string;
  maxAgeMinutes: number;
  verifiedPaymentOnly: boolean;
  excludeLocations: string[];
  incrementalMode: boolean;
  stateKey: string;
  maxResults: number;
  compact: boolean;
  descriptionFormat: string;
  descriptionMaxLength: number;
  excludeEmptyFields: boolean;
  enrichDetails: boolean;
  skipReposts?: boolean;
  minClientTotalSpent?: number;
}

export function buildActorQuery(keywords: readonly string[] = KEYWORDS): string {
  return keywords.map((k) => `"${k}"`).join(' OR ');
}

export function buildBlackfalconActorInput(
  configService: ConfigService,
): BlackfalconActorInput {
  const stateKey =
    configService.get<string>('APIFY_STATE_KEY')?.trim() || 'upwork-leads-dev';
  const maxResults =
    Number(configService.get<number | string>('APIFY_MAX_RESULTS')) || 50;

  return {
    query: buildActorQuery(KEYWORDS),
    sort: 'newest',
    maxAgeMinutes: 10,
    verifiedPaymentOnly: true,
    excludeLocations: ['Pakistan', 'India'],
    incrementalMode: true,
    stateKey,
    maxResults,
    compact: false,
    descriptionFormat: 'text',
    descriptionMaxLength: 0,
    excludeEmptyFields: false,
    enrichDetails: false,
    skipReposts: true,
    minClientTotalSpent: 100,
  };
}

