/**
 * Knowledge Base Service
 *
 * Implements IKnowledgeBaseService with:
 * - CRUD operations with category enforcement and capacity checks
 * - Keyword-based search matching against entry question/topic fields
 * - Language fallback: returns English entries when target language has no matches
 * - Redis caching with 60s TTL for propagation
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */

import { KBEntry } from '../../shared/types/knowledgeBase';
import { KBCategory, Language } from '../../shared/types/enums';
import { canAddKBEntry } from '../validators/capacityValidator';
import { cacheGet, cacheSet, cacheInvalidatePattern } from '../db/redis';

// ============================================================
// DTOs
// ============================================================

export interface CreateKBEntryDTO {
  category: KBCategory;
  question: string;
  answer: string;
  language?: Language;
  keywords?: string[];
}

export interface UpdateKBEntryDTO {
  category?: KBCategory;
  question?: string;
  answer?: string;
  language?: Language;
  keywords?: string[];
}

// ============================================================
// Repository Interface (for testability / DI)
// ============================================================

export interface IKBEntryRepository {
  findByBusinessId(businessId: string, category?: string): Promise<KBEntry[]>;
  findById(entryId: string): Promise<KBEntry | null>;
  countByBusinessId(businessId: string): Promise<number>;
  countByBusinessIdAndCategory(businessId: string, category: string): Promise<number>;
  create(entry: KBEntry): Promise<KBEntry>;
  update(entryId: string, updates: Partial<KBEntry>): Promise<KBEntry | null>;
  delete(entryId: string): Promise<void>;
  searchByBusinessId(businessId: string): Promise<KBEntry[]>;
}

// ============================================================
// Service Interface
// ============================================================

export interface IKnowledgeBaseService {
  getEntries(businessId: string, category?: string): Promise<KBEntry[]>;
  createEntry(businessId: string, entry: CreateKBEntryDTO): Promise<KBEntry>;
  updateEntry(entryId: string, updates: UpdateKBEntryDTO): Promise<KBEntry>;
  deleteEntry(entryId: string): Promise<void>;
  search(businessId: string, query: string, language?: string): Promise<KBEntry[]>;
}

// ============================================================
// Constants
// ============================================================

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = 'kb';

/**
 * Common English stop words to exclude from keyword extraction.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'about', 'up', 'this', 'that',
  'these', 'those', 'what', 'which', 'who', 'whom', 'when', 'where',
  'why', 'how', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
]);

// ============================================================
// Helpers
// ============================================================

/**
 * Extracts keywords from a query string:
 * - Split on whitespace
 * - Lowercase
 * - Remove common stop words
 * - Remove empty strings
 */
export function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

/**
 * Checks if a KB entry matches any of the given keywords.
 * Matches against the entry's question field and keywords array.
 */
function entryMatchesKeywords(entry: KBEntry, keywords: string[]): boolean {
  if (keywords.length === 0) return false;

  const questionWords = extractKeywords(entry.question);
  const entryKeywords = entry.keywords.map((k) => k.toLowerCase());

  for (const keyword of keywords) {
    if (questionWords.includes(keyword) || entryKeywords.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a cache key for a business's KB entries.
 */
function buildCacheKey(businessId: string, category?: string): string {
  if (category) {
    return `${CACHE_KEY_PREFIX}:${businessId}:${category}`;
  }
  return `${CACHE_KEY_PREFIX}:${businessId}:all`;
}

/**
 * Generates a UUID-like identifier.
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================
// Service Implementation
// ============================================================

export class KnowledgeBaseService implements IKnowledgeBaseService {
  constructor(private readonly repository: IKBEntryRepository) {}

  async getEntries(businessId: string, category?: string): Promise<KBEntry[]> {
    const cacheKey = buildCacheKey(businessId, category);

    // Try cache first
    const cached = await cacheGet<KBEntry[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from repository
    const entries = await this.repository.findByBusinessId(businessId, category);

    // Cache with TTL
    await cacheSet(cacheKey, entries, CACHE_TTL_SECONDS);

    return entries;
  }

  async createEntry(businessId: string, dto: CreateKBEntryDTO): Promise<KBEntry> {
    // Capacity validation
    const currentTotal = await this.repository.countByBusinessId(businessId);
    const currentCategoryCount = await this.repository.countByBusinessIdAndCategory(
      businessId,
      dto.category
    );

    const capacityResult = canAddKBEntry(currentTotal, currentCategoryCount);
    if (!capacityResult.valid) {
      throw new Error(capacityResult.error!.message);
    }

    // Build the entry
    const now = new Date();
    const entry: KBEntry = {
      id: generateId(),
      businessId,
      category: dto.category,
      question: dto.question,
      answer: dto.answer,
      language: dto.language || 'en',
      keywords: dto.keywords || extractKeywords(dto.question),
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.create(entry);

    // Invalidate cache for this business
    await this.invalidateBusinessCache(businessId);

    return created;
  }

  async updateEntry(entryId: string, updates: UpdateKBEntryDTO): Promise<KBEntry> {
    const existing = await this.repository.findById(entryId);
    if (!existing) {
      throw new Error(`KB entry not found: ${entryId}`);
    }

    // If question is updated and no explicit keywords provided, re-derive keywords
    const updatedFields: Partial<KBEntry> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.question && !updates.keywords) {
      updatedFields.keywords = extractKeywords(updates.question);
    }

    const updated = await this.repository.update(entryId, updatedFields);
    if (!updated) {
      throw new Error(`Failed to update KB entry: ${entryId}`);
    }

    // Invalidate cache for this business
    await this.invalidateBusinessCache(existing.businessId);

    return updated;
  }

  async deleteEntry(entryId: string): Promise<void> {
    const existing = await this.repository.findById(entryId);
    if (!existing) {
      throw new Error(`KB entry not found: ${entryId}`);
    }

    await this.repository.delete(entryId);

    // Invalidate cache for this business
    await this.invalidateBusinessCache(existing.businessId);
  }

  async search(
    businessId: string,
    query: string,
    language?: string
  ): Promise<KBEntry[]> {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) {
      return [];
    }

    // Retrieve all entries for the business (from cache if available)
    const allEntries = await this.getAllEntriesForSearch(businessId);

    const targetLanguage: Language = (language as Language) || 'en';

    // Filter entries by target language and keyword match
    const languageMatches = allEntries.filter(
      (entry) =>
        entry.language === targetLanguage && entryMatchesKeywords(entry, keywords)
    );

    if (languageMatches.length > 0) {
      return languageMatches;
    }

    // Language fallback: if target language has no matches, try English
    if (targetLanguage !== 'en') {
      const englishMatches = allEntries.filter(
        (entry) =>
          entry.language === 'en' && entryMatchesKeywords(entry, keywords)
      );
      return englishMatches;
    }

    return [];
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async getAllEntriesForSearch(businessId: string): Promise<KBEntry[]> {
    const cacheKey = buildCacheKey(businessId);

    const cached = await cacheGet<KBEntry[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const entries = await this.repository.searchByBusinessId(businessId);
    await cacheSet(cacheKey, entries, CACHE_TTL_SECONDS);
    return entries;
  }

  private async invalidateBusinessCache(businessId: string): Promise<void> {
    await cacheInvalidatePattern(`${CACHE_KEY_PREFIX}:${businessId}:*`);
  }
}
