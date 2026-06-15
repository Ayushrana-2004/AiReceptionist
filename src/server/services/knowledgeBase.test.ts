import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KnowledgeBaseService,
  IKBEntryRepository,
  CreateKBEntryDTO,
  UpdateKBEntryDTO,
  extractKeywords,
} from './knowledgeBase';
import { KBEntry } from '../../shared/types/knowledgeBase';
import { KBCategory, Language } from '../../shared/types/enums';

// Mock Redis caching
vi.mock('../db/redis', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheInvalidatePattern: vi.fn().mockResolvedValue(undefined),
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-1234',
});

function createMockRepository(entries: KBEntry[] = []): IKBEntryRepository {
  let store = [...entries];

  return {
    findByBusinessId: vi.fn(async (businessId: string, category?: string) => {
      let result = store.filter((e) => e.businessId === businessId);
      if (category) {
        result = result.filter((e) => e.category === category);
      }
      return result;
    }),
    findById: vi.fn(async (entryId: string) => {
      return store.find((e) => e.id === entryId) || null;
    }),
    countByBusinessId: vi.fn(async (businessId: string) => {
      return store.filter((e) => e.businessId === businessId).length;
    }),
    countByBusinessIdAndCategory: vi.fn(async (businessId: string, category: string) => {
      return store.filter(
        (e) => e.businessId === businessId && e.category === category
      ).length;
    }),
    create: vi.fn(async (entry: KBEntry) => {
      store.push(entry);
      return entry;
    }),
    update: vi.fn(async (entryId: string, updates: Partial<KBEntry>) => {
      const index = store.findIndex((e) => e.id === entryId);
      if (index === -1) return null;
      store[index] = { ...store[index], ...updates };
      return store[index];
    }),
    delete: vi.fn(async (entryId: string) => {
      store = store.filter((e) => e.id !== entryId);
    }),
    searchByBusinessId: vi.fn(async (businessId: string) => {
      return store.filter((e) => e.businessId === businessId);
    }),
  };
}

function makeEntry(overrides: Partial<KBEntry> = {}): KBEntry {
  return {
    id: 'entry-1',
    businessId: 'biz-1',
    category: 'services' as KBCategory,
    question: 'What services do you offer?',
    answer: 'We offer web development and consulting.',
    language: 'en' as Language,
    keywords: ['services', 'offer'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let repository: IKBEntryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockRepository();
    service = new KnowledgeBaseService(repository);
  });

  describe('extractKeywords', () => {
    it('splits on whitespace and lowercases', () => {
      const result = extractKeywords('Hello World');
      expect(result).toEqual(['hello', 'world']);
    });

    it('removes common stop words', () => {
      const result = extractKeywords('what is the pricing for services');
      expect(result).toEqual(['pricing', 'services']);
    });

    it('handles empty string', () => {
      const result = extractKeywords('');
      expect(result).toEqual([]);
    });

    it('handles only stop words', () => {
      const result = extractKeywords('is the a an');
      expect(result).toEqual([]);
    });

    it('handles multiple spaces', () => {
      const result = extractKeywords('  hello   world  ');
      expect(result).toEqual(['hello', 'world']);
    });
  });

  describe('getEntries', () => {
    it('returns entries for a business', async () => {
      const entries = [makeEntry()];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const result = await service.getEntries('biz-1');
      expect(result).toEqual(entries);
    });

    it('filters by category when provided', async () => {
      const entries = [
        makeEntry({ id: '1', category: 'services' }),
        makeEntry({ id: '2', category: 'pricing' }),
      ];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const result = await service.getEntries('biz-1', 'services');
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('services');
    });
  });

  describe('createEntry', () => {
    it('creates an entry with auto-generated keywords when none provided', async () => {
      const dto: CreateKBEntryDTO = {
        category: 'services',
        question: 'What services do you offer?',
        answer: 'We offer web development.',
      };

      const result = await service.createEntry('biz-1', dto);

      expect(result.businessId).toBe('biz-1');
      expect(result.category).toBe('services');
      expect(result.question).toBe(dto.question);
      expect(result.answer).toBe(dto.answer);
      expect(result.language).toBe('en');
      expect(result.keywords).toEqual(['services', 'offer?']);
    });

    it('creates an entry with explicit keywords', async () => {
      const dto: CreateKBEntryDTO = {
        category: 'pricing',
        question: 'How much does it cost?',
        answer: '$50 per hour.',
        keywords: ['pricing', 'cost', 'rate'],
      };

      const result = await service.createEntry('biz-1', dto);
      expect(result.keywords).toEqual(['pricing', 'cost', 'rate']);
    });

    it('sets language to provided value', async () => {
      const dto: CreateKBEntryDTO = {
        category: 'services',
        question: '¿Qué servicios ofrecen?',
        answer: 'Ofrecemos desarrollo web.',
        language: 'es',
      };

      const result = await service.createEntry('biz-1', dto);
      expect(result.language).toBe('es');
    });

    it('throws when total capacity exceeded', async () => {
      // Simulate 500 existing entries
      const entries = Array.from({ length: 500 }, (_, i) =>
        makeEntry({ id: `entry-${i}` })
      );
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const dto: CreateKBEntryDTO = {
        category: 'services',
        question: 'New question',
        answer: 'New answer',
      };

      await expect(service.createEntry('biz-1', dto)).rejects.toThrow(
        /cannot exceed 500/i
      );
    });

    it('throws when category capacity exceeded', async () => {
      // Simulate 100 entries in one category
      const entries = Array.from({ length: 100 }, (_, i) =>
        makeEntry({ id: `entry-${i}`, category: 'services' })
      );
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const dto: CreateKBEntryDTO = {
        category: 'services',
        question: 'New question',
        answer: 'New answer',
      };

      await expect(service.createEntry('biz-1', dto)).rejects.toThrow(
        /cannot exceed 100/i
      );
    });
  });

  describe('updateEntry', () => {
    it('updates an existing entry', async () => {
      const entries = [makeEntry()];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const updates: UpdateKBEntryDTO = {
        answer: 'Updated answer content',
      };

      const result = await service.updateEntry('entry-1', updates);
      expect(result.answer).toBe('Updated answer content');
    });

    it('re-derives keywords when question is updated without explicit keywords', async () => {
      const entries = [makeEntry()];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const updates: UpdateKBEntryDTO = {
        question: 'What is your pricing?',
      };

      const result = await service.updateEntry('entry-1', updates);
      expect(result.keywords).toEqual(['pricing?']);
    });

    it('throws when entry not found', async () => {
      await expect(
        service.updateEntry('nonexistent', { answer: 'test' })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteEntry', () => {
    it('deletes an existing entry', async () => {
      const entries = [makeEntry()];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      await service.deleteEntry('entry-1');
      expect(repository.delete).toHaveBeenCalledWith('entry-1');
    });

    it('throws when entry not found', async () => {
      await expect(service.deleteEntry('nonexistent')).rejects.toThrow(
        /not found/i
      );
    });
  });

  describe('search', () => {
    it('returns entries matching keywords in question field', async () => {
      const entries = [
        makeEntry({
          id: '1',
          question: 'What are your business hours?',
          keywords: ['business', 'hours'],
        }),
        makeEntry({
          id: '2',
          question: 'What services do you offer?',
          keywords: ['services', 'offer'],
        }),
      ];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const results = await service.search('biz-1', 'business hours');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('returns entries matching keywords in keywords array', async () => {
      const entries = [
        makeEntry({
          id: '1',
          question: 'Opening times',
          keywords: ['hours', 'schedule', 'open'],
        }),
      ];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const results = await service.search('biz-1', 'schedule');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('returns empty array when no keywords match', async () => {
      const entries = [
        makeEntry({
          id: '1',
          question: 'What services do you offer?',
          keywords: ['services', 'offer'],
        }),
      ];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const results = await service.search('biz-1', 'parking garage');
      expect(results).toHaveLength(0);
    });

    it('returns empty array when query has only stop words', async () => {
      const entries = [makeEntry()];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      const results = await service.search('biz-1', 'is the a');
      expect(results).toEqual([]);
    });

    it('falls back to English entries when target language has no matches', async () => {
      const entries = [
        makeEntry({
          id: '1',
          question: 'What are your hours?',
          keywords: ['hours'],
          language: 'en',
        }),
        makeEntry({
          id: '2',
          question: '¿Cuáles son sus horarios?',
          keywords: ['horarios'],
          language: 'es',
        }),
      ];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      // Search in Spanish for "hours" - no Spanish entry matches "hours"
      const results = await service.search('biz-1', 'hours', 'es');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
      expect(results[0].language).toBe('en');
    });

    it('returns target language entries when available', async () => {
      const entries = [
        makeEntry({
          id: '1',
          question: 'What are your hours?',
          keywords: ['hours'],
          language: 'en',
        }),
        makeEntry({
          id: '2',
          question: '¿Cuáles son sus hours?',
          keywords: ['hours', 'horarios'],
          language: 'es',
        }),
      ];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      // Search in Spanish for "hours" - Spanish entry matches "hours"
      const results = await service.search('biz-1', 'hours', 'es');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('2');
      expect(results[0].language).toBe('es');
    });

    it('does not fall back if already searching in English', async () => {
      const entries = [
        makeEntry({
          id: '1',
          question: 'What is your location?',
          keywords: ['location'],
          language: 'en',
        }),
      ];
      repository = createMockRepository(entries);
      service = new KnowledgeBaseService(repository);

      // Search in English for something that doesn't match
      const results = await service.search('biz-1', 'parking', 'en');
      expect(results).toHaveLength(0);
    });
  });
});
