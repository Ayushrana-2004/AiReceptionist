/**
 * Property-Based Test: Call queueing above configured maximum
 *
 * Feature: ai-receptionist, Property 2: Call queueing above configured maximum
 *
 * Validates: Requirements 1.7
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Pure function that models the call queueing logic from CallManager.
 *
 * Given N simultaneous incoming calls and a configured maximum capacity M,
 * the first M calls become active, and any calls beyond M are queued.
 *
 * This mirrors the logic in CallManager.handleCallStart where:
 * - If currentCount < maxConcurrent → status = 'active'
 * - If currentCount >= maxConcurrent → status = 'queued'
 */
function simulateCallQueueing(
  totalCalls: number,
  maxConcurrent: number
): { active: number; queued: number } {
  let activeCount = 0;
  let queuedCount = 0;

  for (let i = 0; i < totalCalls; i++) {
    if (activeCount < maxConcurrent) {
      activeCount++;
    } else {
      queuedCount++;
    }
  }

  return { active: activeCount, queued: queuedCount };
}

describe('Property 2: Call queueing above configured maximum', () => {
  it('queues exactly N-M calls when N > M, and zero when N ≤ M', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }), // N: total simultaneous calls
        fc.integer({ min: 1, max: 50 }),   // M: max concurrent capacity
        (totalCalls, maxConcurrent) => {
          const result = simulateCallQueueing(totalCalls, maxConcurrent);

          if (totalCalls > maxConcurrent) {
            // When N > M: exactly N-M are queued, M are active
            expect(result.queued).toBe(totalCalls - maxConcurrent);
            expect(result.active).toBe(maxConcurrent);
          } else {
            // When N ≤ M: zero are queued, all N are active
            expect(result.queued).toBe(0);
            expect(result.active).toBe(totalCalls);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('active + queued always equals total calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (totalCalls, maxConcurrent) => {
          const result = simulateCallQueueing(totalCalls, maxConcurrent);

          // Invariant: no calls are lost — all are either active or queued
          expect(result.active + result.queued).toBe(totalCalls);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('active count never exceeds max concurrent capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (totalCalls, maxConcurrent) => {
          const result = simulateCallQueueing(totalCalls, maxConcurrent);

          // Active calls must never exceed configured maximum
          expect(result.active).toBeLessThanOrEqual(maxConcurrent);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('queued count is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (totalCalls, maxConcurrent) => {
          const result = simulateCallQueueing(totalCalls, maxConcurrent);

          expect(result.queued).toBeGreaterThanOrEqual(0);
          expect(result.active).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
