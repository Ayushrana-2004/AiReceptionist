/**
 * Feature: ai-receptionist, Property 5: Knowledge Base search returns keyword-matching entries
 *
 * Validates: Requirements 3.2, 3.3
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  KnowledgeBaseService,
  IKBEntryRepository,
  extractKeywords,
} from './knowledgeBase';
import { KBEntry } from '../../shared/types/knowledgeBase';
import { KBCategory } from '../../shared/types/enums';

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

/**
 * Generator for non-stop-word keywords (words that extractKeywords won't filter out).
 * We generate lowercase alphabetic words that are not in the stop words list.
 */
const nonStopWordArb = fc.stringMatching(/^[a-z]{3,10}$/).filter((word) => {
  const extracted = extractKeywords(word);
  return extracted.length === 1 && extracted[0] === word;
});

/**
 * Generator for a KB entry with known keywords.
 */
const kbEntryArb = fc
  .record({
    id: fc.uuid(),
    businessId: fc.constant('biz-test'),
    category: fc.constantFrom(...KB_CATEGORIES),
    keywords: fc.array(nonStopWordArb, { minLength: 1, maxLength: 5 }),
    questionKeywords: fc.array(nonStopWordArb, { minLength: 1, maxLength: 5 }),
    answer: fc.string({ minLength: 1, maxLength: 100 }),
  })
  .map(({ id, businessId, category, keywords, questionKeywords, answer }) => {
    const question = questionKeywords.join(' ');
    return {
      entry: {
        id,
        businessId,
        category,
        question,
        answer,
        language: 'en' as const,
        keywords,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as KBEntry,
      // All keywords that should cause a match for this entry
      matchableKeywords: new Set([
        ...keywords.map((k) => k.toLowerCase()),
        ...extractKeywords(question),
      ]),
    };
  });

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
 * Determines if an entry matches given query keywords, replicating the
 * entryMatchesKeywords logic from the service.
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

describe('Property 5: Knowledge Base search returns keyword-matching entries', () => {
  it('returns all-and-only entries matching query keywords', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(kbEntryArb, { minLength: 1, maxLength: 10 }),
        nonStopWordArb,
        async (entryData, queryWord) => {
          const entries = entryData.map((ed) => ed.entry);
          const query = queryWord;
          const queryKeywords = extractKeywords(query);

          const repository = createMockRepository(entries);
          const service = new KnowledgeBaseService(repository);

          const results = await service.search('biz-test', query, 'en');

          // Compute expected results using the same matching logic
          const expectedMatches = entries.filter((entry) =>
            entryMatchesQuery(entry, queryKeywords)
          );

          // All-and-only: results should contain exactly the expected matches
          expect(results.length).toBe(expectedMatches.length);
          for (const expected of expectedMatches) {
            expect(results.find((r) => r.id === expected.id)).toBeDefined();
          }
          for (const result of results) {
            expect(expectedMatches.find((e) => e.id === result.id)).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns entries when query contains a keyword from entry keywords array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(kbEntryArb, { minLength: 1, maxLength: 10 }),
        async (entryData) => {
          const entries = entryData.map((ed) => ed.entry);

          // Pick a keyword from one of the entries to guarantee at least one match
          const targetEntry = entries[0];
          const targetKeyword =
            targetEntry.keywords.length > 0
              ? targetEntry.keywords[0].toLowerCase()
              : extractKeywords(targetEntry.question)[0];

          if (!targetKeyword) return; // Skip if no usable keyword

          const repository = createMockRepository(entries);
          const service = new KnowledgeBaseService(repository);

          const results = await service.search('biz-test', targetKeyword, 'en');

          // The target entry must be in results
          expect(results.find((r) => r.id === targetEntry.id)).toBeDefined();

          // Every result must actually match the keyword
          for (const result of results) {
            expect(entryMatchesQuery(result, extractKeywords(targetKeyword))).toBe(
              true
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty results when query keywords do not match any entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(kbEntryArb, { minLength: 1, maxLength: 10 }),
        nonStopWordArb,
        async (entryData, randomWord) => {
          const entries = entryData.map((ed) => ed.entry);

          // Ensure the random word does NOT appear in any entry's keywords or question
          const allMatchableKeywords = new Set(
            entries.flatMap((entry) => [
              ...entry.keywords.map((k) => k.toLowerCase()),
              ...extractKeywords(entry.question),
            ])
          );

          // Skip if the random word happens to match an existing entry
          if (allMatchableKeywords.has(randomWord.toLowerCase())) return;

          const repository = createMockRepository(entries);
          const service = new KnowledgeBaseService(repository);

          const results = await service.search('biz-test', randomWord, 'en');
          expect(results).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty results when query contains only stop words', async () => {
    const stopWordQueries = [
      'is the a an',
      'to of in for on with',
      'and but or',
      'this that these those',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.array(kbEntryArb, { minLength: 1, maxLength: 5 }),
        fc.constantFrom(...stopWordQueries),
        async (entryData, query) => {
          const entries = entryData.map((ed) => ed.entry);
          const repository = createMockRepository(entries);
          const service = new KnowledgeBaseService(repository);

          const results = await service.search('biz-test', query, 'en');
          expect(results).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('query keyword matching is case-insensitive', async () => {
    await fc.assert(
      fc.asyncProperty(
        kbEntryArb,
        async (entryData) => {
          const entry = entryData.entry;
          const keyword =
            entry.keywords.length > 0
              ? entry.keywords[0]
              : extractKeywords(entry.question)[0];

          if (!keyword) return;

          // Create uppercase version of the keyword
          const uppercaseQuery = keyword.toUpperCase();
          const entries = [entry];
          const repository = createMockRepository(entries);
          const service = new KnowledgeBaseService(repository);

          const results = await service.search('biz-test', uppercaseQuery, 'en');

          // Should still match because extractKeywords lowercases the query
          expect(results.find((r) => r.id === entry.id)).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
