/**
 * Feature: ai-receptionist, Property 3: Appointment date range window calculation
 *
 * Validates: Requirements 2.1
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeDateRange } from './scheduler';

describe('Property 3: Appointment date range window calculation', () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Generator: random valid dates between 2020-01-01 and 2030-12-31
   */
  const validDateArb = fc.date({
    min: new Date('2020-01-01T00:00:00.000Z'),
    max: new Date('2030-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  });

  it('result.start is at UTC midnight of the input date\'s UTC date', () => {
    fc.assert(
      fc.property(validDateArb, (inputDate) => {
        const result = computeDateRange(inputDate);

        expect(result.start.getUTCFullYear()).toBe(inputDate.getUTCFullYear());
        expect(result.start.getUTCMonth()).toBe(inputDate.getUTCMonth());
        expect(result.start.getUTCDate()).toBe(inputDate.getUTCDate());
        expect(result.start.getUTCHours()).toBe(0);
        expect(result.start.getUTCMinutes()).toBe(0);
        expect(result.start.getUTCSeconds()).toBe(0);
        expect(result.start.getUTCMilliseconds()).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('result.end is exactly 7 days after result.start', () => {
    fc.assert(
      fc.property(validDateArb, (inputDate) => {
        const result = computeDateRange(inputDate);

        const expectedEnd = new Date(result.start.getTime() + SEVEN_DAYS_MS);
        expect(result.end.getTime()).toBe(expectedEnd.getTime());
      }),
      { numRuns: 100 }
    );
  });

  it('the window is exactly 7 * 24 * 60 * 60 * 1000 milliseconds', () => {
    fc.assert(
      fc.property(validDateArb, (inputDate) => {
        const result = computeDateRange(inputDate);

        const windowMs = result.end.getTime() - result.start.getTime();
        expect(windowMs).toBe(SEVEN_DAYS_MS);
      }),
      { numRuns: 100 }
    );
  });

  it('start is before end (start <= end)', () => {
    fc.assert(
      fc.property(validDateArb, (inputDate) => {
        const result = computeDateRange(inputDate);

        expect(result.start.getTime()).toBeLessThan(result.end.getTime());
      }),
      { numRuns: 100 }
    );
  });
});
