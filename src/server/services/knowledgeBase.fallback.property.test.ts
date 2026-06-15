/**
 * Feature: ai-receptionist, Property 17: KB language fallback to English
 *
 * Validates: Requirements 8.7
 *
 * For any query in a non-English supported language where no KB content exists
 * in that language, the search function SHALL return matching English KB entries.
 * When target language entries DO exist and match, they are returned instead.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  KnowledgeBaseService,
  IKBEntryRepository,
  extractKeywords,
} from './knowledgeBase';
import { KBEntry } from '../../shared/types/knowledgeBase';
import { KBCategory, Language } from '../../shared/types/enums';

// Mock Redis caching to avoid needing a real Redis connection
vi.mock('../db/redis', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheInvalidatePattern: vi.fn().mockResolvedValue(undefined),
}));

const KB_CATEGORIES: KBCategory[] = [
  'business_hours',
  'services',
  'pricing',
  'location',
  'custom',
];

const NON_ENGLISH_LANGUAGES: Language[] = ['es', 'fr', 'zh'];

/**
 * Generator for non-stop-word keywords (words that extractKeywords won't filter out).
 */
const nonStopWordArb = fc.stringMatching(/^[a-z]{3,10}$/).filter((word) => {
  const extracted = extractKeywords(word);
  return extracted.length === 1 && extracted[0] === word;
});

/**
 * Generator for a KB entry with configurable language and known keywords.
 */
function kbEntryWithLanguageArb(language: Language) {
  return fc
    .record({
      id: fc.uuid(),
      businessId: fc.constant('biz-test'),
      category: fc.constantFrom(...KB_CATEGORIES),
      keywords: fc.array(nonStopWordArb, { minLength: 1, maxLength: 5 }),
      questionKeywords: fc.array(nonStopWordArb, { minLength: 1, maxLength: 3 }),
      answer: fc.string({ minLength: 1, maxLength: 100 }),
    })
    .map(({ id, businessId, category, keywords, questionKeywords, answer }) => {
      const question = questionKeywords.join(' ');
      return {
        id,
        businessId,
        category,
        question,
        answer,
        language,
        keywords,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as KBEntry;
    });
}

/**
 * Creates a mock repository that returns the given entries for searchByBusinessId.
 */
function createMockRepository(entries: KBEntry[]): IKBEntryRepository {
  return {
    findByBusinessId: vi.fn(async () => entries),
    findById: vi.fn(async () => null),
    countByBusinessId: vi.fn(async () => entries.length),
    countByBusinessIdAndCategory: vi.fn(async () => 0),
    create: vi.fn(async (entry: KBEntry) => entry),
    update: vi.fn(async () => null),
    delete: vi.fn(async () => {}),
    searchByBusinessId: vi.fn(async () => entries),
  };
}

/**
 * Replicates the entry matching logic from the service.
 */
function entryMatchesQuery(entry: KBEntry, queryKeywords: string[]): boolean {
  if (queryKeywords.length === 0) return false;

  const questionWords = extractKeywords(entry.question);
  const entryKeywords = entry.keywords.map((k) => k.toLowerCase());

  for (const keyword of queryKeywords) {
    if (questionWords.includes(keyword) || entryKeywords.includes(keyword)) {
      return true;
    }
  }
  return false;
}

describe('Property 17: KB language fallback to English', () => {
  it('returns English entries as fallback when no entries exist in the target non-English language', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(kbEntryWithLanguageArb('en'), { minLength: 1, maxLength: 10 }),
        fc.constantFrom(...NON_ENGLISH_LANGUAGES),
        async (englishEntries, targetLanguage) => {
          // Only English entries exist — no entries in the target language
          const repository = createMockRepository(englishEntries);
          const service = new KnowledgeBaseService(repository);

          // Pick a keyword from one of the English entries to guarantee a match
          const targetEntry = englishEntries[0];
          const keyword =
            targetEntry.keywords.length > 0
              ? targetEntry.keywords[0].toLowerCase()
              : extractKeywords(targetEntry.question)[0];

          if (!keyword) return; // Skip if no usable keyword

          const results = await service.search('biz-test', keyword, targetLanguage);

          // Should fall back to English entries
          expect(results.length).toBeGreaterThan(0);

          // All returned entries must have language='en'
          for (const result of results) {
            expect(result.language).toBe('en');
          }

          // All returned entries must match the keyword
          const queryKeywords = extractKeywords(keyword);
          for (const result of results) {
            expect(entryMatchesQuery(result, queryKeywords)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns target language entries when they exist and match, not English fallback', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NON_ENGLISH_LANGUAGES),
        nonStopWordArb,
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...KB_CATEGORIES),
        async (targetLanguage, sharedKeyword, id1, id2, category) => {
          // Create an English entry and a target-language entry that both match
          const englishEntry: KBEntry = {
            id: id1,
            businessId: 'biz-test',
            category,
            question: sharedKeyword,
            answer: 'English answer',
            language: 'en',
            keywords: [sharedKeyword],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const targetLangEntry: KBEntry = {
            id: id2,
            businessId: 'biz-test',
            category,
            question: sharedKeyword,
            answer: 'Respuesta en otro idioma',
            language: targetLanguage,
            keywords: [sharedKeyword],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const allEntries = [englishEntry, targetLangEntry];
          const repository = createMockRepository(allEntries);
          const service = new KnowledgeBaseService(repository);

          const results = await service.search('biz-test', sharedKeyword, targetLanguage);

          // Should return target language entries, NOT English fallback
          expect(results.length).toBeGreaterThan(0);
          for (const result of results) {
            expect(result.language).toBe(targetLanguage);
          }

          // English entry should NOT be in results
          expect(results.find((r) => r.id === englishEntry.id)).toBeUndefined();

          // Target language entry SHOULD be in results
          expect(results.find((r) => r.id === targetLangEntry.id)).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty results when neither target language nor English entries match', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(kbEntryWithLanguageArb('en'), { minLength: 1, maxLength: 10 }),
        fc.constantFrom(...NON_ENGLISH_LANGUAGES),
        nonStopWordArb,
        async (englishEntries, targetLanguage, queryWord) => {
          // Ensure the query word does NOT match any existing entry
          const allMatchableKeywords = new Set(
            englishEntries.flatMap((entry) => [
              ...entry.keywords.map((k) => k.toLowerCase()),
              ...extractKeywords(entry.question),
            ])
          );

          // Skip if the random word matches an entry
          if (allMatchableKeywords.has(queryWord.toLowerCase())) return;

          const repository = createMockRepository(englishEntries);
          const service = new KnowledgeBaseService(repository);

          const results = await service.search('biz-test', queryWord, targetLanguage);
          expect(results).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fallback only triggers for non-English target languages, not when searching in English', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonStopWordArb,
        fc.uuid(),
        fc.constantFrom(...KB_CATEGORIES),
        async (keyword, id, category) => {
          // Only a Spanish entry exists — no English entries
          const spanishEntry: KBEntry = {
            id,
            businessId: 'biz-test',
            category,
            question: keyword,
            answer: 'Respuesta',
            language: 'es',
            keywords: [keyword],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const repository = createMockRepository([spanishEntry]);
          const service = new KnowledgeBaseService(repository);

          // Searching in English should NOT return Spanish entries as fallback
          const results = await service.search('biz-test', keyword, 'en');
          expect(results).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all English fallback results match the query keywords', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(kbEntryWithLanguageArb('en'), { minLength: 2, maxLength: 10 }),
        fc.constantFrom(...NON_ENGLISH_LANGUAGES),
        async (englishEntries, targetLanguage) => {
          const repository = createMockRepository(englishEntries);
          const service = new KnowledgeBaseService(repository);

          // Use the keyword from the first entry
          const targetEntry = englishEntries[0];
          const keyword =
            targetEntry.keywords.length > 0
              ? targetEntry.keywords[0].toLowerCase()
              : extractKeywords(targetEntry.question)[0];

          if (!keyword) return;

          const results = await service.search('biz-test', keyword, targetLanguage);
          const queryKeywords = extractKeywords(keyword);

          // Every returned result must match the query
          for (const result of results) {
            expect(entryMatchesQuery(result, queryKeywords)).toBe(true);
            expect(result.language).toBe('en');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
