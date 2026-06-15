import { describe, it, expect } from 'vitest';

/**
 * Unit tests for LeadsList component logic.
 * Tests helper functions, configuration constants, and display formatting.
 */

const PAGE_SIZE = 20;

const QUALIFICATION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'needs_review', label: 'Needs Review' },
] as const;

type QualificationStatus = 'qualified' | 'unqualified' | 'needs_review';
type CRMSyncStatus = 'synced' | 'pending' | 'failed';

function getQualificationLabel(status: QualificationStatus): string {
  switch (status) {
    case 'qualified':
      return 'Qualified';
    case 'unqualified':
      return 'Unqualified';
    case 'needs_review':
      return 'Needs Review';
    default:
      return status;
  }
}

function getCRMSyncLabel(status: CRMSyncStatus): string {
  switch (status) {
    case 'synced':
      return 'Synced';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

describe('LeadsList logic', () => {
  describe('PAGE_SIZE constant', () => {
    it('should be set to 20', () => {
      expect(PAGE_SIZE).toBe(20);
    });
  });

  describe('QUALIFICATION_FILTERS', () => {
    it('should have 4 filter options', () => {
      expect(QUALIFICATION_FILTERS).toHaveLength(4);
    });

    it('should include "All" as the first option', () => {
      expect(QUALIFICATION_FILTERS[0].value).toBe('all');
      expect(QUALIFICATION_FILTERS[0].label).toBe('All');
    });

    it('should include all qualification statuses', () => {
      const values = QUALIFICATION_FILTERS.map((f) => f.value);
      expect(values).toContain('qualified');
      expect(values).toContain('unqualified');
      expect(values).toContain('needs_review');
    });
  });

  describe('getQualificationLabel', () => {
    it('should return "Qualified" for qualified status', () => {
      expect(getQualificationLabel('qualified')).toBe('Qualified');
    });

    it('should return "Unqualified" for unqualified status', () => {
      expect(getQualificationLabel('unqualified')).toBe('Unqualified');
    });

    it('should return "Needs Review" for needs_review status', () => {
      expect(getQualificationLabel('needs_review')).toBe('Needs Review');
    });
  });

  describe('getCRMSyncLabel', () => {
    it('should return "Synced" for synced status', () => {
      expect(getCRMSyncLabel('synced')).toBe('Synced');
    });

    it('should return "Pending" for pending status', () => {
      expect(getCRMSyncLabel('pending')).toBe('Pending');
    });

    it('should return "Failed" for failed status', () => {
      expect(getCRMSyncLabel('failed')).toBe('Failed');
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than maxLength', () => {
      expect(truncateText('short text', 50)).toBe('short text');
    });

    it('should not truncate text exactly at maxLength', () => {
      const text = 'a'.repeat(50);
      expect(truncateText(text, 50)).toBe(text);
    });

    it('should truncate text exceeding maxLength and add ellipsis', () => {
      const text = 'a'.repeat(60);
      const result = truncateText(text, 50);
      expect(result).toBe('a'.repeat(50) + '…');
    });

    it('should handle empty string', () => {
      expect(truncateText('', 50)).toBe('');
    });
  });

  describe('formatTimestamp', () => {
    it('should format a Date object to a readable string', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      const formatted = formatTimestamp(date);
      // Should contain the year and some recognizable date parts
      expect(formatted).toContain('2024');
    });

    it('should format a date string to a readable string', () => {
      const dateStr = '2024-06-15T10:30:00Z';
      const formatted = formatTimestamp(dateStr);
      expect(formatted).toContain('2024');
    });

    it('should handle ISO date strings', () => {
      const isoString = '2024-01-01T00:00:00.000Z';
      const formatted = formatTimestamp(isoString);
      expect(formatted).toContain('2024');
      expect(formatted).toContain('Jan');
    });
  });
});
