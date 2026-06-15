/**
 * Property-Based Test: Language detection identifies supported languages
 *
 * Feature: ai-receptionist, Property 15: Language detection identifies supported languages
 *
 * Validates: Requirements 8.2, 8.6
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { detectLanguage } from './languageDetector';

/**
 * Arbitrary that generates clearly Chinese text (multiple CJK characters).
 * Uses characters in the U+4E00–U+9FFF range.
 */
const chineseTextArb = fc
  .array(fc.integer({ min: 0x4e00, max: 0x9fff }), { minLength: 3, maxLength: 20 })
  .map((codePoints) => String.fromCodePoint(...codePoints));

/**
 * Arbitrary that generates text containing Spanish keywords and/or diacriticals.
 */
const spanishTextArb = fc
  .record({
    words: fc.subarray(
      ['hola', 'gracias', 'cómo', 'necesito', 'quiero', 'favor', 'buenos', 'buenas', 'días', 'señor'],
      { minLength: 2, maxLength: 5 }
    ),
    filler: fc.array(
      fc.constantFrom('el', 'la', 'mi', 'tu', 'y', 'de'),
      { minLength: 0, maxLength: 3 }
    ),
  })
  .map(({ words, filler }) => [...words, ...filler].sort(() => Math.random() - 0.5).join(' '));

/**
 * Arbitrary that generates text containing French keywords and/or diacriticals.
 */
const frenchTextArb = fc
  .record({
    words: fc.subarray(
      ['bonjour', 'merci', 'vous', 'voudrais', 'rendez', 'comment', 'monsieur', 'madame', 'maintenant'],
      { minLength: 2, maxLength: 5 }
    ),
    filler: fc.array(
      fc.constantFrom('le', 'la', 'je', 'de', 'et', 'un'),
      { minLength: 0, maxLength: 3 }
    ),
  })
  .map(({ words, filler }) => [...words, ...filler].sort(() => Math.random() - 0.5).join(' '));

/**
 * Arbitrary that generates arbitrary text (any printable characters).
 */
const anyTextArb = fc.string({ minLength: 0, maxLength: 200 });

describe('Property 15: Language detection identifies supported languages', () => {
  it('detects Chinese text containing CJK characters as "zh"', () => {
    fc.assert(
      fc.property(chineseTextArb, (text) => {
        const result = detectLanguage(text);
        expect(result).toBe('zh');
      }),
      { numRuns: 100 }
    );
  });

  it('detects Spanish text containing Spanish keywords/diacriticals as "es"', () => {
    fc.assert(
      fc.property(spanishTextArb, (text) => {
        const result = detectLanguage(text);
        expect(result).toBe('es');
      }),
      { numRuns: 100 }
    );
  });

  it('detects French text containing French keywords/diacriticals as "fr"', () => {
    fc.assert(
      fc.property(frenchTextArb, (text) => {
        const result = detectLanguage(text);
        expect(result).toBe('fr');
      }),
      { numRuns: 100 }
    );
  });

  it('always returns one of the 4 supported languages for any input', () => {
    const supportedLanguages = ['en', 'es', 'fr', 'zh'] as const;

    fc.assert(
      fc.property(anyTextArb, (text) => {
        const result = detectLanguage(text);
        expect(supportedLanguages).toContain(result);
      }),
      { numRuns: 100 }
    );
  });
});
