import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  BlackfalconActorInput,
  buildBlackfalconActorInput,
} from '../config/apify.config';
import {
  mapBlackfalconItem,
  MappedUpworkJob,
  RawBlackfalconItem,
} from './blackfalcon.mapper';

interface ApifyStartRunResponse {
  data: {
    id: string;
    defaultDatasetId: string;
    status: string;
  };
}

interface ApifyRunStatusResponse {
  data: {
    status: string;
  };
}

@Injectable()
export class ApifyService implements OnModuleInit {
  private readonly logger = new Logger(ApifyService.name);
  private readonly token: string;
  private readonly actorId: string;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('APIFY_TOKEN')?.trim() || '';
    this.actorId =
      this.config.get<string>('APIFY_ACTOR_ID')?.trim() ||
      'blackfalcondata/upwork-scraper';
  }

  hasToken(): boolean {
    return Boolean(this.token);
  }

  onModuleInit() {
    if (!this.token) {
      this.logger.warn(
        'APIFY_TOKEN is missing in environment variables. Upwork poller will remain idle until APIFY_TOKEN is configured in Render/environment.',
      );
    }
  }

  async runAndFetchJobs(): Promise<MappedUpworkJob[]> {
    if (!this.token) {
      this.logger.error('Cannot run Apify scraper: APIFY_TOKEN is missing in environment variables.');
      throw new Error('APIFY_TOKEN is required.');
    }
    const input: BlackfalconActorInput = buildBlackfalconActorInput(this.config);
    const actorSlug = this.actorId.replace('/', '~');
    const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorSlug)}/runs?token=${encodeURIComponent(this.token)}`;

    this.logger.log(`Starting Apify actor run: ${this.actorId}`);

    const startRes = await axios.post<ApifyStartRunResponse>(startUrl, input, {
      headers: { 'Content-Type': 'application/json' },
    });

    const runId = startRes.data.data.id;
    const datasetId = startRes.data.data.defaultDatasetId;

    this.logger.log(`Actor run started. Run ID: ${runId}, Dataset ID: ${datasetId}`);

    // Poll until run finishes
    let finished = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 * 3s = 180s timeout

    while (!finished && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));
      attempts++;

      const statusRes = await axios.get<ApifyRunStatusResponse>(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(this.token)}`,
      );

      const status = statusRes.data.data.status;
      if (status === 'SUCCEEDED') {
        finished = true;
      } else if (
        status === 'FAILED' ||
        status === 'TIMED-OUT' ||
        status === 'ABORTED'
      ) {
        throw new Error(`Apify run ${runId} ended with status: ${status}`);
      }
    }

    if (!finished) {
      throw new Error(`Apify run ${runId} timed out after polling.`);
    }

    // Fetch dataset items
    const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(this.token)}`;
    const itemsRes = await axios.get<RawBlackfalconItem[]>(datasetUrl);
    const rawItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];

    this.logger.log(
      `Apify run ${runId} completed successfully. Returned ${rawItems.length} items.`,
    );

    const mappedJobs: MappedUpworkJob[] = [];
    for (const raw of rawItems) {
      try {
        const mapped = mapBlackfalconItem(raw);
        mappedJobs.push(mapped);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error mapping raw item: ${message}`);
        throw err;
      }
    }

    return mappedJobs;
  }
}

