import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RAG_EXPERIENCE_CHUNKS } from './data/profile-rag.data';
import type { ExperienceItem } from './data/profile-rag.data';
import { EmbeddingService } from './embedding.service';
import { cosineSimilarity } from './utils/cosine-similarity';
import { extractKeywords } from './utils/keyword-extract';

const TOP_K = 5;
const MIN_TAG_FILTER = 3;

@Injectable()
export class RetrievalService implements OnModuleInit {
  private readonly logger = new Logger(RetrievalService.name);
  private experienceEmbeddings = new Map<string, number[]>();

  constructor(private readonly embeddingService: EmbeddingService) {}

  async onModuleInit() {
    try {
      this.experienceEmbeddings = await this.embeddingService.warmExperienceEmbeddings(
        RAG_EXPERIENCE_CHUNKS.map((e) => ({ content: e.content, id: e.id })),
      );
      this.logger.log(
        `Warm-started ${this.experienceEmbeddings.size}/${RAG_EXPERIENCE_CHUNKS.length} profile RAG chunks`,
      );
    } catch (err) {
      this.logger.warn(
        `Experience embedding warm-up failed (tag-only fallback will apply): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private tagFilterPool(jobText: string): ExperienceItem[] {
    const keywords = extractKeywords(jobText);
    const tagged = RAG_EXPERIENCE_CHUNKS.filter((item) =>
      item.tags.some((t) => keywords.has(t.toLowerCase())),
    );
    return tagged.length >= MIN_TAG_FILTER ? tagged : [...RAG_EXPERIENCE_CHUNKS];
  }

  private rankByTagOverlap(jobText: string, pool: ExperienceItem[]): ExperienceItem[] {
    const keywords = extractKeywords(jobText);
    return [...pool].sort((a, b) => {
      const score = (it: ExperienceItem) =>
        it.tags.filter((t) => keywords.has(t.toLowerCase())).length;
      return score(b) - score(a);
    });
  }

  /**
   * Embed job description, cosine-match experience pool (tag-filtered first), top K.
   */
  async getRelevantContext(jobDescription: string): Promise<{
    context: string;
    summaries: string[];
  }> {
    const pool = this.tagFilterPool(jobDescription);
    let jobVec: number[] | null = null;
    try {
      jobVec = await this.embeddingService.generateEmbedding(jobDescription);
    } catch (err) {
      this.logger.warn(
        `Job embedding failed, using tag overlap only: ${err instanceof Error ? err.message : err}`,
      );
    }

    let ordered: ExperienceItem[];

    if (jobVec && this.experienceEmbeddings.size > 0) {
      const scored = pool
        .map((item) => {
          const ev = this.experienceEmbeddings.get(item.id);
          const sim = ev ? cosineSimilarity(jobVec, ev) : -1;
          return { item, sim };
        })
        .sort((a, b) => b.sim - a.sim);
      ordered = scored.map((s) => s.item);
    } else {
      ordered = this.rankByTagOverlap(jobDescription, pool);
    }

    const top = ordered.slice(0, TOP_K);
    const lines = top.map(
      (e) =>
        `- [${e.type}] ${e.content} (tags: ${e.tags.join(', ')})`,
    );

    return {
      context: lines.join('\n'),
      summaries: top.map((e) => `${e.id}: ${e.content.slice(0, 80)}…`),
    };
  }
}
