import { describe, expect, it } from 'vitest';
import { generateOcrKeywords, normalizeOcrPhrase } from '../modules/products/product-ai.utils.js';

describe('product AI keyword utilities', () => {
  it('normalizes punctuation and repeated spacing', () => {
    expect(normalizeOcrPhrase('  Good-Time   Double Choc! ')).toBe('good time double choc');
  });

  it('includes full phrase and individual tokens', () => {
    expect(generateOcrKeywords('Good Time Double Choc')).toEqual([
      'good time double choc',
      'good',
      'time',
      'double',
      'choc',
    ]);
  });

  it('adds conservative known spelling variants', () => {
    const keywords = generateOcrKeywords('Nescafe Cappucino', 'nescafe_cappucino');
    expect(keywords).toContain('nescafe cappuccino');
    expect(keywords).toContain('cappuccino');
  });

  it('deduplicates product name and AI class variants', () => {
    const keywords = generateOcrKeywords('Oreo Original', 'oreo_original');
    expect(keywords.filter((keyword) => keyword === 'oreo original')).toHaveLength(1);
  });
});
