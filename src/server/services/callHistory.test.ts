import { describe, it, expect } from 'vitest';
import { filterCallHistory, CallHistoryFilters } from './callHistory';
import { CallRecord } from '../../shared/types';

function makeRecord(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: 'call-1',
    businessId: 'biz-1',
    callerNumber: '+15551234567',
    startedAt: new Date('2024-06-15T10:00:00Z'),
    endedAt: new Date('2024-06-15T10:05:00Z'),
    durationSeconds: 300,
    status: 'completed',
    outcomeCategory: 'appointment_booked',
    summaryText: 'Caller booked a dental cleaning appointment',
    transcriptUrl: 's3://transcripts/call-1.json',
    intentClassification: 'booking',
    language: 'en',
    metadata: {
      vapiCallId: 'vapi-123',
      assistantId: 'asst-456',
      transferAttempts: 0,
      sttFailures: 0,
      languageDetected: 'en',
      toolCallsMade: ['check_availability', 'book_appointment'],
    },
    ...overrides,
  };
}

describe('filterCallHistory', () => {
  const records: CallRecord[] = [
    makeRecord({
      id: 'call-1',
      callerNumber: '+15551234567',
      startedAt: new Date('2024-06-10T09:00:00Z'),
      outcomeCategory: 'appointment_booked',
      summaryText: 'Caller booked a dental cleaning appointment',
    }),
    makeRecord({
      id: 'call-2',
      callerNumber: '+15559876543',
      startedAt: new Date('2024-06-12T14:30:00Z'),
      outcomeCategory: 'information_provided',
      summaryText: 'Caller asked about pricing for root canal',
    }),
    makeRecord({
      id: 'call-3',
      callerNumber: '+15551234567',
      startedAt: new Date('2024-06-14T11:00:00Z'),
      outcomeCategory: 'transferred',
      summaryText: 'Caller wanted to speak with a specialist',
    }),
    makeRecord({
      id: 'call-4',
      callerNumber: '+15552223333',
      startedAt: new Date('2024-06-16T08:00:00Z'),
      outcomeCategory: 'lead_captured',
      summaryText: null,
      metadata: {
        vapiCallId: 'vapi-789',
        assistantId: 'asst-456',
        transferAttempts: 0,
        sttFailures: 1,
        languageDetected: 'es',
        toolCallsMade: ['capture_lead', 'transcript: patient inquiry about braces'],
      },
    }),
    makeRecord({
      id: 'call-5',
      callerNumber: '+15554445555',
      startedAt: new Date('2024-06-18T16:00:00Z'),
      outcomeCategory: 'appointment_booked',
      summaryText: 'Booked whitening session for next week',
    }),
  ];

  describe('no filters', () => {
    it('returns all records when no filters are applied', () => {
      const result = filterCallHistory(records, {});
      expect(result).toHaveLength(5);
      expect(result).toEqual(records);
    });
  });

  describe('outcomeCategory filter', () => {
    it('returns only records matching the outcome category', () => {
      const filters: CallHistoryFilters = { outcomeCategory: 'appointment_booked' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.outcomeCategory === 'appointment_booked')).toBe(true);
    });

    it('returns empty array when no records match the category', () => {
      const filters: CallHistoryFilters = { outcomeCategory: 'voicemail' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(0);
    });
  });

  describe('date range filters', () => {
    it('filters records with dateFrom (startedAt >= dateFrom)', () => {
      const filters: CallHistoryFilters = {
        dateFrom: new Date('2024-06-14T00:00:00Z'),
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(['call-3', 'call-4', 'call-5']);
    });

    it('filters records with dateTo (startedAt <= dateTo)', () => {
      const filters: CallHistoryFilters = {
        dateTo: new Date('2024-06-12T14:30:00Z'),
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['call-1', 'call-2']);
    });

    it('filters records within a date range', () => {
      const filters: CallHistoryFilters = {
        dateFrom: new Date('2024-06-12T00:00:00Z'),
        dateTo: new Date('2024-06-15T00:00:00Z'),
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['call-2', 'call-3']);
    });

    it('returns empty when date range has no matching records', () => {
      const filters: CallHistoryFilters = {
        dateFrom: new Date('2025-01-01T00:00:00Z'),
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(0);
    });
  });

  describe('callerNumber filter', () => {
    it('returns only records with matching caller number', () => {
      const filters: CallHistoryFilters = { callerNumber: '+15551234567' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['call-1', 'call-3']);
    });

    it('returns empty array when caller number does not match', () => {
      const filters: CallHistoryFilters = { callerNumber: '+10000000000' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(0);
    });
  });

  describe('keyword filter', () => {
    it('matches keyword in summaryText (case-insensitive)', () => {
      const filters: CallHistoryFilters = { keyword: 'dental' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call-1');
    });

    it('matches keyword case-insensitively', () => {
      const filters: CallHistoryFilters = { keyword: 'PRICING' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call-2');
    });

    it('matches keyword in metadata toolCallsMade entries', () => {
      const filters: CallHistoryFilters = { keyword: 'braces' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call-4');
    });

    it('matches keyword in metadata languageDetected', () => {
      const filters: CallHistoryFilters = { keyword: 'es' };
      const result = filterCallHistory(records, filters);
      // call-4 has languageDetected 'es', also summaryText entries may contain 'es'
      expect(result.some((r) => r.id === 'call-4')).toBe(true);
    });

    it('returns empty when keyword is not found anywhere', () => {
      const filters: CallHistoryFilters = { keyword: 'zzzznonexistentzzzz' };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(0);
    });

    it('does not match when summaryText is null and metadata has no match', () => {
      // call-4 has null summaryText — keyword "dental" should not match it
      const filters: CallHistoryFilters = { keyword: 'dental' };
      const result = filterCallHistory(records, filters);
      expect(result.every((r) => r.id !== 'call-4')).toBe(true);
    });
  });

  describe('combined filters (AND logic)', () => {
    it('applies outcome category AND date range together', () => {
      const filters: CallHistoryFilters = {
        outcomeCategory: 'appointment_booked',
        dateFrom: new Date('2024-06-16T00:00:00Z'),
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call-5');
    });

    it('applies caller number AND keyword together', () => {
      const filters: CallHistoryFilters = {
        callerNumber: '+15551234567',
        keyword: 'specialist',
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call-3');
    });

    it('applies all filters together', () => {
      const filters: CallHistoryFilters = {
        outcomeCategory: 'appointment_booked',
        dateFrom: new Date('2024-06-01T00:00:00Z'),
        dateTo: new Date('2024-06-11T00:00:00Z'),
        callerNumber: '+15551234567',
        keyword: 'dental',
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call-1');
    });

    it('returns empty when combined filters exclude all records', () => {
      const filters: CallHistoryFilters = {
        outcomeCategory: 'transferred',
        callerNumber: '+15559876543', // call-2 has this number but different outcome
      };
      const result = filterCallHistory(records, filters);
      expect(result).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty records array', () => {
      const filters: CallHistoryFilters = { outcomeCategory: 'appointment_booked' };
      const result = filterCallHistory([], filters);
      expect(result).toHaveLength(0);
    });

    it('handles empty keyword string (matches all records)', () => {
      // An empty string is a substring of any string
      const filters: CallHistoryFilters = { keyword: '' };
      const result = filterCallHistory(records, filters);
      // Records with null summaryText won't match unless metadata contains ''
      // Empty string is contained in every string via .includes('')
      expect(result).toHaveLength(5);
    });
  });
});
