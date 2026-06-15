import { CallStatus, Language } from './enums';
import { Business } from './business';

/**
 * Represents an active call session created on call-start.
 */
export interface CallSession {
  callId: string;
  businessId: string;
  callerNumber: string;
  startedAt: Date;
  status: CallStatus;
  businessConfig: Business;
  language: Language;
  metadata: {
    assistantId: string;
    vapiCallId: string;
  };
}

/**
 * Represents a currently active call for monitoring.
 */
export interface ActiveCall {
  callId: string;
  businessId: string;
  callerNumber: string;
  startedAt: Date;
  status: CallStatus;
  durationSeconds: number;
}

/**
 * Filters for querying call history.
 */
export interface CallFilters {
  outcomeCategory?: string;
  dateFrom?: Date;
  dateTo?: Date;
  callerNumber?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Result of a tool call dispatched during a call.
 */
export interface ToolCallResult {
  success: boolean;
  toolName: string;
  data: Record<string, unknown>;
  error?: string;
}
