import {
  DISQUALIFYING_KEYWORDS,
  PRIMARY_KEYWORDS,
  SECONDARY_KEYWORDS,
  TEMPLATE_1_KEYWORDS,
  TEMPLATE_2_KEYWORDS,
  TEMPLATE_3_KEYWORDS,
} from './job-fit.config';

export type SemanticFitResult = {
  disqualified: boolean;
  disqualifiedBy: string[];
  matchedKeywords: string[];
  score: number;
};

export type TemplateDetectionResult = {
  detectionReason: string;
  templateId: 1 | 2 | 3;
  templateName: string;
};

function buildText(
  title: string | null | undefined,
  description: string | null | undefined,
  skills?: unknown,
): string {
  const skillsStr = Array.isArray(skills)
    ? skills.filter((s): s is string => typeof s === 'string').join(' ')
    : typeof skills === 'string'
    ? skills
    : '';
  return `${title ?? ''} ${description ?? ''} ${skillsStr}`.toLowerCase();
}

export function calculateSemanticFit(
  title: string | null | undefined,
  description: string | null | undefined,
  skills?: unknown,
): SemanticFitResult {
  const text = buildText(title, description, skills);
  const disqualifiedBy = DISQUALIFYING_KEYWORDS.filter((kw) =>
    text.includes(kw),
  );
  if (disqualifiedBy.length > 0) {
    return {
      disqualified: true,
      disqualifiedBy,
      matchedKeywords: [],
      score: 0,
    };
  }

  const matchedPrimary = PRIMARY_KEYWORDS.filter((kw) => text.includes(kw));
  const matchedSecondary = SECONDARY_KEYWORDS.filter((kw) => text.includes(kw));
  const rawScore = matchedPrimary.length * 3 + matchedSecondary.length;
  const normalizedScore = Math.min(100, Math.round((rawScore / 25) * 100));

  return {
    disqualified: false,
    disqualifiedBy: [],
    matchedKeywords: [...matchedPrimary, ...matchedSecondary],
    score: normalizedScore,
  };
}

export function detectProposalTemplate(
  title: string | null | undefined,
  description: string | null | undefined,
  skills?: unknown,
): TemplateDetectionResult {
  const text = buildText(title, description, skills);
  const t1 = TEMPLATE_1_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const t2 = TEMPLATE_2_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const t3 = TEMPLATE_3_KEYWORDS.filter((kw) => text.includes(kw)).length;

  if (t1 >= t2 && t1 >= t3 && t1 > 0) {
    return {
      detectionReason: `Matched ${t1} AI keywords`,
      templateId: 1,
      templateName: 'AI Assistant / Chatbot',
    };
  }
  if (t2 >= t3 && t2 > 0) {
    return {
      detectionReason: `Matched ${t2} SaaS keywords`,
      templateId: 2,
      templateName: 'SaaS / CRM / Dashboard',
    };
  }
  return {
    detectionReason: `Matched ${t3} full-stack keywords`,
    templateId: 3,
    templateName: 'Full Stack React/Next.js',
  };
}
