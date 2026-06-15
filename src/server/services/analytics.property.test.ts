/**
 * Property-Based Test: Analytics computations are mathematically correct
 *
 * Feature: ai-receptionist, Property 18: Analytics computations are mathematically correct
 *
 * Validates: Requirements 9.2
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeAverageDuration,
  computeAppointmentConversionRate,
  computeLeadCaptureRate,
} from './analytics';
import { CallRecord } from '../../shared/types';

const outcomeCategories = [
  'appointment_booked',
  'lead_captured',
  'information_provided',
  'transferred',
  'message_taken',
] as const;

/**
 * Generator for a CallRecord with random durationSeconds and outcomeCategory.
 * Other fields are populated with valid placeholder values.
 */
const callRecordArb = fc.record({
  id: fc.uuid(),
  businessId: fc.uuid(),
  callerNumber: fc.constant('+15551234567'),
  startedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-01-01') }),
  endedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-01-01') }),
  durationSeconds: fc.integer({ min: 0, max: 3600 }),
  status: fc.constant('completed' as const),
  outcomeCategory: fc.constantFrom(...outcomeCategories),
  summaryText: fc.constant(null),
  transcriptUrl: fc.constant(null),
  intentClassification: fc.constant('general_inquiry'),
  language: fc.constant('en' as const),
  metadata: fc.constant({
    vapiCallId: 'test-call-id',
    assistantId: 'test-assistant-id',
    transferAttempts: 0,
    sttFailures: 0,
    languageDetected: 'en',
    toolCallsMade: [],
  }),
}) as fc.Arbitrary<CallRecord>;

describe('Property 18: Analytics computations are mathematically correct', () => {
  it('computeAverageDuration equals sum(durations) / count(records)', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 1, maxLength: 100 }),
        (records) => {
          const result = computeAverageDuration(records);
          const expectedSum = records.reduce((sum, r) => sum + r.durationSeconds, 0);
          const expectedAvg = expectedSum / records.length;
          expect(result).toBeCloseTo(expectedAvg, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeAppointmentConversionRate equals appointmentsBooked / totalCalls × 100', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 1, maxLength: 100 }),
        (records) => {
          const result = computeAppointmentConversionRate(records);
          const appointmentsBooked = records.filter(
            (r) => r.outcomeCategory === 'appointment_booked'
          ).length;
          const expectedRate = (appointmentsBooked / records.length) * 100;
          expect(result).toBeCloseTo(expectedRate, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeLeadCaptureRate equals leadsCaptured / totalCalls × 100', () => {
    fc.assert(
      fc.property(
        fc.array(callRecordArb, { minLength: 1, maxLength: 100 }),
        (records) => {
          const result = computeLeadCaptureRate(records);
          const leadsCaptured = records.filter(
            (r) => r.outcomeCategory === 'lead_captured'
          ).length;
          const expectedRate = (leadsCaptured / records.length) * 100;
          expect(result).toBeCloseTo(expectedRate, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all three functions return 0 for empty input', () => {
    fc.assert(
      fc.property(
        fc.constant([] as CallRecord[]),
        (emptyRecords) => {
          expect(computeAverageDuration(emptyRecords)).toBe(0);
          expect(computeAppointmentConversionRate(emptyRecords)).toBe(0);
          expect(computeLeadCaptureRate(emptyRecords)).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
