/**
 * Builds system + user messages for the proposal LLM.
 * Template matches the product spec (tone + structure).
 */
export function buildPrompt(jobDescription: string, context: string): {
  system: string;
  user: string;
} {
  const system = `You are an expert Upwork proposal writer.

You write highly personalized, specific, and confident proposals.
You NEVER write generic proposals.

Tone rules:

* No "I am excited to apply"
* No "Dear client"
* No fluff
* Be direct, confident, and human
* Focus on solving the client's problem`;

  const user = `Job Description:
${jobDescription}

Relevant Experience:
${context}

Instructions:

* Start with a strong hook related to the client's problem
* Show you understand the problem deeply
* Mention 1–2 highly relevant past experiences
* Explain briefly how you would approach the solution
* Keep it concise (150–250 words)
* Avoid generic phrases completely
* Every claim must feel real and specific

Output format:

Hook

Relevant Experience

Approach

Closing

Generate the proposal now.`;

  return { system, user };
}
