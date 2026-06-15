import { AnalyticsPeriod } from './enums';

/**
 * Aggregated analytics snapshot.
 */
export interface AnalyticsSnapshot {
  businessId: string;
  period: AnalyticsPeriod;
  date: Date;
  totalCalls: number;
  avgDurationSeconds: number;
  appointmentConversionRate: number;  // percentage
  leadCaptureRate: number;            // percentage
  transfersByCategory: Record<string, number>;
  callsByOutcome: Record<string, number>;
}
