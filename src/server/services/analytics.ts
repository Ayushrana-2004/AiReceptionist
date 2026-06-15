/**
 * Analytics Service
 *
 * Provides pure computation functions for analytics metrics:
 * - Average call duration
 * - Appointment conversion rate
 * - Lead capture rate
 * - Aggregated snapshots by period (daily/weekly/monthly)
 *
 * Refresh interval: ≤5 minutes (enforced at the API/caching layer)
 *
 * Requirements: 9.2, 9.3
 */

import { CallRecord, AnalyticsSnapshot, AnalyticsPeriod } from '../../shared/types';

/**
 * Computes the average duration in seconds across a set of call records.
 * Returns 0 if the records array is empty.
 *
 * @param records - Array of call records
 * @returns Average duration in seconds
 */
export function computeAverageDuration(records: CallRecord[]): number {
  if (records.length === 0) {
    return 0;
  }
  const totalDuration = records.reduce((sum, record) => sum + record.durationSeconds, 0);
  return totalDuration / records.length;
}

/**
 * Computes the appointment conversion rate as a percentage.
 * Conversion rate = (appointments_booked / total_calls) × 100
 * Returns 0 if the records array is empty.
 *
 * @param records - Array of call records
 * @returns Appointment conversion rate as a percentage (0-100)
 */
export function computeAppointmentConversionRate(records: CallRecord[]): number {
  if (records.length === 0) {
    return 0;
  }
  const appointmentsBooked = records.filter(
    (record) => record.outcomeCategory === 'appointment_booked'
  ).length;
  return (appointmentsBooked / records.length) * 100;
}

/**
 * Computes the lead capture rate as a percentage.
 * Lead capture rate = (leads_captured / total_calls) × 100
 * Returns 0 if the records array is empty.
 *
 * @param records - Array of call records
 * @returns Lead capture rate as a percentage (0-100)
 */
export function computeLeadCaptureRate(records: CallRecord[]): number {
  if (records.length === 0) {
    return 0;
  }
  const leadsCaptured = records.filter(
    (record) => record.outcomeCategory === 'lead_captured'
  ).length;
  return (leadsCaptured / records.length) * 100;
}

/**
 * Computes a full analytics snapshot for a set of call records.
 * Includes all metrics: average duration, conversion rate, lead capture rate,
 * transfers by category, and calls by outcome.
 *
 * @param records - Array of call records
 * @param businessId - Business identifier (defaults to empty string)
 * @param period - Analytics period (defaults to 'daily')
 * @param date - Snapshot date (defaults to current date)
 * @returns Complete AnalyticsSnapshot
 */
export function computeAnalyticsSnapshot(
  records: CallRecord[],
  businessId: string = '',
  period: AnalyticsPeriod = 'daily',
  date: Date = new Date()
): AnalyticsSnapshot {
  const transfersByCategory: Record<string, number> = {};
  const callsByOutcome: Record<string, number> = {};

  for (const record of records) {
    // Count transfers by intent classification
    if (record.outcomeCategory === 'transferred' && record.intentClassification) {
      transfersByCategory[record.intentClassification] =
        (transfersByCategory[record.intentClassification] || 0) + 1;
    }

    // Count calls by outcome category
    if (record.outcomeCategory) {
      callsByOutcome[record.outcomeCategory] =
        (callsByOutcome[record.outcomeCategory] || 0) + 1;
    }
  }

  return {
    businessId,
    period,
    date,
    totalCalls: records.length,
    avgDurationSeconds: computeAverageDuration(records),
    appointmentConversionRate: computeAppointmentConversionRate(records),
    leadCaptureRate: computeLeadCaptureRate(records),
    transfersByCategory,
    callsByOutcome,
  };
}

/**
 * Returns the start of the day (midnight) for a given date.
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the ISO week key (YYYY-WXX) for grouping records by week.
 * Uses ISO 8601 week numbering (Monday-based weeks).
 */
function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Adjust to nearest Thursday (ISO week starts Monday)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNumber = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Returns the month key (YYYY-MM) for grouping records by month.
 */
function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns the day key (YYYY-MM-DD) for grouping records by day.
 */
function getDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Groups call records by the specified period and computes an analytics
 * snapshot for each group.
 *
 * @param records - Array of call records
 * @param period - Aggregation period: 'daily', 'weekly', or 'monthly'
 * @returns Array of AnalyticsSnapshot, one per period bucket, sorted chronologically
 */
export function aggregateByPeriod(
  records: CallRecord[],
  period: AnalyticsPeriod
): AnalyticsSnapshot[] {
  if (records.length === 0) {
    return [];
  }

  // Group records by period key
  const groups = new Map<string, CallRecord[]>();

  for (const record of records) {
    const date = record.startedAt instanceof Date ? record.startedAt : new Date(record.startedAt);
    let key: string;

    switch (period) {
      case 'daily':
        key = getDayKey(date);
        break;
      case 'weekly':
        key = getWeekKey(date);
        break;
      case 'monthly':
        key = getMonthKey(date);
        break;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  // Sort keys chronologically and compute snapshots
  const sortedKeys = Array.from(groups.keys()).sort();
  const snapshots: AnalyticsSnapshot[] = [];

  for (const key of sortedKeys) {
    const groupRecords = groups.get(key)!;
    // Use the earliest record's startedAt as the snapshot date
    const earliestDate = groupRecords.reduce((earliest, record) => {
      const recordDate = record.startedAt instanceof Date
        ? record.startedAt
        : new Date(record.startedAt);
      return recordDate < earliest ? recordDate : earliest;
    }, groupRecords[0].startedAt instanceof Date
      ? groupRecords[0].startedAt
      : new Date(groupRecords[0].startedAt));

    const snapshotDate = startOfDay(earliestDate);
    const businessId = groupRecords[0].businessId;

    snapshots.push(
      computeAnalyticsSnapshot(groupRecords, businessId, period, snapshotDate)
    );
  }

  return snapshots;
}
