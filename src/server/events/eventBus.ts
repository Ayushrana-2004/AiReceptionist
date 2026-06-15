/**
 * Event Bus Handlers
 *
 * Subscribes to Redis pub/sub channels and orchestrates async processing
 * for post-call workflows:
 * - CALL_ENDED → generate summary + transcript, capture lead, queue SMS follow-up
 * - APPOINTMENT_BOOKED → send SMS confirmation
 * - LEAD_CAPTURED → qualify lead and sync to CRM
 *
 * All handlers are wrapped in try/catch so failures do not propagate or
 * block the webhook responses that originally published these events.
 *
 * Requirements: 7.1, 7.2, 5.4, 6.1, 6.4
 */

import { subscribe, publish, CHANNELS } from '../db/redis';
import {
  generateSummary,
  generateTranscript,
  DEFAULT_OUTCOME_CATEGORIES,
} from '../services/summaryService';
import type { VapiTranscriptData } from '../services/summaryService';
import { captureLead, qualifyLead, syncToCRM } from '../services/leadCapture';
import type { CRMConfig } from '../services/leadCapture';
import type { SMSService, CallOutcome } from '../services/smsService';
import type { SMSTemplate } from '../../shared/types/sms';
import type { Lead } from '../../shared/types/lead';
import type { QualificationCriteria } from '../../shared/types/qualification';
import type { ReminderInterval } from '../../shared/types/enums';
import type { Appointment } from '../../shared/types/appointment';

// ─── Event Payload Types ─────────────────────────────────────────────────────

export interface CallEndedPayload {
  callId: string;
  businessId: string;
  duration: number;
  transcript: Array<{ role: 'assistant' | 'user'; text: string; timestamp: number }>;
  endReason: string;
  timestamp: string;
  callerPhone?: string;
  callerName?: string;
}

export interface AppointmentBookedPayload {
  callId: string;
  businessId: string;
  appointment: {
    id: string;
    callerPhone: string;
    callerName: string;
    serviceType: string;
    scheduledAt: string;
  };
}

export interface LeadCapturedPayload {
  callId: string;
  businessId: string;
  lead: Lead;
  qualificationCriteria?: QualificationCriteria[];
  crmConfig?: CRMConfig;
}

// ─── Configuration Providers ────────────────────────────────────────────────

/**
 * Dependencies injected at initialization time.
 * This allows the event bus to be tested without coupling to concrete services.
 */
export interface EventBusDependencies {
  smsService?: SMSService;
  getSMSTemplate?: (businessId: string, triggerEvent: string) => Promise<SMSTemplate | null>;
  getQualificationCriteria?: (businessId: string) => Promise<QualificationCriteria[]>;
  getCRMConfig?: (businessId: string) => Promise<CRMConfig | null>;
}

let deps: EventBusDependencies = {};

// ─── Event Handlers ─────────────────────────────────────────────────────────

/**
 * Handle CALL_ENDED events.
 *
 * 1. Generate transcript from raw Vapi data
 * 2. Generate summary + classify outcome
 * 3. If caller info is available, capture lead
 * 4. Queue SMS follow-up if applicable
 *
 * All steps are non-blocking and errors are logged but do not propagate.
 */
async function handleCallEnded(data: unknown): Promise<void> {
  try {
    const payload = data as CallEndedPayload;
    const { callId, businessId, duration, transcript, callerPhone, callerName } = payload;

    console.log(`[EventBus] Processing CALL_ENDED for callId=${callId}`);

    // Skip processing for very short calls (< 5s)
    if (duration < 5) {
      console.log(`[EventBus] Skipping artifacts for short call (${duration}s): ${callId}`);
      return;
    }

    // 1. Generate transcript
    const transcriptData: VapiTranscriptData = {
      segments: transcript || [],
      durationSeconds: duration,
    };
    const formattedTranscript = generateTranscript(transcriptData);

    // 2. Generate summary + classify outcome
    const callSummary = generateSummary(formattedTranscript);

    console.log(
      `[EventBus] Call ${callId}: summary="${callSummary.summary?.slice(0, 50)}...", outcome="${callSummary.outcome}"`
    );

    // 3. Capture lead if caller info is available
    if (callerPhone && callerName) {
      try {
        const lead = await captureLead(businessId, {
          callId,
          name: callerName,
          phone: callerPhone,
          reason: callSummary.summary || 'Inbound call',
        });

        // Publish lead captured event for downstream processing
        await publish(CHANNELS.LEAD_CAPTURED, {
          callId,
          businessId,
          lead,
        });

        console.log(`[EventBus] Lead captured for call ${callId}: ${lead.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[EventBus] Lead capture failed for call ${callId}:`, message);
      }
    }

    // 4. Queue SMS follow-up
    if (deps.smsService && deps.getSMSTemplate && callerPhone) {
      try {
        const template = await deps.getSMSTemplate(businessId, 'lead_captured');
        if (template) {
          const callOutcome: CallOutcome = {
            callId,
            businessId,
            outcome: mapOutcomeToSMSOutcome(callSummary.outcome),
            callerPhone,
            callerName,
            timestamp: new Date(),
          };
          await deps.smsService.sendFollowUp(callOutcome, template, callerPhone);

          await publish(CHANNELS.SMS_QUEUED, {
            callId,
            businessId,
            type: 'follow_up',
            recipientPhone: callerPhone,
          });

          console.log(`[EventBus] SMS follow-up queued for call ${callId}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[EventBus] SMS follow-up failed for call ${callId}:`, message);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EventBus] handleCallEnded error:', message);
  }
}

/**
 * Handle APPOINTMENT_BOOKED events.
 *
 * Sends SMS confirmation to the caller immediately after booking.
 * Requirement 6.1: Send SMS confirmation within 10 seconds of booking.
 */
async function handleAppointmentBooked(data: unknown): Promise<void> {
  try {
    const payload = data as AppointmentBookedPayload;
    const { callId, businessId, appointment } = payload;

    console.log(`[EventBus] Processing APPOINTMENT_BOOKED for callId=${callId}`);

    if (!deps.smsService) {
      console.warn('[EventBus] SMS service not available — skipping confirmation');
      return;
    }

    const { callerPhone, callerName, serviceType, scheduledAt } = appointment;

    if (!callerPhone) {
      console.log(`[EventBus] No caller phone for appointment ${appointment.id} — skipping SMS`);
      return;
    }

    // Build appointment object for SMS service
    const appointmentForSMS: Appointment = {
      id: appointment.id,
      businessId,
      callId,
      callerName: callerName || 'Valued Customer',
      callerPhone,
      serviceType,
      scheduledAt: new Date(scheduledAt),
      calendarEventId: '',
      smsConfirmationSent: false,
      remindersSent: [] as ReminderInterval[],
      createdAt: new Date(),
    };

    await deps.smsService.sendConfirmation(appointmentForSMS, callerPhone);

    console.log(`[EventBus] SMS confirmation sent for appointment ${appointment.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EventBus] handleAppointmentBooked error:', message);
  }
}

/**
 * Handle LEAD_CAPTURED events.
 *
 * 1. Qualify the lead using configured criteria
 * 2. Sync to CRM if configured
 *
 * Requirement 5.4: Assign qualification status and sync within 30 seconds.
 */
async function handleLeadCaptured(data: unknown): Promise<void> {
  try {
    const payload = data as LeadCapturedPayload;
    const { callId, businessId, lead } = payload;

    console.log(`[EventBus] Processing LEAD_CAPTURED for callId=${callId}, leadId=${lead.id}`);

    // 1. Qualify lead
    let qualificationCriteria = payload.qualificationCriteria;
    if (!qualificationCriteria && deps.getQualificationCriteria) {
      qualificationCriteria = await deps.getQualificationCriteria(businessId);
    }

    if (qualificationCriteria && qualificationCriteria.length > 0) {
      const status = qualifyLead(lead, qualificationCriteria);
      lead.qualificationStatus = status;
      console.log(`[EventBus] Lead ${lead.id} qualified as: ${status}`);
    }

    // 2. Sync to CRM
    let crmConfig: CRMConfig | null | undefined = payload.crmConfig;
    if (!crmConfig && deps.getCRMConfig) {
      crmConfig = await deps.getCRMConfig(businessId);
    }

    if (crmConfig && crmConfig.isActive) {
      try {
        const syncResult = await syncToCRM(lead, crmConfig);
        if (syncResult.success) {
          lead.crmSyncStatus = 'synced';
          lead.crmRecordId = syncResult.crmRecordId || null;
          console.log(`[EventBus] Lead ${lead.id} synced to CRM: ${syncResult.crmRecordId}`);
        } else {
          console.warn(
            `[EventBus] CRM sync failed for lead ${lead.id}: ${syncResult.error}` +
              (syncResult.retryQueued ? ' (retry queued)' : '')
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[EventBus] CRM sync error for lead ${lead.id}:`, message);

        // Publish CRM_SYNC_REQUIRED for retry processing
        await publish(CHANNELS.CRM_SYNC_REQUIRED, {
          leadId: lead.id,
          businessId,
          error: message,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EventBus] handleLeadCaptured error:', message);
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Maps summary outcome category to SMS CallOutcome type.
 */
function mapOutcomeToSMSOutcome(
  outcome: string
): 'missed_call' | 'voicemail' | 'lead_captured' | 'appointment_booked' {
  switch (outcome) {
    case 'appointment_booked':
      return 'appointment_booked';
    case 'lead_captured':
      return 'lead_captured';
    case 'message_taken':
      return 'voicemail';
    default:
      return 'lead_captured';
  }
}

// ─── Initialization ─────────────────────────────────────────────────────────

/**
 * Initialize the event bus by subscribing handlers to Redis channels.
 *
 * This function should be called once at server startup. All handlers
 * are non-blocking and wrapped in try/catch to ensure failures do not
 * propagate or affect webhook response times.
 *
 * @param dependencies - Optional service dependencies for processing events
 */
export function initEventBus(dependencies?: EventBusDependencies): void {
  if (dependencies) {
    deps = dependencies;
  }

  // Subscribe to CALL_ENDED events
  subscribe(CHANNELS.CALL_ENDED, (data) => {
    // Fire-and-forget: do not await so webhook response is not blocked
    handleCallEnded(data).catch((err) => {
      console.error('[EventBus] Unhandled error in handleCallEnded:', err);
    });
  });

  // Subscribe to APPOINTMENT_BOOKED events
  subscribe(CHANNELS.APPOINTMENT_BOOKED, (data) => {
    handleAppointmentBooked(data).catch((err) => {
      console.error('[EventBus] Unhandled error in handleAppointmentBooked:', err);
    });
  });

  // Subscribe to LEAD_CAPTURED events
  subscribe(CHANNELS.LEAD_CAPTURED, (data) => {
    handleLeadCaptured(data).catch((err) => {
      console.error('[EventBus] Unhandled error in handleLeadCaptured:', err);
    });
  });

  console.log('[EventBus] Handlers initialized — listening for CALL_ENDED, APPOINTMENT_BOOKED, LEAD_CAPTURED');
}

// Export handlers for testing
export { handleCallEnded, handleAppointmentBooked, handleLeadCaptured };
