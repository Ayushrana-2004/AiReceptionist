/**
 * Feature: ai-receptionist, Property 12: Pagination returns correct page slices
 *
 * Validates: Requirements 5.7
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { paginate } from './pagination';

describe('Property 12: Pagination returns correct page slices', () => {
  it('returns items at correct indices [(K-1)*P, min(K*P, N))', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 1000 }),
        fc.integer({ min: 1, max: 100 }), // pageSize
        fc.integer({ min: 1, max: 100 }), // page number
        (items, pageSize, page) => {
          const result = paginate(items, { page, pageSize });

          const N = items.length;
          const startIndex = (page - 1) * pageSize;
          const endIndex = Math.min(page * pageSize, N);

          if (startIndex >= N) {
            expect(result.items).toEqual([]);
          } else {
            const expectedItems = items.slice(startIndex, endIndex);
            expect(result.items).toEqual(expectedItems);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('totalPages equals ceil(N/P) with minimum 1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 1000 }),
        fc.integer({ min: 1, max: 100 }), // pageSize
        fc.integer({ min: 1, max: 100 }), // page number
        (items, pageSize, page) => {
          const result = paginate(items, { page, pageSize });

          const N = items.length;
          const expectedTotalPages = N === 0 ? 1 : Math.ceil(N / pageSize);

          expect(result.totalPages).toBe(expectedTotalPages);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returned items match slicing the input array at correct indices', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 1000 }),
        fc.integer({ min: 1, max: 100 }), // pageSize
        fc.integer({ min: 1, max: 100 }), // page number
        (items, pageSize, page) => {
          const result = paginate(items, { page, pageSize });

          const N = items.length;
          const startIndex = (page - 1) * pageSize;
          const endIndex = Math.min(page * pageSize, N);

          if (startIndex >= N) {
            expect(result.items).toHaveLength(0);
          } else {
            // Items are exactly the slice at the computed indices
            expect(result.items).toEqual(items.slice(startIndex, endIndex));
            expect(result.items.length).toBe(endIndex - startIndex);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reports correct metadata (totalItems, currentPage, pageSize)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 1000 }),
        fc.integer({ min: 1, max: 100 }), // pageSize
        fc.integer({ min: 1, max: 100 }), // page number
        (items, pageSize, page) => {
          const result = paginate(items, { page, pageSize });

          expect(result.totalItems).toBe(items.length);
          expect(result.currentPage).toBe(page);
          expect(result.pageSize).toBe(pageSize);
        }
      ),
      { numRuns: 100 }
    );
  });
});
