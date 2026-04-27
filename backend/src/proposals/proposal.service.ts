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
import { formatBudgetLine } from '../upwork-jobs/upwork-job-score';
import { RetrievalService } from './retrieval.service';
import { buildPrompt } from './utils/prompt-builder';
import { postProcessProposal } from './utils/post-process-proposal';

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

  private async completeProposal(
    system: string,
    user: string,
  ): Promise<string> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENROUTER_API_KEY is required to generate proposals.',
      );
    }

    const baseUrl = this.configService
      .get<string>('OPENROUTER_API_BASE')!
      .replace(/\/$/, '');
    const proposalModel = this.configService
      .get<string>('OPENROUTER_PROPOSAL_MODEL')
      ?.trim();
    const model =
      proposalModel && proposalModel.length > 0
        ? proposalModel
        : this.configService.get<string>('OPENROUTER_MODEL')!;

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

    return text;
  }

  async generateForUpworkJob(jobId: string): Promise<{
    proposal: string;
    retrievedSummaries: string[];
    draftId: string;
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
    const rawProposal = await this.completeProposal(system, user);
    const proposal = postProcessProposal(rawProposal);

    const draft = await this.prisma.upworkProposalDraft.create({
      data: {
        body: proposal,
        upworkJobId: job.id,
      },
    });

    return {
      draftId: draft.id,
      proposal,
      retrievedSummaries: summaries,
    };
  }
}
