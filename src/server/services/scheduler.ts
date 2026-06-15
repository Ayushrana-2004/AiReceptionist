import { Appointment } from '../../shared/types/appointment';
import { CalendarProvider } from '../../shared/types/enums';

// --- Types ---

/**
 * Configuration for connecting to a calendar provider.
 */
export interface CalendarConfig {
  provider: CalendarProvider;
  accessToken: string;
  refreshToken: string;
  calendarId: string;
}

/**
 * Represents a date range with inclusive start and exclusive end.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * A single available time slot on the calendar.
 */
export interface TimeSlot {
  start: Date;
  end: Date;
}

/**
 * Data transfer object for creating an appointment.
 */
export interface AppointmentDTO {
  businessId: string;
  callId: string;
  callerName: string;
  callerPhone: string;
  serviceType: string;
  scheduledAt: Date;
}

// --- Calendar Provider Adapter Interface ---

/**
 * Adapter interface for calendar providers.
 * Allows different calendar backends (Google, Outlook, Calendly)
 * to be used interchangeably, and enables easy mocking in tests.
 */
export interface ICalendarProviderAdapter {
  getAvailableSlots(calendarId: string, dateRange: DateRange): Promise<TimeSlot[]>;
  createEvent(calendarId: string, event: CalendarEvent): Promise<string>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/**
 * Calendar event to be created in the provider.
 */
export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  attendeeName?: string;
  attendeePhone?: string;
}

// --- Scheduler Service Interface ---

export interface ISchedulerService {
  checkAvailability(calendarConfig: CalendarConfig, dateRange: DateRange): Promise<TimeSlot[]>;
  bookAppointment(calendarConfig: CalendarConfig, appointment: AppointmentDTO): Promise<Appointment>;
  cancelAppointment(appointmentId: string): Promise<void>;
}

// --- Helper Functions ---

/**
 * Computes a 7-calendar-day window from a given start date.
 * The window is inclusive of the start date and exclusive of the end date.
 * Uses UTC to avoid timezone issues.
 */
export function computeDateRange(preferredDate: Date): DateRange {
  const start = new Date(Date.UTC(
    preferredDate.getUTCFullYear(),
    preferredDate.getUTCMonth(),
    preferredDate.getUTCDate(),
    0, 0, 0, 0
  ));

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return { start, end };
}

// --- Scheduler Service Implementation ---

export class SchedulerService implements ISchedulerService {
  private calendarProvider: ICalendarProviderAdapter;
  private appointmentStore: Map<string, { calendarId: string; calendarEventId: string }>;

  constructor(calendarProvider: ICalendarProviderAdapter) {
    this.calendarProvider = calendarProvider;
    this.appointmentStore = new Map();
  }

  /**
   * Check availability within a 7-day window starting from the dateRange start.
   * If no slots are found in the window, applies fallback logic to return
   * the next 3 available slots beyond the window end.
   */
  async checkAvailability(calendarConfig: CalendarConfig, dateRange: DateRange): Promise<TimeSlot[]> {
    const slots = await this.calendarProvider.getAvailableSlots(
      calendarConfig.calendarId,
      dateRange
    );

    if (slots.length > 0) {
      return slots;
    }

    // Fallback: find the next 3 slots after the window end
    return this.findFallbackSlots(calendarConfig, dateRange.end);
  }

  /**
   * Book an appointment by creating a calendar event and returning
   * the Appointment record.
   */
  async bookAppointment(calendarConfig: CalendarConfig, appointment: AppointmentDTO): Promise<Appointment> {
    // Default appointment duration: 1 hour
    const eventEnd = new Date(appointment.scheduledAt);
    eventEnd.setHours(eventEnd.getHours() + 1);

    const calendarEvent: CalendarEvent = {
      title: `${appointment.serviceType} - ${appointment.callerName}`,
      start: appointment.scheduledAt,
      end: eventEnd,
      description: `Service: ${appointment.serviceType}`,
      attendeeName: appointment.callerName,
      attendeePhone: appointment.callerPhone,
    };

    const calendarEventId = await this.calendarProvider.createEvent(
      calendarConfig.calendarId,
      calendarEvent
    );

    const id = generateId();

    // Store mapping for cancellation
    this.appointmentStore.set(id, {
      calendarId: calendarConfig.calendarId,
      calendarEventId,
    });

    const appointmentRecord: Appointment = {
      id,
      businessId: appointment.businessId,
      callId: appointment.callId,
      callerName: appointment.callerName,
      callerPhone: appointment.callerPhone,
      serviceType: appointment.serviceType,
      scheduledAt: appointment.scheduledAt,
      calendarEventId,
      smsConfirmationSent: false,
      remindersSent: [],
      createdAt: new Date(),
    };

    return appointmentRecord;
  }

  /**
   * Cancel an appointment by removing the calendar event.
   */
  async cancelAppointment(appointmentId: string): Promise<void> {
    const stored = this.appointmentStore.get(appointmentId);
    if (!stored) {
      throw new Error(`Appointment not found: ${appointmentId}`);
    }

    await this.calendarProvider.deleteEvent(stored.calendarId, stored.calendarEventId);
    this.appointmentStore.delete(appointmentId);
  }

  /**
   * Fallback logic: search for the next 3 available slots after the window end.
   * Searches in successive 7-day windows until 3 slots are found, or gives up
   * after a maximum of 4 additional window searches (28 days beyond original window).
   */
  private async findFallbackSlots(calendarConfig: CalendarConfig, windowEnd: Date): Promise<TimeSlot[]> {
    const collectedSlots: TimeSlot[] = [];
    let searchStart = new Date(windowEnd);
    const maxSearchWindows = 4;

    for (let i = 0; i < maxSearchWindows && collectedSlots.length < 3; i++) {
      const searchEnd = new Date(searchStart);
      searchEnd.setDate(searchEnd.getDate() + 7);

      const slots = await this.calendarProvider.getAvailableSlots(
        calendarConfig.calendarId,
        { start: searchStart, end: searchEnd }
      );

      for (const slot of slots) {
        if (collectedSlots.length >= 3) break;
        collectedSlots.push(slot);
      }

      searchStart = searchEnd;
    }

    return collectedSlots.slice(0, 3);
  }
}

// --- Utility ---

function generateId(): string {
  return `apt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
