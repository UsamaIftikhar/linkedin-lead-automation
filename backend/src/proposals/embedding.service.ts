import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required for embeddings.');
    }

    const baseUrl = this.configService
      .get<string>('OPENROUTER_API_BASE')!
      .replace(/\/$/, '');
    const model = this.configService.get<string>('OPENROUTER_EMBEDDING_MODEL')!;
    const url = `${baseUrl}/embeddings`;

    const response = await fetch(url, {
      body: JSON.stringify({
        input: text.slice(0, 8000),
        model,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    const data = (await response.json()) as EmbeddingsResponse;

    if (!response.ok) {
      const msg =
        data?.error?.message ||
        `Embeddings failed (${response.status}) for model ${model}`;
      throw new Error(msg);
    }

    const vector = data.data?.[0]?.embedding;
    if (!vector?.length) {
      throw new Error('Embeddings API returned an empty vector.');
    }

    return vector;
  }

  /** Pre-compute vectors for experience snippets (best-effort). */
  async warmExperienceEmbeddings(
    items: { id: string; content: string }[],
  ): Promise<Map<string, number[]>> {
    const map = new Map<string, number[]>();
    for (const item of items) {
      try {
        const v = await this.generateEmbedding(item.content);
        map.set(item.id, v);
      } catch (err) {
        this.logger.warn(
          `Skipping embedding for experience ${item.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return map;
  }
}
