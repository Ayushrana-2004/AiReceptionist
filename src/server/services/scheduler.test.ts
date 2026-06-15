import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchedulerService,
  ICalendarProviderAdapter,
  CalendarConfig,
  DateRange,
  TimeSlot,
  CalendarEvent,
  AppointmentDTO,
  computeDateRange,
} from './scheduler';

// --- Mock Calendar Provider ---

class MockCalendarProvider implements ICalendarProviderAdapter {
  private slots: Map<string, TimeSlot[]> = new Map();
  private createdEvents: Map<string, CalendarEvent> = new Map();
  private nextEventId = 1;

  setSlots(calendarId: string, dateRange: DateRange, slots: TimeSlot[]): void {
    const key = `${calendarId}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
    this.slots.set(key, slots);
  }

  setAllSlots(slots: TimeSlot[]): void {
    // Store slots that will be returned for any query where the slot falls in range
    this._allSlots = slots;
  }

  private _allSlots: TimeSlot[] = [];

  async getAvailableSlots(calendarId: string, dateRange: DateRange): Promise<TimeSlot[]> {
    // First check exact match
    const key = `${calendarId}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
    if (this.slots.has(key)) {
      return this.slots.get(key)!;
    }

    // Fall back to filtering _allSlots by date range
    return this._allSlots.filter(
      (slot) => slot.start >= dateRange.start && slot.start < dateRange.end
    );
  }

  async createEvent(calendarId: string, event: CalendarEvent): Promise<string> {
    const eventId = `event_${this.nextEventId++}`;
    this.createdEvents.set(eventId, event);
    return eventId;
  }

  async deleteEvent(_calendarId: string, eventId: string): Promise<void> {
    if (!this.createdEvents.has(eventId)) {
      throw new Error(`Event not found: ${eventId}`);
    }
    this.createdEvents.delete(eventId);
  }

  getCreatedEvent(eventId: string): CalendarEvent | undefined {
    return this.createdEvents.get(eventId);
  }
}

// --- Test Fixtures ---

function createCalendarConfig(): CalendarConfig {
  return {
    provider: 'google',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    calendarId: 'primary',
  };
}

function createAppointmentDTO(overrides?: Partial<AppointmentDTO>): AppointmentDTO {
  return {
    businessId: 'biz_123',
    callId: 'call_456',
    callerName: 'John Doe',
    callerPhone: '+14155551234',
    serviceType: 'Consultation',
    scheduledAt: new Date('2024-03-15T10:00:00Z'),
    ...overrides,
  };
}

// --- Tests ---

describe('computeDateRange', () => {
  it('should compute a 7-day window from a given date', () => {
    const preferred = new Date('2024-03-10T14:30:00Z');
    const range = computeDateRange(preferred);

    expect(range.start).toEqual(new Date('2024-03-10T00:00:00.000Z'));
    expect(range.end).toEqual(new Date('2024-03-17T00:00:00.000Z'));
  });

  it('should normalize start to beginning of day (UTC)', () => {
    const preferred = new Date('2024-06-15T23:59:59Z');
    const range = computeDateRange(preferred);

    expect(range.start.getUTCHours()).toBe(0);
    expect(range.start.getUTCMinutes()).toBe(0);
    expect(range.start.getUTCSeconds()).toBe(0);
    expect(range.start.getUTCMilliseconds()).toBe(0);
  });

  it('should span exactly 7 days', () => {
    const preferred = new Date('2024-01-01T00:00:00Z');
    const range = computeDateRange(preferred);

    const diffMs = range.end.getTime() - range.start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it('should handle month boundaries correctly', () => {
    const preferred = new Date('2024-01-28T12:00:00Z');
    const range = computeDateRange(preferred);

    expect(range.start).toEqual(new Date('2024-01-28T00:00:00.000Z'));
    expect(range.end).toEqual(new Date('2024-02-04T00:00:00.000Z'));
  });
});

describe('SchedulerService', () => {
  let mockProvider: MockCalendarProvider;
  let scheduler: SchedulerService;
  let config: CalendarConfig;

  beforeEach(() => {
    mockProvider = new MockCalendarProvider();
    scheduler = new SchedulerService(mockProvider);
    config = createCalendarConfig();
  });

  describe('checkAvailability', () => {
    it('should return available slots within the date range', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-03-10T00:00:00Z'),
        end: new Date('2024-03-17T00:00:00Z'),
      };

      const expectedSlots: TimeSlot[] = [
        { start: new Date('2024-03-11T09:00:00Z'), end: new Date('2024-03-11T10:00:00Z') },
        { start: new Date('2024-03-12T14:00:00Z'), end: new Date('2024-03-12T15:00:00Z') },
      ];

      mockProvider.setSlots(config.calendarId, dateRange, expectedSlots);

      const result = await scheduler.checkAvailability(config, dateRange);
      expect(result).toEqual(expectedSlots);
    });

    it('should return fallback slots when no slots in window', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-03-10T00:00:00Z'),
        end: new Date('2024-03-17T00:00:00Z'),
      };

      // No slots in the initial window
      mockProvider.setSlots(config.calendarId, dateRange, []);

      // Slots available after the window
      const fallbackSlots: TimeSlot[] = [
        { start: new Date('2024-03-18T09:00:00Z'), end: new Date('2024-03-18T10:00:00Z') },
        { start: new Date('2024-03-19T11:00:00Z'), end: new Date('2024-03-19T12:00:00Z') },
        { start: new Date('2024-03-20T14:00:00Z'), end: new Date('2024-03-20T15:00:00Z') },
        { start: new Date('2024-03-25T09:00:00Z'), end: new Date('2024-03-25T10:00:00Z') },
      ];

      mockProvider.setAllSlots(fallbackSlots);

      const result = await scheduler.checkAvailability(config, dateRange);

      // Should return exactly 3 fallback slots
      expect(result).toHaveLength(3);
      // All slots should be after the window end
      for (const slot of result) {
        expect(slot.start.getTime()).toBeGreaterThanOrEqual(dateRange.end.getTime());
      }
    });

    it('should return fewer than 3 fallback slots if not enough available', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-03-10T00:00:00Z'),
        end: new Date('2024-03-17T00:00:00Z'),
      };

      mockProvider.setSlots(config.calendarId, dateRange, []);

      // Only 1 slot available in fallback range
      const fallbackSlots: TimeSlot[] = [
        { start: new Date('2024-03-20T09:00:00Z'), end: new Date('2024-03-20T10:00:00Z') },
      ];
      mockProvider.setAllSlots(fallbackSlots);

      const result = await scheduler.checkAvailability(config, dateRange);
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no slots anywhere', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-03-10T00:00:00Z'),
        end: new Date('2024-03-17T00:00:00Z'),
      };

      mockProvider.setSlots(config.calendarId, dateRange, []);
      mockProvider.setAllSlots([]);

      const result = await scheduler.checkAvailability(config, dateRange);
      expect(result).toHaveLength(0);
    });
  });

  describe('bookAppointment', () => {
    it('should create a calendar event and return an Appointment record', async () => {
      const dto = createAppointmentDTO();

      const result = await scheduler.bookAppointment(config, dto);

      expect(result.id).toBeTruthy();
      expect(result.businessId).toBe(dto.businessId);
      expect(result.callId).toBe(dto.callId);
      expect(result.callerName).toBe(dto.callerName);
      expect(result.callerPhone).toBe(dto.callerPhone);
      expect(result.serviceType).toBe(dto.serviceType);
      expect(result.scheduledAt).toEqual(dto.scheduledAt);
      expect(result.calendarEventId).toBeTruthy();
      expect(result.smsConfirmationSent).toBe(false);
      expect(result.remindersSent).toEqual([]);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should create the event with correct details', async () => {
      const dto = createAppointmentDTO();

      const result = await scheduler.bookAppointment(config, dto);

      const createdEvent = mockProvider.getCreatedEvent(result.calendarEventId);
      expect(createdEvent).toBeDefined();
      expect(createdEvent!.title).toBe('Consultation - John Doe');
      expect(createdEvent!.start).toEqual(dto.scheduledAt);
      expect(createdEvent!.attendeeName).toBe('John Doe');
      expect(createdEvent!.attendeePhone).toBe('+14155551234');
    });

    it('should set event end time to 1 hour after start', async () => {
      const dto = createAppointmentDTO({
        scheduledAt: new Date('2024-03-15T10:00:00Z'),
      });

      const result = await scheduler.bookAppointment(config, dto);

      const createdEvent = mockProvider.getCreatedEvent(result.calendarEventId);
      expect(createdEvent!.end).toEqual(new Date('2024-03-15T11:00:00Z'));
    });
  });

  describe('cancelAppointment', () => {
    it('should delete the calendar event', async () => {
      const dto = createAppointmentDTO();
      const appointment = await scheduler.bookAppointment(config, dto);

      await expect(scheduler.cancelAppointment(appointment.id)).resolves.toBeUndefined();
    });

    it('should throw when appointment not found', async () => {
      await expect(scheduler.cancelAppointment('non_existent_id')).rejects.toThrow(
        'Appointment not found: non_existent_id'
      );
    });

    it('should not allow cancelling the same appointment twice', async () => {
      const dto = createAppointmentDTO();
      const appointment = await scheduler.bookAppointment(config, dto);

      await scheduler.cancelAppointment(appointment.id);

      await expect(scheduler.cancelAppointment(appointment.id)).rejects.toThrow(
        `Appointment not found: ${appointment.id}`
      );
    });
  });
});
