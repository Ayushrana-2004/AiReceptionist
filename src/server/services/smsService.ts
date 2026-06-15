/**
 * SMS Service
 *
 * Implements ISMSService for sending appointment confirmations, reminders,
 * and follow-up messages via Twilio. Uses an adapter pattern for testability.
 *
 * Key behaviors:
 * - Validates phone numbers before sending (skips + logs if invalid)
 * - Retry logic: max 3 retries at 5-min intervals, then mark permanently_failed
 * - Tracks delivery status: sent, delivered, failed, permanently_failed
 */

import type { Appointment } from '../../shared/types/appointment';
import type { SMSTemplate } from '../../shared/types/sms';
import type { ReminderInterval, SMSStatus, SMSType } from '../../shared/types/enums';
import { isValidPhone } from '../validators/formatValidator';
import { SMS_RETRY_CONFIG, isRetryExhausted } from './retryScheduler';

// --- Types ---

export interface CallOutcome {
  callId: string;
  businessId: string;
  outcome: 'missed_call' | 'voicemail' | 'lead_captured' | 'appointment_booked';
  callerPhone: string;
  callerName?: string;
  timestamp: Date;
}

export interface SMSResult {
  success: boolean;
  messageId: string | null;
  status: SMSStatus;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface SMSDeliveryStatus {
  messageId: string;
  status: SMSStatus;
  retryCount: number;
  lastAttemptAt: Date | null;
  deliveredAt: Date | null;
}

export interface SMSLogEntry {
  timestamp: Date;
  messageId: string | null;
  event: string;
  details: string;
}

// --- Twilio Adapter Interface ---

export interface ITwilioAdapter {
  sendSMS(to: string, body: string): Promise<{ messageSid: string }>;
  getMessageStatus(messageSid: string): Promise<{ status: string; dateDelivered: string | null }>;
}

// --- SMS Service Interface ---

export interface ISMSService {
  sendConfirmation(appointment: Appointment, phoneNumber: string): Promise<SMSResult>;
  sendReminder(appointment: Appointment, interval: ReminderInterval): Promise<SMSResult>;
  sendFollowUp(callOutcome: CallOutcome, template: SMSTemplate, phoneNumber: string): Promise<SMSResult>;
  getDeliveryStatus(messageId: string): Promise<SMSDeliveryStatus>;
  retryFailed(messageId: string): Promise<SMSResult>;
}

// --- Internal Message Store ---

interface StoredMessage {
  messageId: string;
  recipientPhone: string;
  body: string;
  type: SMSType;
  status: SMSStatus;
  retryCount: number;
  twilioMessageSid: string | null;
  sentAt: Date;
  lastAttemptAt: Date | null;
  deliveredAt: Date | null;
}

// --- SMS Service Implementation ---

export class SMSService implements ISMSService {
  private twilioAdapter: ITwilioAdapter;
  private messages: Map<string, StoredMessage> = new Map();
  private logs: SMSLogEntry[] = [];

  constructor(twilioAdapter: ITwilioAdapter) {
    this.twilioAdapter = twilioAdapter;
  }

  /**
   * Sends an SMS confirmation for a booked appointment.
   */
  async sendConfirmation(appointment: Appointment, phoneNumber: string): Promise<SMSResult> {
    const body = `Your appointment for ${appointment.serviceType} is confirmed for ${this.formatDate(appointment.scheduledAt)}. See you then!`;
    return this.sendMessage(phoneNumber, body, 'confirmation');
  }

  /**
   * Sends a reminder SMS before an appointment at the specified interval.
   */
  async sendReminder(appointment: Appointment, interval: ReminderInterval): Promise<SMSResult> {
    const intervalLabel = this.formatInterval(interval);
    const body = `Reminder: Your ${appointment.serviceType} appointment is in ${intervalLabel}. Time: ${this.formatDate(appointment.scheduledAt)}.`;
    return this.sendMessage(appointment.callerPhone, body, 'reminder');
  }

  /**
   * Sends a follow-up SMS based on call outcome using the specified template.
   */
  async sendFollowUp(callOutcome: CallOutcome, template: SMSTemplate, phoneNumber: string): Promise<SMSResult> {
    const body = this.renderTemplate(template.body, callOutcome);
    return this.sendMessage(phoneNumber, body, 'follow_up');
  }

  /**
   * Gets the delivery status for a previously sent message.
   */
  async getDeliveryStatus(messageId: string): Promise<SMSDeliveryStatus> {
    const stored = this.messages.get(messageId);
    if (!stored) {
      return {
        messageId,
        status: 'failed',
        retryCount: 0,
        lastAttemptAt: null,
        deliveredAt: null,
      };
    }

    // If we have a Twilio SID and status is 'sent', check with Twilio for updates
    if (stored.twilioMessageSid && stored.status === 'sent') {
      try {
        const twilioStatus = await this.twilioAdapter.getMessageStatus(stored.twilioMessageSid);
        if (twilioStatus.status === 'delivered') {
          stored.status = 'delivered';
          stored.deliveredAt = twilioStatus.dateDelivered ? new Date(twilioStatus.dateDelivered) : new Date();
        } else if (twilioStatus.status === 'failed' || twilioStatus.status === 'undelivered') {
          stored.status = 'failed';
        }
      } catch {
        // If status check fails, return last known status
      }
    }

    return {
      messageId: stored.messageId,
      status: stored.status,
      retryCount: stored.retryCount,
      lastAttemptAt: stored.lastAttemptAt,
      deliveredAt: stored.deliveredAt,
    };
  }

  /**
   * Retries sending a previously failed message.
   * Max 3 retries at 5-min intervals, then marks permanently_failed.
   */
  async retryFailed(messageId: string): Promise<SMSResult> {
    const stored = this.messages.get(messageId);
    if (!stored) {
      return {
        success: false,
        messageId,
        status: 'failed',
        error: 'Message not found',
      };
    }

    if (stored.status === 'delivered') {
      return {
        success: true,
        messageId: stored.messageId,
        status: 'delivered',
      };
    }

    if (stored.status === 'permanently_failed') {
      return {
        success: false,
        messageId: stored.messageId,
        status: 'permanently_failed',
        error: 'Message has been permanently failed after maximum retries',
      };
    }

    // Check if retries are exhausted
    if (isRetryExhausted(stored.retryCount, SMS_RETRY_CONFIG.maxAttempts)) {
      stored.status = 'permanently_failed';
      this.log(messageId, 'permanently_failed', `Max retries (${SMS_RETRY_CONFIG.maxAttempts}) exhausted`);
      return {
        success: false,
        messageId: stored.messageId,
        status: 'permanently_failed',
        error: 'Maximum retry attempts exhausted',
      };
    }

    // Attempt retry
    stored.retryCount += 1;
    stored.lastAttemptAt = new Date();

    try {
      const result = await this.twilioAdapter.sendSMS(stored.recipientPhone, stored.body);
      stored.twilioMessageSid = result.messageSid;
      stored.status = 'sent';
      this.log(messageId, 'retry_sent', `Retry ${stored.retryCount}/${SMS_RETRY_CONFIG.maxAttempts} succeeded`);
      return {
        success: true,
        messageId: stored.messageId,
        status: 'sent',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // If this was the last allowed retry, mark permanently failed
      if (isRetryExhausted(stored.retryCount, SMS_RETRY_CONFIG.maxAttempts)) {
        stored.status = 'permanently_failed';
        this.log(messageId, 'permanently_failed', `Retry ${stored.retryCount}/${SMS_RETRY_CONFIG.maxAttempts} failed. ${errorMessage}`);
        return {
          success: false,
          messageId: stored.messageId,
          status: 'permanently_failed',
          error: `Final retry failed: ${errorMessage}`,
        };
      }

      stored.status = 'failed';
      this.log(messageId, 'retry_failed', `Retry ${stored.retryCount}/${SMS_RETRY_CONFIG.maxAttempts} failed. ${errorMessage}`);
      return {
        success: false,
        messageId: stored.messageId,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Returns all log entries for debugging and dashboard display.
   */
  getLogs(): SMSLogEntry[] {
    return [...this.logs];
  }

  // --- Private Methods ---

  private async sendMessage(phoneNumber: string, body: string, type: SMSType): Promise<SMSResult> {
    // Validate phone number before attempting to send
    if (!isValidPhone(phoneNumber)) {
      const messageId = this.generateId();
      this.log(messageId, 'sms_skipped', `SMS skipped — invalid number: ${phoneNumber}`);
      return {
        success: false,
        messageId: null,
        status: 'failed',
        skipped: true,
        skipReason: 'SMS skipped — invalid number',
      };
    }

    const messageId = this.generateId();
    const now = new Date();

    // Store the message
    const stored: StoredMessage = {
      messageId,
      recipientPhone: phoneNumber,
      body: body.slice(0, 160), // Enforce 160 char limit
      type,
      status: 'sent',
      retryCount: 0,
      twilioMessageSid: null,
      sentAt: now,
      lastAttemptAt: now,
      deliveredAt: null,
    };

    try {
      const result = await this.twilioAdapter.sendSMS(phoneNumber, stored.body);
      stored.twilioMessageSid = result.messageSid;
      stored.status = 'sent';
      this.messages.set(messageId, stored);
      this.log(messageId, 'sent', `SMS ${type} sent to ${phoneNumber}`);
      return {
        success: true,
        messageId,
        status: 'sent',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stored.status = 'failed';
      this.messages.set(messageId, stored);
      this.log(messageId, 'send_failed', `SMS ${type} failed: ${errorMessage}`);
      return {
        success: false,
        messageId,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private formatInterval(interval: ReminderInterval): string {
    const mapping: Record<ReminderInterval, string> = {
      '15min': '15 minutes',
      '1hour': '1 hour',
      '4hours': '4 hours',
      '24hours': '24 hours',
      '48hours': '48 hours',
    };
    return mapping[interval];
  }

  private renderTemplate(templateBody: string, callOutcome: CallOutcome): string {
    return templateBody
      .replace('{{caller_name}}', callOutcome.callerName || 'Valued Customer')
      .replace('{{outcome}}', callOutcome.outcome)
      .replace('{{business_id}}', callOutcome.businessId);
  }

  private generateId(): string {
    return `sms_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private log(messageId: string | null, event: string, details: string): void {
    this.logs.push({
      timestamp: new Date(),
      messageId,
      event,
      details,
    });
  }
}
