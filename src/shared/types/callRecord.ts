import { CallStatus, Language } from './enums';
import { CallMetadata } from './common';

/**
 * Call record persisted after each call.
 */
export interface CallRecord {
  id: string;
  businessId: string;
  callerNumber: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  status: CallStatus;
  outcomeCategory: string;
  summaryText: string | null;    // 50-200 chars
  transcriptUrl: string | null;  // S3 reference
  intentClassification: string;
  language: Language;
  metadata: CallMetadata;
}
