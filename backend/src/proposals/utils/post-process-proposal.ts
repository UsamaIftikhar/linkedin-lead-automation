/** Strip common generic phrases after generation. */
export function postProcessProposal(text: string): string {
  let out = text;
  const patterns: RegExp[] = [
    /\bI am excited\b[^.!?]*[.!?]?\s*/gi,
    /\bI'm excited\b[^.!?]*[.!?]?\s*/gi,
    /\bDear client\b[,:\s]*/gi,
    /\bI believe I am a great fit\b[^.!?]*[.!?]?\s*/gi,
    /\bI believe I'm a great fit\b[^.!?]*[.!?]?\s*/gi,
    /\bI am a great fit\b[^.!?]*[.!?]?\s*/gi,
    /\bI'm a great fit\b[^.!?]*[.!?]?\s*/gi,
    /\bLooking forward to hearing from you\b[^.!?]*[.!?]?\s*/gi,
    /\bI look forward to hearing from you\b[^.!?]*[.!?]?\s*/gi,
    /\bHope to hear from you\b[^.!?]*[.!?]?\s*/gi,
    /\bI hope to hear from you\b[^.!?]*[.!?]?\s*/gi,
  ];
  for (const re of patterns) {
    out = out.replace(re, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
