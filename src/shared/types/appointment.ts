import { ReminderInterval } from './enums';

/**
 * Booked appointment record.
 */
export interface Appointment {
  id: string;
  businessId: string;
  callId: string;
  callerName: string;
  callerPhone: string;
  serviceType: string;
  scheduledAt: Date;
  calendarEventId: string;
  smsConfirmationSent: boolean;
  remindersSent: ReminderInterval[];
  createdAt: Date;
}
