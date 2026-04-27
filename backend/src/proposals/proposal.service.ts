import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  detectProposalTemplate,
  calculateSemanticFit,
} from '../upwork-jobs/job-fit.util';
import {
  connectsRecommendedForTier,
  formatBudgetLine,
  scoreUpworkJobRecord,
} from '../upwork-jobs/upwork-job-score';
import { RetrievalService } from './retrieval.service';
import { buildPrompt } from './utils/prompt-builder';
import { postProcessProposal } from './utils/post-process-proposal';

/** OpenRouter model id for Upwork proposal chat completions (override with OPENROUTER_PROPOSAL_MODEL). */
const DEFAULT_OPENROUTER_PROPOSAL_MODEL = 'deepseek/deepseek-v4-flash';

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

function buildJobDescriptionText(input: {
  title: string;
  description: string;
  skills: unknown;
  budgetType: string | null;
  budgetTotalUsd: string | null;
  hourlyMinUsd: number | null;
  hourlyMaxUsd: number | null;
  experienceLevel: string | null;
  location: string | null;
  projectLength: string | null;
  hoursPerWeek: string | null;
  categoryName: string | null;
}): string {
  const skillsStr = Array.isArray(input.skills)
    ? (input.skills as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .join(', ')
    : '';

  const budgetParts: string[] = [];
  if (input.budgetType) {
    budgetParts.push(`Budget type: ${input.budgetType}`);
  }
  if (input.hourlyMinUsd != null && input.hourlyMaxUsd != null) {
    budgetParts.push(
      `Hourly: $${input.hourlyMinUsd}–$${input.hourlyMaxUsd}/hr`,
    );
  }
  if (input.budgetTotalUsd) {
    budgetParts.push(`Budget: ${input.budgetTotalUsd}`);
  }
  if (input.hoursPerWeek) {
    budgetParts.push(`Hours/week: ${input.hoursPerWeek}`);
  }
  if (input.projectLength) {
    budgetParts.push(`Project length: ${input.projectLength}`);
  }

  const lines = [
    `Title: ${input.title}`,
    input.categoryName ? `Category: ${input.categoryName}` : '',
    input.experienceLevel ? `Experience level: ${input.experienceLevel}` : '',
    input.location ? `Location: ${input.location}` : '',
    skillsStr ? `Skills: ${skillsStr}` : '',
    ...budgetParts,
    '',
    'Description:',
    input.description,
  ].filter(Boolean);

  return lines.join('\n');
}

@Injectable()
export class ProposalService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
  ) {}

  /** Model id sent to OpenRouter `POST /chat/completions` for proposals. */
  resolveProposalOpenRouterModel(): string {
    const proposalModel = this.configService
      .get<string>('OPENROUTER_PROPOSAL_MODEL')
      ?.trim();
    return proposalModel && proposalModel.length > 0
      ? proposalModel
      : DEFAULT_OPENROUTER_PROPOSAL_MODEL;
  }

  private async completeProposal(
    system: string,
    user: string,
  ): Promise<{ model: string; text: string }> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENROUTER_API_KEY is required to generate proposals.',
      );
    }

    const baseUrl = this.configService
      .get<string>('OPENROUTER_API_BASE')!
      .replace(/\/$/, '');
    const model = this.resolveProposalOpenRouterModel();

    const url = `${baseUrl}/chat/completions`;
    const response = await fetch(url, {
      body: JSON.stringify({
        messages: [
          { content: system, role: 'system' },
          { content: user, role: 'user' },
        ],
        model,
        stream: false,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    const data = (await response.json()) as CompletionResponse;

    if (!response.ok) {
      const msg =
        data?.error?.message ||
        `OpenRouter error (${response.status}) while generating proposal.`;
      throw new ServiceUnavailableException(msg);
    }

    const raw = data.choices?.[0]?.message?.content;
    const text =
      typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (!text) {
      throw new ServiceUnavailableException(
        'Model returned an empty proposal.',
      );
    }

    return { model, text };
  }

  async generateForUpworkJob(jobId: string): Promise<{
    draftId: string;
    openRouterModel: string;
    proposal: string;
    retrievedSummaries: string[];
  }> {
    const job = await this.prisma.upworkJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Upwork job ${jobId} not found.`);
    }

    const jobDescription = buildJobDescriptionText(job);
    const { context, summaries } =
      await this.retrievalService.getRelevantContext(jobDescription);
    const detectedTemplate = detectProposalTemplate(job.title, job.description);
    const semanticFit = calculateSemanticFit(job.title, job.description);
    const { system, user } = buildPrompt({
      context,
      detectedTemplate,
      job: {
        budget: formatBudgetLine(job),
        clientLocation: job.location ?? 'Not specified',
        description: job.description,
        title: job.title,
      },
      matchedKeywords: semanticFit.matchedKeywords,
    });

    console.log(
      '[ProposalService] generateForUpworkJob · OpenRouter model: %s',
      this.resolveProposalOpenRouterModel(),
    );
    console.log(
      '[ProposalService] SYSTEM PROMPT sent to OpenRouter (%d chars):\n%s',
      system.length,
      system,
    );

    const { model: openRouterModel, text: rawProposal } =
      await this.completeProposal(system, user);
    console.log(
      '[ProposalService] RAW model response (before postProcessProposal) (%d chars):\n%s',
      rawProposal.length,
      rawProposal,
    );

    const proposal = postProcessProposal(rawProposal);
    console.log(
      '[ProposalService] FINAL text (after postProcessProposal) (%d chars):\n%s',
      proposal.length,
      proposal,
    );

    const priority = scoreUpworkJobRecord({
      budgetTotalUsd: job.budgetTotalUsd,
      budgetType: job.budgetType,
      clientFeedbackCount: job.clientFeedbackCount,
      clientMemberSince: job.clientMemberSince,
      clientScore: job.clientScore,
      clientSpent: job.clientSpent,
      description: job.description,
      hourlyMaxUsd: job.hourlyMaxUsd,
      hourlyMinUsd: job.hourlyMinUsd,
      hoursPerWeek: job.hoursPerWeek,
      premium: job.premium,
      proposals: job.proposals,
      publishedAt: job.publishedAt,
      title: job.title,
    });
    const connectsRecommended = connectsRecommendedForTier(priority.tier);

    const draft = await this.prisma.upworkProposalDraft.create({
      data: {
        body: proposal,
        templateName: detectedTemplate.templateName,
        templateUsed: detectedTemplate.templateId,
        upworkJobId: job.id,
        ...(connectsRecommended != null ? { connectsRecommended } : {}),
      },
    });

    return {
      draftId: draft.id,
      openRouterModel,
      proposal,
      retrievedSummaries: summaries,
    };
  }
}
