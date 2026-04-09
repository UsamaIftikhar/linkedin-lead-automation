import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { isBusinessEmail } from '../shared/utils/email.util';
import { RateLimitedQueue } from '../shared/utils/rate-limited-queue';

interface HunterEmailResult {
  confidence?: number;
  value?: string;
}

interface HunterResponse {
  data?: {
    emails?: HunterEmailResult[];
  };
}

@Injectable()
export class HunterService {
  private readonly logger = new Logger(HunterService.name);
  private readonly requestQueue = new RateLimitedQueue(1100);

  constructor(private readonly configService: ConfigService) {}

  async findBusinessEmailByDomain(domain: string) {
    const apiKey = this.configService.get<string>('HUNTER_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'HUNTER_API_KEY is not configured. Email enrichment will be skipped.',
      );
      return null;
    }

    const minConfidence =
      this.configService.get<number>('HUNTER_MIN_CONFIDENCE') ?? 75;

    this.logger.log(
      `Calling Hunter domain search for "${domain}" with min confidence ${minConfidence}.`,
    );

    const response = await this.requestQueue.add(async () =>
      axios.get<HunterResponse>('https://api.hunter.io/v2/domain-search', {
        params: {
          api_key: apiKey,
          domain,
          limit: 10,
        },
      }),
    );

    const candidates = Array.isArray(response?.data?.data?.emails)
      ? response.data.data.emails
      : [];
    const candidateSummaries = candidates.map((candidate) => {
      const email = candidate.value?.trim().toLowerCase() ?? null;
      const confidence = candidate.confidence ?? 0;

      return {
        confidence,
        email,
        isBusinessEmail: email ? isBusinessEmail(email, domain) : false,
      };
    });

    this.logger.debug(
      `Hunter response for "${domain}": ${JSON.stringify({
        candidateCount: candidateSummaries.length,
        candidates: candidateSummaries,
      })}`,
    );

    const match = candidates
      .filter((candidate) => {
        const email = candidate.value?.trim().toLowerCase();
        const confidence = candidate.confidence ?? 0;

        return Boolean(
          email &&
          confidence >= minConfidence &&
          isBusinessEmail(email, domain),
        );
      })
      .sort(
        (left, right) => (right.confidence ?? 0) - (left.confidence ?? 0),
      )[0];

    if (!match?.value) {
      this.logger.warn(
        `Hunter returned no acceptable business email for "${domain}".`,
      );
      return null;
    }

    this.logger.log(
      `Hunter selected "${match.value.trim().toLowerCase()}" for "${domain}" with confidence ${match.confidence ?? 0}.`,
    );

    return {
      confidence: match.confidence ?? null,
      email: match.value.trim().toLowerCase(),
    };
  }
}
