import { SMSType, SMSStatus, SMSTriggerEvent } from './enums';

/**
 * SMS message record.
 */
export interface SMSMessage {
  id: string;
  businessId: string;
  recipientPhone: string;
  templateId: string | null;
  body: string;                  // max 160 chars
  type: SMSType;
  status: SMSStatus;
  retryCount: number;            // max 3
  twilioMessageSid: string | null;
  sentAt: Date;
  deliveredAt: Date | null;
}

/**
 * SMS template configuration.
 */
export interface SMSTemplate {
  id: string;
  businessId: string;
  name: string;
  body: string;                  // max 160 chars
  triggerEvent: SMSTriggerEvent;
  isActive: boolean;
}
