/**
 * Supported languages for the AI Receptionist.
 */
export type Language = 'en' | 'es' | 'fr' | 'zh';

/**
 * Knowledge Base entry categories.
 */
export type KBCategory = 'business_hours' | 'services' | 'pricing' | 'location' | 'custom';

/**
 * Call lifecycle statuses.
 */
export type CallStatus = 'active' | 'queued' | 'completed' | 'failed';

/**
 * Reminder intervals before appointments.
 */
export type ReminderInterval = '15min' | '1hour' | '4hours' | '24hours' | '48hours';

/**
 * Lead qualification statuses.
 */
export type QualificationStatus = 'qualified' | 'unqualified' | 'needs_review';

/**
 * CRM synchronization statuses.
 */
export type CRMSyncStatus = 'synced' | 'pending' | 'failed';

/**
 * SMS message types.
 */
export type SMSType = 'confirmation' | 'reminder' | 'follow_up';

/**
 * SMS delivery statuses.
 */
export type SMSStatus = 'sent' | 'delivered' | 'failed' | 'permanently_failed';

/**
 * SMS template trigger events.
 */
export type SMSTriggerEvent = 'missed_call' | 'voicemail' | 'lead_captured' | 'appointment_booked';

/**
 * Analytics aggregation periods.
 */
export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly';

/**
 * Calendar integration providers.
 */
export type CalendarProvider = 'google' | 'outlook' | 'calendly';

/**
 * CRM integration providers.
 */
export type CRMProvider = 'hubspot' | 'salesforce' | 'zoho';

/**
 * Transfer destination types.
 */
export type TransferDestinationType = 'phone' | 'sip' | 'queue';

/**
 * Qualification criteria categories.
 */
export type QualificationCategory = 'budget' | 'timeline' | 'service_type';
