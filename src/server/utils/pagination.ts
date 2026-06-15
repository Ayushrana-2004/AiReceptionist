import { PaginatedResult } from '../../shared/types/common';

/**
 * Options for paginating a list of items.
 */
export interface PaginationOptions {
  page?: number;       // Default: 1
  pageSize?: number;   // Default: 20
}

/**
 * Paginates an array of items.
 *
 * Key behaviors:
 * - Default page size is 20, default page is 1
 * - Items are assumed to already be sorted (caller provides sorted input)
 * - Returns correct slice at indices [(K-1)*P, min(K*P, N))
 * - Total pages = ceil(N/P), minimum 1
 * - If page is beyond available pages, returns empty items array
 * - Handles edge cases: empty array, page=0 (treat as 1), negative page numbers (treat as 1)
 */
export function paginate<T>(items: T[], options?: PaginationOptions): PaginatedResult<T> {
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : 20;
  const rawPage = options?.page ?? 1;
  const page = rawPage < 1 ? 1 : rawPage;

  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(page * pageSize, totalItems);

  const paginatedItems = startIndex >= totalItems ? [] : items.slice(startIndex, endIndex);

  return {
    items: paginatedItems,
    totalItems,
    totalPages,
    currentPage: page,
    pageSize,
  };
}

/**
 * Sorts items by a date field in descending order (most recent first).
 * The field must contain Date objects or values parseable by `new Date()`.
 */
export function sortByMostRecent<T>(items: T[], dateField: keyof T): T[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a[dateField] as unknown as string | number | Date).getTime();
    const dateB = new Date(b[dateField] as unknown as string | number | Date).getTime();
    return dateB - dateA;
  });
}
