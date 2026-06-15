/**
 * Operating hours configuration for a business.
 */
export interface OperatingHours {
  timezone: string;
  schedule: WeeklySchedule;
}

export interface WeeklySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface DaySchedule {
  isOpen: boolean;
  openTime: string;  // HH:mm format
  closeTime: string; // HH:mm format
}

/**
 * Metadata associated with a call record.
 */
export interface CallMetadata {
  vapiCallId: string;
  assistantId: string;
  transferAttempts: number;
  sttFailures: number;
  languageDetected: string;
  toolCallsMade: string[];
}

/**
 * Paginated result wrapper.
 */
export interface PaginatedResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}
