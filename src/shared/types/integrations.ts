import { CalendarProvider, CRMProvider } from './enums';

/**
 * Calendar integration configuration.
 */
export interface CalendarIntegration {
  id: string;
  businessId: string;
  provider: CalendarProvider;
  accessToken: string;           // encrypted
  refreshToken: string;          // encrypted
  calendarId: string;
  isActive: boolean;
}

/**
 * CRM integration configuration.
 */
export interface CRMIntegration {
  id: string;
  businessId: string;
  provider: CRMProvider;
  accessToken: string;           // encrypted
  refreshToken: string;          // encrypted
  fieldMapping: Record<string, string>;
  isActive: boolean;
}
