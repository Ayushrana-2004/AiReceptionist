/**
 * Property-Based Test: Capacity Limits
 *
 * Feature: ai-receptionist, Property 6: System enforces capacity limits
 *
 * Validates: Requirements 3.4, 4.2, 5.3
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  canAddKBEntry,
  canAddRoutingRule,
  canAddDestination,
  canAddQualificationCriteria,
  CAPACITY_LIMITS,
} from './capacityValidator';

describe('Property 6: System enforces capacity limits', () => {
  it('rejects KB entries when total >= 500 or category >= 100, accepts otherwise', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600 }),
        fc.integer({ min: 0, max: 150 }),
        (currentTotal, currentCategoryCount) => {
          const result = canAddKBEntry(currentTotal, currentCategoryCount);

          if (
            currentTotal >= CAPACITY_LIMITS.KB_ENTRIES_TOTAL ||
            currentCategoryCount >= CAPACITY_LIMITS.KB_ENTRIES_PER_CATEGORY
          ) {
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.maxAllowed).toBeGreaterThan(0);
            expect(result.error!.currentCount).toBeGreaterThanOrEqual(0);
          } else {
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects routing rules when count >= 50, accepts otherwise', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), (currentCount) => {
        const result = canAddRoutingRule(currentCount);

        if (currentCount >= CAPACITY_LIMITS.ROUTING_RULES_PER_BUSINESS) {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.field).toBe('routingRules');
          expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.ROUTING_RULES_PER_BUSINESS);
        } else {
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects destinations when count >= 3, accepts otherwise', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (currentCount) => {
        const result = canAddDestination(currentCount);

        if (currentCount >= CAPACITY_LIMITS.DESTINATIONS_PER_ROUTING_RULE) {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.field).toBe('destinations');
          expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.DESTINATIONS_PER_ROUTING_RULE);
        } else {
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects qualification criteria when count >= 10, accepts otherwise', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 15 }), (currentCount) => {
        const result = canAddQualificationCriteria(currentCount);

        if (currentCount >= CAPACITY_LIMITS.QUALIFICATION_CRITERIA_PER_CATEGORY) {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.field).toBe('qualificationCriteria');
          expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.QUALIFICATION_CRITERIA_PER_CATEGORY);
        } else {
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});
