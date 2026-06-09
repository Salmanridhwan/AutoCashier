const WORD_VARIANTS: Record<string, string[]> = {
  cappucino: ['cappuccino'],
  cappuccino: ['cappucino'],
  coffe: ['coffee'],
  coffee: ['coffe'],
  made: ['maid'],
  maid: ['made'],
};

export function normalizeOcrPhrase(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function expandPhraseVariants(phrase: string): string[] {
  const normalized = normalizeOcrPhrase(phrase);
  if (!normalized) return [];

  const variants = new Set([normalized]);
  const words = normalized.split(' ');
  words.forEach((word, index) => {
    for (const replacement of WORD_VARIANTS[word] || []) {
      const replaced = [...words];
      replaced[index] = replacement;
      variants.add(replaced.join(' '));
    }
  });
  return [...variants];
}

export function generateOcrKeywords(name: unknown, aiClassName?: unknown): string[] {
  const keywords = new Set<string>();
  const phrases = [
    normalizeOcrPhrase(name),
    normalizeOcrPhrase(String(aiClassName ?? '').replace(/_/g, ' ')),
  ].filter(Boolean);

  for (const phrase of phrases) {
    for (const variant of expandPhraseVariants(phrase)) keywords.add(variant);
    for (const token of phrase.split(' ')) {
      if (token.length < 2) continue;
      for (const variant of expandPhraseVariants(token)) keywords.add(variant);
    }
  }

  return [...keywords];
}
