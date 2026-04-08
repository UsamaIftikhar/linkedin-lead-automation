const STOP = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'her',
  'was',
  'one',
  'our',
  'out',
  'day',
  'get',
  'has',
  'him',
  'his',
  'how',
  'its',
  'may',
  'new',
  'now',
  'old',
  'see',
  'two',
  'way',
  'who',
  'boy',
  'did',
  'let',
  'put',
  'say',
  'she',
  'too',
  'use',
  'that',
  'this',
  'with',
  'from',
  'have',
  'will',
  'your',
  'what',
  'when',
  'been',
  'more',
  'some',
  'than',
  'them',
  'they',
  'into',
  'just',
  'like',
  'make',
  'over',
  'such',
  'time',
  'very',
  'work',
  'need',
  'looking',
  'looking for',
]);

/** Light keyword bag for tag pre-filtering (not NLP-heavy). */
export function extractKeywords(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^a-z0-9+#\s]/g, ' ');
  const parts = normalized.split(/\s+/).filter((w) => w.length > 2);
  const out = new Set<string>();
  for (const w of parts) {
    if (!STOP.has(w)) {
      out.add(w);
    }
  }
  return out;
}
