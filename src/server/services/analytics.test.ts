import { describe, it, expect } from 'vitest';
import {
  computeAverageDuration,
  computeAppointmentConversionRate,
  computeLeadCaptureRate,
  computeAnalyticsSnapshot,
  aggregateByPeriod,
} from './analytics';
import { CallRecord } from '../../shared/types';

/**
 * Helper to create a mock CallRecord with sensible defaults.
 */
function makeCallRecord(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: 'call-1',
    businessId: 'biz-1',
    callerNumber: '+15551234567',
    startedAt: new Date('2024-01-15T10:00:00Z'),
    endedAt: new Date('2024-01-15T10:05:00Z'),
    durationSeconds: 300,
    status: 'completed',
    outcomeCategory: 'information_provided',
    summaryText: 'Caller asked about business hours.',
    transcriptUrl: null,
    intentClassification: 'general_inquiry',
    language: 'en',
    metadata: {},
    ...overrides,
  };
}

describe('computeAverageDuration', () => {
  it('returns 0 for empty records', () => {
    expect(computeAverageDuration([])).toBe(0);
  });

  it('returns the duration for a single record', () => {
    const records = [makeCallRecord({ durationSeconds: 120 })];
    expect(computeAverageDuration(records)).toBe(120);
  });

  it('correctly averages multiple records', () => {
    const records = [
      makeCallRecord({ durationSeconds: 100 }),
      makeCallRecord({ durationSeconds: 200 }),
      makeCallRecord({ durationSeconds: 300 }),
    ];
    expect(computeAverageDuration(records)).toBe(200);
  });

  it('handles records with zero duration', () => {
    const records = [
      makeCallRecord({ durationSeconds: 0 }),
      makeCallRecord({ durationSeconds: 0 }),
    ];
    expect(computeAverageDuration(records)).toBe(0);
  });
});

describe('computeAppointmentConversionRate', () => {
  it('returns 0 for empty records', () => {
    expect(computeAppointmentConversionRate([])).toBe(0);
  });

  it('returns 100 when all calls result in appointments', () => {
    const records = [
      makeCallRecord({ outcomeCategory: 'appointment_booked' }),
      makeCallRecord({ outcomeCategory: 'appointment_booked' }),
    ];
    expect(computeAppointmentConversionRate(records)).toBe(100);
  });

  it('returns 0 when no calls result in appointments', () => {
    const records = [
      makeCallRecord({ outcomeCategory: 'information_provided' }),
      makeCallRecord({ outcomeCategory: 'transferred' }),
    ];
    expect(computeAppointmentConversionRate(records)).toBe(0);
  });

  it('computes correct percentage for mixed outcomes', () => {
    const records = [
      makeCallRecord({ outcomeCategory: 'appointment_booked' }),
      makeCallRecord({ outcomeCategory: 'information_provided' }),
      makeCallRecord({ outcomeCategory: 'lead_captured' }),
      makeCallRecord({ outcomeCategory: 'appointment_booked' }),
    ];
    // 2/4 = 50%
    expect(computeAppointmentConversionRate(records)).toBe(50);
  });
});

describe('computeLeadCaptureRate', () => {
  it('returns 0 for empty records', () => {
    expect(computeLeadCaptureRate([])).toBe(0);
  });

  it('returns 100 when all calls capture leads', () => {
    const records = [
      makeCallRecord({ outcomeCategory: 'lead_captured' }),
      makeCallRecord({ outcomeCategory: 'lead_captured' }),
    ];
    expect(computeLeadCaptureRate(records)).toBe(100);
  });

  it('returns 0 when no calls capture leads', () => {
    const records = [
      makeCallRecord({ outcomeCategory: 'information_provided' }),
      makeCallRecord({ outcomeCategory: 'appointment_booked' }),
    ];
    expect(computeLeadCaptureRate(records)).toBe(0);
  });

  it('computes correct percentage for mixed outcomes', () => {
    const records = [
      makeCallRecord({ outcomeCategory: 'lead_captured' }),
      makeCallRecord({ outcomeCategory: 'information_provided' }),
      makeCallRecord({ outcomeCategory: 'lead_captured' }),
      makeCallRecord({ outcomeCategory: 'transferred' }),
      makeCallRecord({ outcomeCategory: 'lead_captured' }),
    ];
    // 3/5 = 60%
    expect(computeLeadCaptureRate(records)).toBe(60);
  });
});

describe('computeAnalyticsSnapshot', () => {
  it('returns a snapshot with zero metrics for empty records', () => {
    const snapshot = computeAnalyticsSnapshot([], 'biz-1', 'daily', new Date('2024-01-15'));
    expect(snapshot.businessId).toBe('biz-1');
    expect(snapshot.period).toBe('daily');
    expect(snapshot.totalCalls).toBe(0);
    expect(snapshot.avgDurationSeconds).toBe(0);
    expect(snapshot.appointmentConversionRate).toBe(0);
    expect(snapshot.leadCaptureRate).toBe(0);
    expect(snapshot.transfersByCategory).toEqual({});
    expect(snapshot.callsByOutcome).toEqual({});
  });

  it('computes all metrics correctly for a set of records', () => {
    const records = [
      makeCallRecord({ durationSeconds: 60, outcomeCategory: 'appointment_booked', intentClassification: 'sales' }),
      makeCallRecord({ durationSeconds: 120, outcomeCategory: 'lead_captured', intentClassification: 'support' }),
      makeCallRecord({ durationSeconds: 180, outcomeCategory: 'transferred', intentClassification: 'billing' }),
      makeCallRecord({ durationSeconds: 240, outcomeCategory: 'information_provided', intentClassification: 'general' }),
    ];

    const snapshot = computeAnalyticsSnapshot(records, 'biz-1', 'weekly');

    expect(snapshot.totalCalls).toBe(4);
    expect(snapshot.avgDurationSeconds).toBe(150); // (60+120+180+240)/4
    expect(snapshot.appointmentConversionRate).toBe(25); // 1/4 * 100
    expect(snapshot.leadCaptureRate).toBe(25); // 1/4 * 100
    expect(snapshot.callsByOutcome).toEqual({
      appointment_booked: 1,
      lead_captured: 1,
      transferred: 1,
      information_provided: 1,
    });
    // Only 'transferred' outcome counts as a transfer
    expect(snapshot.transfersByCategory).toEqual({ billing: 1 });
  });

  it('aggregates transfers by intent classification', () => {
    const records = [
      makeCallRecord({ outcomeCategory: 'transferred', intentClassification: 'sales' }),
      makeCallRecord({ outcomeCategory: 'transferred', intentClassification: 'sales' }),
      makeCallRecord({ outcomeCategory: 'transferred', intentClassification: 'support' }),
    ];

    const snapshot = computeAnalyticsSnapshot(records, 'biz-1');
    expect(snapshot.transfersByCategory).toEqual({ sales: 2, support: 1 });
  });
});

describe('aggregateByPeriod', () => {
  it('returns empty array for empty records', () => {
    expect(aggregateByPeriod([], 'daily')).toEqual([]);
    expect(aggregateByPeriod([], 'weekly')).toEqual([]);
    expect(aggregateByPeriod([], 'monthly')).toEqual([]);
  });

  it('groups records by day for daily period', () => {
    const records = [
      makeCallRecord({ startedAt: new Date('2024-01-15T10:00:00Z'), durationSeconds: 100 }),
      makeCallRecord({ startedAt: new Date('2024-01-15T14:00:00Z'), durationSeconds: 200 }),
      makeCallRecord({ startedAt: new Date('2024-01-16T09:00:00Z'), durationSeconds: 300 }),
    ];

    const snapshots = aggregateByPeriod(records, 'daily');

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].totalCalls).toBe(2);
    expect(snapshots[0].avgDurationSeconds).toBe(150);
    expect(snapshots[0].period).toBe('daily');
    expect(snapshots[1].totalCalls).toBe(1);
    expect(snapshots[1].avgDurationSeconds).toBe(300);
  });

  it('groups records by week for weekly period', () => {
    const records = [
      // Week 3 of 2024 (Mon Jan 15 - Sun Jan 21)
      makeCallRecord({ startedAt: new Date('2024-01-15T10:00:00Z') }),
      makeCallRecord({ startedAt: new Date('2024-01-17T10:00:00Z') }),
      // Week 4 of 2024 (Mon Jan 22 - Sun Jan 28)
      makeCallRecord({ startedAt: new Date('2024-01-22T10:00:00Z') }),
    ];

    const snapshots = aggregateByPeriod(records, 'weekly');

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].totalCalls).toBe(2);
    expect(snapshots[0].period).toBe('weekly');
    expect(snapshots[1].totalCalls).toBe(1);
  });

  it('groups records by month for monthly period', () => {
    const records = [
      makeCallRecord({ startedAt: new Date('2024-01-05T10:00:00Z') }),
      makeCallRecord({ startedAt: new Date('2024-01-20T10:00:00Z') }),
      makeCallRecord({ startedAt: new Date('2024-02-10T10:00:00Z') }),
      makeCallRecord({ startedAt: new Date('2024-03-01T10:00:00Z') }),
    ];

    const snapshots = aggregateByPeriod(records, 'monthly');

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0].totalCalls).toBe(2); // January
    expect(snapshots[0].period).toBe('monthly');
    expect(snapshots[1].totalCalls).toBe(1); // February
    expect(snapshots[2].totalCalls).toBe(1); // March
  });

  it('returns snapshots sorted chronologically', () => {
    const records = [
      makeCallRecord({ startedAt: new Date('2024-03-01T10:00:00Z') }),
      makeCallRecord({ startedAt: new Date('2024-01-01T10:00:00Z') }),
      makeCallRecord({ startedAt: new Date('2024-02-01T10:00:00Z') }),
    ];

    const snapshots = aggregateByPeriod(records, 'monthly');

    expect(snapshots).toHaveLength(3);
    // Verify chronological order
    expect(snapshots[0].date.getTime()).toBeLessThan(snapshots[1].date.getTime());
    expect(snapshots[1].date.getTime()).toBeLessThan(snapshots[2].date.getTime());
  });

  it('preserves businessId from records', () => {
    const records = [
      makeCallRecord({ businessId: 'biz-42', startedAt: new Date('2024-01-15T10:00:00Z') }),
    ];

    const snapshots = aggregateByPeriod(records, 'daily');

    expect(snapshots[0].businessId).toBe('biz-42');
  });
});
