/**
 * Feature: ai-receptionist, Property 9: Lead qualification assigns correct status based on criteria
 *
 * Validates: Requirements 5.4
 *
 * For any lead data and qualification criteria configuration, the qualification function
 * SHALL assign exactly one status from {qualified, unqualified, needs_review}, and the
 * assignment SHALL be deterministic given the same inputs.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { qualifyLead } from './leadCapture';
import { Lead } from '../../shared/types/lead';
import { QualificationCriteria } from '../../shared/types/qualification';
import { QualificationStatus, QualificationCategory } from '../../shared/types/enums';

// ─── Generators ──────────────────────────────────────────────────────────────

const VALID_STATUSES: QualificationStatus[] = ['qualified', 'unqualified', 'needs_review'];
const CATEGORIES: QualificationCategory[] = ['budget', 'timeline', 'service_type'];

/**
 * Generator for a Lead object with random name and reason strings.
 */
const leadArb: fc.Arbitrary<Lead> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    businessId: fc.string({ minLength: 1, maxLength: 20 }),
    callId: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 0, maxLength: 100 }),
    phone: fc.constant('+14155551234'),
    email: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: null }),
    reason: fc.string({ minLength: 0, maxLength: 500 }),
    qualificationStatus: fc.constantFrom<QualificationStatus>('qualified', 'unqualified', 'needs_review'),
    crmSyncStatus: fc.constantFrom('synced' as const, 'pending' as const, 'failed' as const),
    crmRecordId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    createdAt: fc.date(),
    updatedAt: fc.date(),
  });

/**
 * Generator for QualificationCriteria with random category, values, and weight.
 */
const criterionArb: fc.Arbitrary<QualificationCriteria> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  businessId: fc.string({ minLength: 1, maxLength: 20 }),
  category: fc.constantFrom<QualificationCategory>(...CATEGORIES),
  values: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
  weight: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Generator for an array of criteria (0 to 10 criteria).
 */
const criteriaArb: fc.Arbitrary<QualificationCriteria[]> = fc.array(criterionArb, {
  minLength: 0,
  maxLength: 10,
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 9: Lead qualification assigns correct status based on criteria', () => {
  it('always assigns exactly one valid status from {qualified, unqualified, needs_review}', () => {
    fc.assert(
      fc.property(leadArb, criteriaArb, (lead, criteria) => {
        const result = qualifyLead(lead, criteria);

        // Assert result is exactly one of the valid statuses
        expect(VALID_STATUSES).toContain(result);

        // Assert it's a string (not null, undefined, or array)
        expect(typeof result).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  it('is deterministic — same inputs always produce same output', () => {
    fc.assert(
      fc.property(leadArb, criteriaArb, (lead, criteria) => {
        const result1 = qualifyLead(lead, criteria);
        const result2 = qualifyLead(lead, criteria);
        const result3 = qualifyLead(lead, criteria);

        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      }),
      { numRuns: 100 }
    );
  });

  it('matches the scoring algorithm thresholds', () => {
    fc.assert(
      fc.property(leadArb, criteriaArb, (lead, criteria) => {
        const result = qualifyLead(lead, criteria);

        // Edge case: empty criteria → needs_review
        if (criteria.length === 0) {
          expect(result).toBe('needs_review');
          return;
        }

        // Edge case: zero total weight → needs_review
        const totalPossibleWeight = criteria.reduce((sum, c) => sum + Math.abs(c.weight), 0);
        if (totalPossibleWeight === 0) {
          expect(result).toBe('needs_review');
          return;
        }

        // Compute expected score
        const leadReason = lead.reason.toLowerCase();
        const leadName = lead.name.toLowerCase();

        let totalMatchedWeight = 0;
        for (const criterion of criteria) {
          const matched = criterion.values.some((value) => {
            const lowerValue = value.toLowerCase();
            return leadReason.includes(lowerValue) || leadName.includes(lowerValue);
          });
          if (matched) {
            totalMatchedWeight += Math.abs(criterion.weight);
          }
        }

        const normalizedScore = totalMatchedWeight / totalPossibleWeight;

        // Assert threshold logic
        if (normalizedScore > 0.7) {
          expect(result).toBe('qualified');
        } else if (normalizedScore < 0.3) {
          expect(result).toBe('unqualified');
        } else {
          expect(result).toBe('needs_review');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('returns needs_review for empty criteria array', () => {
    fc.assert(
      fc.property(leadArb, (lead) => {
        const result = qualifyLead(lead, []);
        expect(result).toBe('needs_review');
      }),
      { numRuns: 100 }
    );
  });

  it('returns needs_review when all criteria have zero weight', () => {
    const zeroWeightCriterionArb: fc.Arbitrary<QualificationCriteria> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      businessId: fc.string({ minLength: 1, maxLength: 20 }),
      category: fc.constantFrom<QualificationCategory>(...CATEGORIES),
      values: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
      weight: fc.constant(0),
    });

    const zeroWeightCriteriaArb = fc.array(zeroWeightCriterionArb, {
      minLength: 1,
      maxLength: 10,
    });

    fc.assert(
      fc.property(leadArb, zeroWeightCriteriaArb, (lead, criteria) => {
        const result = qualifyLead(lead, criteria);
        expect(result).toBe('needs_review');
      }),
      { numRuns: 100 }
    );
  });
});
