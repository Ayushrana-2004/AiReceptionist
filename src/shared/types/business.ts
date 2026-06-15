import { Language } from './enums';
import { OperatingHours } from './common';

/**
 * Core Business Configuration.
 */
export interface Business {
  id: string;                    // UUID
  name: string;                  // max 100 chars
  greeting: string;              // max 500 chars
  voiceProfileId: string;        // references voice profile
  enabledLanguages: Language[];  // at least one
  operatingHours: OperatingHours;
  maxConcurrentCalls: number;    // default 50
  callTimeoutSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}
