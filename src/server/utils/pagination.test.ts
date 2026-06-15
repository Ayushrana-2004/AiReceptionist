import { describe, it, expect } from 'vitest';
import { paginate, sortByMostRecent, PaginationOptions } from './pagination';

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));

  describe('default behavior', () => {
    it('returns first 20 items when no options provided', () => {
      const result = paginate(items);
      expect(result.items).toHaveLength(20);
      expect(result.items[0]).toEqual({ id: 1 });
      expect(result.items[19]).toEqual({ id: 20 });
      expect(result.currentPage).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalItems).toBe(50);
      expect(result.totalPages).toBe(3);
    });

    it('uses default page 1 and pageSize 20', () => {
      const result = paginate(items, {});
      expect(result.currentPage).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe('correct slicing', () => {
    it('returns correct slice for page 2', () => {
      const result = paginate(items, { page: 2 });
      expect(result.items).toHaveLength(20);
      expect(result.items[0]).toEqual({ id: 21 });
      expect(result.items[19]).toEqual({ id: 40 });
    });

    it('returns correct slice for last page with partial items', () => {
      const result = paginate(items, { page: 3 });
      expect(result.items).toHaveLength(10);
      expect(result.items[0]).toEqual({ id: 41 });
      expect(result.items[9]).toEqual({ id: 50 });
    });

    it('returns correct slice with custom page size', () => {
      const result = paginate(items, { page: 2, pageSize: 10 });
      expect(result.items).toHaveLength(10);
      expect(result.items[0]).toEqual({ id: 11 });
      expect(result.items[9]).toEqual({ id: 20 });
      expect(result.totalPages).toBe(5);
    });
  });

  describe('total pages calculation', () => {
    it('calculates total pages as ceil(N/P)', () => {
      expect(paginate(items, { pageSize: 20 }).totalPages).toBe(3);
      expect(paginate(items, { pageSize: 25 }).totalPages).toBe(2);
      expect(paginate(items, { pageSize: 50 }).totalPages).toBe(1);
      expect(paginate(items, { pageSize: 51 }).totalPages).toBe(1);
    });

    it('returns minimum 1 total page for empty array', () => {
      const result = paginate([]);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('page beyond available pages', () => {
    it('returns empty items when page exceeds total pages', () => {
      const result = paginate(items, { page: 100 });
      expect(result.items).toHaveLength(0);
      expect(result.totalItems).toBe(50);
      expect(result.currentPage).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('handles empty array', () => {
      const result = paginate([]);
      expect(result.items).toHaveLength(0);
      expect(result.totalItems).toBe(0);
      expect(result.totalPages).toBe(1);
      expect(result.currentPage).toBe(1);
    });

    it('treats page=0 as page 1', () => {
      const result = paginate(items, { page: 0 });
      expect(result.currentPage).toBe(1);
      expect(result.items[0]).toEqual({ id: 1 });
    });

    it('treats negative page numbers as page 1', () => {
      const result = paginate(items, { page: -5 });
      expect(result.currentPage).toBe(1);
      expect(result.items[0]).toEqual({ id: 1 });
    });

    it('treats negative pageSize as default 20', () => {
      const result = paginate(items, { pageSize: -10 });
      expect(result.pageSize).toBe(20);
      expect(result.items).toHaveLength(20);
    });

    it('treats pageSize=0 as default 20', () => {
      const result = paginate(items, { pageSize: 0 });
      expect(result.pageSize).toBe(20);
    });

    it('handles single item', () => {
      const result = paginate([{ id: 1 }]);
      expect(result.items).toHaveLength(1);
      expect(result.totalItems).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('handles pageSize of 1', () => {
      const threeItems = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = paginate(threeItems, { pageSize: 1, page: 2 });
      expect(result.items).toEqual([{ id: 2 }]);
      expect(result.totalPages).toBe(3);
    });
  });
});

describe('sortByMostRecent', () => {
  it('sorts items by date field descending (most recent first)', () => {
    const items = [
      { id: 1, createdAt: new Date('2024-01-01') },
      { id: 2, createdAt: new Date('2024-06-15') },
      { id: 3, createdAt: new Date('2024-03-10') },
    ];

    const sorted = sortByMostRecent(items, 'createdAt');
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });

  it('does not mutate the original array', () => {
    const items = [
      { id: 1, date: new Date('2024-01-01') },
      { id: 2, date: new Date('2024-12-01') },
    ];
    const original = [...items];
    sortByMostRecent(items, 'date');
    expect(items).toEqual(original);
  });

  it('handles string date values', () => {
    const items = [
      { id: 1, timestamp: '2023-05-01T10:00:00Z' },
      { id: 2, timestamp: '2024-01-15T08:30:00Z' },
      { id: 3, timestamp: '2023-11-20T14:00:00Z' },
    ];

    const sorted = sortByMostRecent(items, 'timestamp');
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });

  it('handles numeric timestamps', () => {
    const items = [
      { id: 1, ts: 1000 },
      { id: 2, ts: 3000 },
      { id: 3, ts: 2000 },
    ];

    const sorted = sortByMostRecent(items, 'ts');
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });

  it('returns empty array for empty input', () => {
    const result = sortByMostRecent([], 'date' as any);
    expect(result).toEqual([]);
  });

  it('handles single item', () => {
    const items = [{ id: 1, date: new Date('2024-01-01') }];
    const sorted = sortByMostRecent(items, 'date');
    expect(sorted).toEqual(items);
  });
});
