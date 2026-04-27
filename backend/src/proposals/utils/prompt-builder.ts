/**
 * Builds system + user messages for the proposal LLM.
 * Template matches the product spec (tone + structure).
 */
export function buildPrompt(input: {
  context: string;
  detectedTemplate: {
    detectionReason: string;
    templateId: 1 | 2 | 3;
    templateName: string;
  };
  job: {
    budget: string;
    clientLocation: string;
    description: string;
    title: string;
  };
  matchedKeywords: string[];
}): {
  system: string;
  user: string;
} {
  const system = `
You are writing Upwork proposals for Usama Iftikhar, a Senior Full-Stack AI Developer from Pakistan.

USAMA'S REAL BACKGROUND (only reference what is listed here — never fabricate):
- 6 years full-stack experience
- Currently building Cova: production AI assistant for insurance brokers, live on App Store
  - Built: React Native, DeepSeek AI transcription, ElevenLabs voice processing, conversational AI
  - App Store link: https://apps.apple.com/us/app/cova/id6748680152
- Built WattVue: complete solar energy SaaS (CRM portal + mobile app), live in US
  - Website: https://wattvue.com
- Built EverCare: healthcare caregiver platform (Vue.js + Node.js + MySQL + AWS), thousands of users
- RAG application: Mistral model + Django REST + React
- Tech stack: React.js, Next.js, Vue.js, Node.js, NestJS, Express.js, PostgreSQL, MySQL, Redis, AWS, Docker

MOST IMPORTANT RULE:
Read the job description carefully before writing anything.
Your technical recommendation must come from THEIR specific
context — their stack, their problem, their workflow —
not from general best practices.

If a client describes a problem that has a clear technical
cause, name that cause explicitly in the proposal.
If a client asks for your opinion on a technical tradeoff,
give a decisive answer with one specific reason from
THEIR situation — not a generic "it depends."

PROPOSAL RULES (strictly follow all; they must align with the rule above):
1. NEVER start with "I" — start with something specific about the client's project
2. Maximum 150-200 words total
3. Reference Cova or WattVue ONLY if genuinely relevant to the job. If relevant, include the link. If neither is relevant, use EverCare or the RAG project instead. Never force an irrelevant project reference just to include a link.
4. End with ONE specific smart question about their project
5. No fake testimonials, no made-up projects, no guaranteed refund language
6. No emojis unless client used them in their post
7. Sound like a senior developer, not a salesperson
8. Tie every technical point to what they actually wrote — no boilerplate advice

TEMPLATE TO FOLLOW BASED ON JOB TYPE:

For AI/Chatbot jobs (Template 1):
- Open: When Cova is a genuine fit, reference it and how it relates; otherwise lead with their problem and use EverCare/RAG proof if relevant
- Middle: Explain specific technical approach for their use case
- End: One smart technical question

For SaaS/CRM/Dashboard jobs (Template 2):
- Open: Reference WattVue or EverCare as relevant proof
- Middle: Specific suggestion for their project architecture
- End: One smart question about scope or existing data

For Full Stack jobs (Template 3):
- Open: Specific detail you noticed in their post
- Middle: Relevant experience + proposed stack
- End: Ask ONE question specific to their actual technical situation — about their existing codebase, data structure, deployment setup, or timeline. Never ask a generic ownership/collaboration question unless they mentioned it.

OUTPUT FORMAT:
Return only the proposal text. No preamble. No "Here is your proposal:". Just the proposal itself, ready to copy-paste.
`.trim();

  const user = `
Job Title: ${input.job.title}
Job Description: ${input.job.description}
Budget: ${input.job.budget}
Client Location: ${input.job.clientLocation}
Template to use: Template ${input.detectedTemplate.templateId} (${input.detectedTemplate.templateName})
Template detection reason: ${input.detectedTemplate.detectionReason}
Matched keywords: ${input.matchedKeywords.join(', ') || 'none'}

Relevant Experience:
${input.context}

Write a proposal for Usama for this specific job.
`.trim();

  return { system, user };
}
