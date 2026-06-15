/**
 * Feature: ai-receptionist, Property 14: Call history filtering returns only matching records
 *
 * Validates: Requirements 7.3
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterCallHistory, CallHistoryFilters } from './callHistory';
import { CallRecord } from '../../shared/types';
import { CallMetadata } from '../../shared/types/common';
import { CallStatus, Language } from '../../shared/types/enums';

const CALL_STATUSES: CallStatus[] = ['active', 'queued', 'completed', 'failed'];
const LANGUAGES: Language[] = ['en', 'es', 'fr', 'zh'];
const OUTCOME_CATEGORIES = [
  'appointment_booked',
  'lead_captured',
  'transferred',
  'voicemail',
  'faq_answered',
  'missed',
];

/**
 * Arbitrary for CallMetadata.
 */
const callMetadataArb: fc.Arbitrary<CallMetadata> = fc.record({
  vapiCallId: fc.uuid(),
  assistantId: fc.uuid(),
  transferAttempts: fc.integer({ min: 0, max: 5 }),
  sttFailures: fc.integer({ min: 0, max: 3 }),
  languageDetected: fc.constantFrom(...LANGUAGES),
  toolCallsMade: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
    minLength: 0,
    maxLength: 5,
  }),
});

/**
 * Arbitrary for a CallRecord with varied data.
 */
const callRecordArb: fc.Arbitrary<CallRecord> = fc.record({
  id: fc.uuid(),
  businessId: fc.constantFrom('biz-1', 'biz-2', 'biz-3'),
  callerNumber: fc.constantFrom(
    '+15551234567',
    '+15559876543',
    '+442071234567',
    '+33123456789',
    '+8613800138000'
  ),
  startedAt: fc.date({
    min: new Date('2024-01-01'),
    max: new Date('2024-12-31'),
  }),
  endedAt: fc.date({
    min: new Date('2024-01-01'),
    max: new Date('2024-12-31'),
  }),
  durationSeconds: fc.integer({ min: 0, max: 1800 }),
  status: fc.constantFrom(...CALL_STATUSES),
  outcomeCategory: fc.constantFrom(...OUTCOME_CATEGORIES),
  summaryText: fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 50, maxLength: 200 })
  ),
  transcriptUrl: fc.oneof(fc.constant(null), fc.webUrl()),
  intentClassification: fc.constantFrom(
    'booking',
    'faq',
    'routing',
    'lead_capture',
    'general'
  ),
  language: fc.constantFrom(...LANGUAGES),
  metadata: callMetadataArb,
});

/**
 * Arbitrary for filter criteria where each field is optionally provided.
 */
const filtersArb: fc.Arbitrary<CallHistoryFilters> = fc.record(
  {
    outcomeCategory: fc.constantFrom(...OUTCOME_CATEGORIES),
    dateFrom: fc.date({
      min: new Date('2024-01-01'),
      max: new Date('2024-12-31'),
    }),
    dateTo: fc.date({
      min: new Date('2024-01-01'),
      max: new Date('2024-12-31'),
    }),
    callerNumber: fc.constantFrom(
      '+15551234567',
      '+15559876543',
      '+442071234567',
      '+33123456789',
      '+8613800138000'
    ),
    keyword: fc.string({ minLength: 1, maxLength: 20 }),
  },
  {
    requiredKeys: [], // All fields are optional
  }
);

/**
 * Helper that determines if a single record matches all applied filter criteria.
 * Replicates the logic from filterCallHistory for verification.
 */
function recordMatchesFilters(
  record: CallRecord,
  filters: CallHistoryFilters
): boolean {
  if (
    filters.outcomeCategory !== undefined &&
    record.outcomeCategory !== filters.outcomeCategory
  ) {
    return false;
  }

  if (filters.dateFrom !== undefined && record.startedAt < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo !== undefined && record.startedAt > filters.dateTo) {
    return false;
  }

  if (
    filters.callerNumber !== undefined &&
    record.callerNumber !== filters.callerNumber
  ) {
    return false;
  }

  if (filters.keyword !== undefined) {
    const keywordLower = filters.keyword.toLowerCase();
    const summaryMatch =
      record.summaryText !== null &&
      record.summaryText.toLowerCase().includes(keywordLower);

    const metadataMatch = hasKeywordInMetadata(record.metadata, keywordLower);

    if (!summaryMatch && !metadataMatch) {
      return false;
    }
  }

  return true;
}

/**
 * Checks metadata fields for keyword match (mirrors the implementation).
 */
function hasKeywordInMetadata(
  metadata: CallMetadata,
  keywordLower: string
): boolean {
  if (!metadata) return false;

  if (
    metadata.vapiCallId &&
    metadata.vapiCallId.toLowerCase().includes(keywordLower)
  ) {
    return true;
  }
  if (
    metadata.assistantId &&
    metadata.assistantId.toLowerCase().includes(keywordLower)
  ) {
    return true;
  }
  if (
    metadata.languageDetected &&
    metadata.languageDetected.toLowerCase().includes(keywordLower)
  ) {
    return true;
  }

  if (metadata.toolCallsMade && Array.isArray(metadata.toolCallsMade)) {
    for (const entry of metadata.toolCallsMade) {
      if (entry.toLowerCase().includes(keywordLower)) {
        return true;
      }
    }
  }

  return false;
}

describe('Property 14: Call history filtering returns only matching records', () => {
  it('all returned records satisfy every applied filter condition', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 0, maxLength: 30 }),
        filtersArb,
        (records, filters) => {
          const results = filterCallHistory(records, filters);

          // Every returned record must satisfy all applied filters
          for (const record of results) {
            if (filters.outcomeCategory !== undefined) {
              expect(record.outcomeCategory).toBe(filters.outcomeCategory);
            }
            if (filters.dateFrom !== undefined) {
              expect(record.startedAt >= filters.dateFrom).toBe(true);
            }
            if (filters.dateTo !== undefined) {
              expect(record.startedAt <= filters.dateTo).toBe(true);
            }
            if (filters.callerNumber !== undefined) {
              expect(record.callerNumber).toBe(filters.callerNumber);
            }
            if (filters.keyword !== undefined) {
              const keywordLower = filters.keyword.toLowerCase();
              const summaryMatch =
                record.summaryText !== null &&
                record.summaryText.toLowerCase().includes(keywordLower);
              const metadataMatch = hasKeywordInMetadata(
                record.metadata,
                keywordLower
              );
              expect(summaryMatch || metadataMatch).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no record satisfying all conditions is omitted from results', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 0, maxLength: 30 }),
        filtersArb,
        (records, filters) => {
          const results = filterCallHistory(records, filters);
          const resultIds = new Set(results.map((r) => r.id));

          // Every record that matches all filters must appear in results
          for (const record of records) {
            if (recordMatchesFilters(record, filters)) {
              expect(resultIds.has(record.id)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returned count equals the count of matching records in input', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 0, maxLength: 30 }),
        filtersArb,
        (records, filters) => {
          const results = filterCallHistory(records, filters);
          const expectedCount = records.filter((r) =>
            recordMatchesFilters(r, filters)
          ).length;

          expect(results.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('keyword filter is case-insensitive on summaryText', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (records, keyword) => {
          const lowerFilters: CallHistoryFilters = {
            keyword: keyword.toLowerCase(),
          };
          const upperFilters: CallHistoryFilters = {
            keyword: keyword.toUpperCase(),
          };

          const lowerResults = filterCallHistory(records, lowerFilters);
          const upperResults = filterCallHistory(records, upperFilters);

          // Case-insensitive: both should return same set of records
          expect(lowerResults.length).toBe(upperResults.length);
          const lowerIds = new Set(lowerResults.map((r) => r.id));
          for (const result of upperResults) {
            expect(lowerIds.has(result.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty filters return all records', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 0, maxLength: 30 }),
        (records) => {
          const results = filterCallHistory(records, {});
          expect(results.length).toBe(records.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
