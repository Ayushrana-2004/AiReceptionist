/**
 * Property-Based Test: Retry scheduling produces correct attempt times and respects maximum
 *
 * Feature: ai-receptionist, Property 11: Retry scheduling produces correct attempt times and respects maximum
 *
 * Validates: Requirements 5.6, 6.7
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeRetryTimestamps,
  isRetryExhausted,
  getNextRetryTime,
} from './retryScheduler';

describe('Property 11: Retry scheduling produces correct attempt times and respects maximum', () => {
  it('computeRetryTimestamps returns exactly max timestamps', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }), // initial timestamp
        fc.integer({ min: 1, max: 60000 }),   // interval in ms
        fc.integer({ min: 0, max: 300 }),     // max attempts
        (initial, interval, max) => {
          const timestamps = computeRetryTimestamps(initial, interval, max);
          expect(timestamps).toHaveLength(max);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each timestamp is spaced at exactly interval from the previous', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }),
        fc.integer({ min: 1, max: 60000 }),
        fc.integer({ min: 1, max: 300 }),  // at least 1 to have timestamps to check
        (initial, interval, max) => {
          const timestamps = computeRetryTimestamps(initial, interval, max);

          for (let i = 0; i < timestamps.length; i++) {
            const expectedTime = initial.getTime() + (i + 1) * interval;
            expect(timestamps[i].getTime()).toBe(expectedTime);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('timestamps are in strictly ascending order', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }),
        fc.integer({ min: 1, max: 60000 }),
        fc.integer({ min: 2, max: 300 }),  // at least 2 to verify ordering
        (initial, interval, max) => {
          const timestamps = computeRetryTimestamps(initial, interval, max);

          for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i].getTime()).toBeGreaterThan(timestamps[i - 1].getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isRetryExhausted returns true iff count >= max', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600 }),  // attempt count
        fc.integer({ min: 0, max: 300 }),  // max attempts
        (count, max) => {
          const result = isRetryExhausted(count, max);

          if (count >= max) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getNextRetryTime matches corresponding entry from computeRetryTimestamps', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }),
        fc.integer({ min: 1, max: 60000 }),
        fc.integer({ min: 1, max: 300 }),  // max attempts (at least 1)
        (initial, interval, max) => {
          const timestamps = computeRetryTimestamps(initial, interval, max);

          // For each attempt count, getNextRetryTime should match the timestamp at that index
          for (let count = 0; count < max; count++) {
            const nextTime = getNextRetryTime(initial, count, interval);
            expect(nextTime.getTime()).toBe(timestamps[count].getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
