/** Strip generic opener phrases only (and a few other clichés). */
export function postProcessProposal(text: string): string {
  let out = text;

  const phrasesToStrip: Array<{ re: RegExp; rep: string }> = [
    { re: /\bAs an experienced\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bAs a skilled\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bAs a seasoned\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI am excited to\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI believe I can help\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI am confident that\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI am excited\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI'm excited\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bDear client\b[,:\s]*/gi, rep: '' },
    { re: /\bHere is[^.!?]*proposal[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bHere's[^.!?]*proposal[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI believe I am a great fit\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI believe I'm a great fit\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI am a great fit\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI'm a great fit\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bLooking forward to hearing from you\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI look forward to hearing from you\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bHope to hear from you\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bI hope to hear from you\b[^.!?]*[.!?]?\s*/gi, rep: '' },
    { re: /\bseamlessly migrate\b/gi, rep: 'migrate' },
    { re: /\brobust solution\b/gi, rep: 'solution' },
    { re: /\bleverage my expertise\b/gi, rep: '' },
  ];

  for (const { re, rep } of phrasesToStrip) {
    out = out.replace(re, rep);
  }

  out = out.replace(/[ \t]{2,}/g, ' ');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
