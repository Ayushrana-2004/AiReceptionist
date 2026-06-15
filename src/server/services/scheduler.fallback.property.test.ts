/**
 * Feature: ai-receptionist, Property 4: Appointment fallback slot selection
 *
 * Validates: Requirements 2.4
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SchedulerService,
  ICalendarProviderAdapter,
  CalendarConfig,
  DateRange,
  TimeSlot,
  CalendarEvent,
} from './scheduler';
import { CalendarProvider } from '../../shared/types/enums';

describe('Property 4: Appointment fallback slot selection', () => {
  /**
   * Generator: random start dates between 2020-01-01 and 2029-12-31
   */
  const startDateArb = fc.date({
    min: new Date('2020-01-01T00:00:00.000Z'),
    max: new Date('2029-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  });

  /**
   * Creates a mock ICalendarProviderAdapter that returns:
   * - Empty array for any date range within the initial 7-day window
   * - The provided fallback slots for ranges beyond the window end
   */
  function createMockProvider(
    windowEnd: Date,
    fallbackSlots: TimeSlot[]
  ): ICalendarProviderAdapter {
    return {
      getAvailableSlots: async (
        _calendarId: string,
        dateRange: DateRange
      ): Promise<TimeSlot[]> => {
        // If the query range starts before the window end, return empty (no slots in initial window)
        if (dateRange.start.getTime() < windowEnd.getTime()) {
          return [];
        }
        // For fallback ranges beyond the window, return slots that fall within this range
        return fallbackSlots.filter(
          (slot) =>
            slot.start.getTime() >= dateRange.start.getTime() &&
            slot.start.getTime() < dateRange.end.getTime()
        );
      },
      createEvent: async (
        _calendarId: string,
        _event: CalendarEvent
      ): Promise<string> => {
        return 'mock-event-id';
      },
      deleteEvent: async (
        _calendarId: string,
        _eventId: string
      ): Promise<void> => {},
    };
  }

  const calendarConfig: CalendarConfig = {
    provider: 'google' as CalendarProvider,
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    calendarId: 'test-calendar-id',
  };

  it('returns exactly 3 slots when fallback has 3+ available slots beyond the window', async () => {
    await fc.assert(
      fc.asyncProperty(startDateArb, async (startDate) => {
        // Compute 7-day window
        const windowStart = new Date(
          Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate(),
            0,
            0,
            0,
            0
          )
        );
        const windowEnd = new Date(windowStart);
        windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

        // Generate fallback slots: place them in the first week after the window end
        // so the fallback search will find them
        const fallbackSlots: TimeSlot[] = [];
        for (let i = 0; i < 5; i++) {
          const slotStart = new Date(
            windowEnd.getTime() + (i + 1) * 2 * 60 * 60 * 1000
          ); // 2h apart
          const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
          fallbackSlots.push({ start: slotStart, end: slotEnd });
        }

        const mockProvider = createMockProvider(windowEnd, fallbackSlots);
        const scheduler = new SchedulerService(mockProvider);

        const dateRange: DateRange = { start: windowStart, end: windowEnd };
        const result = await scheduler.checkAvailability(calendarConfig, dateRange);

        expect(result).toHaveLength(3);
      }),
      { numRuns: 100 }
    );
  });

  it('all returned fallback slots have start timestamps strictly after the window end', async () => {
    await fc.assert(
      fc.asyncProperty(startDateArb, async (startDate) => {
        // Compute 7-day window
        const windowStart = new Date(
          Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate(),
            0,
            0,
            0,
            0
          )
        );
        const windowEnd = new Date(windowStart);
        windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

        // Generate fallback slots placed after the window end
        const fallbackSlots: TimeSlot[] = [];
        for (let i = 0; i < 5; i++) {
          const slotStart = new Date(
            windowEnd.getTime() + (i + 1) * 3 * 60 * 60 * 1000
          ); // 3h apart
          const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
          fallbackSlots.push({ start: slotStart, end: slotEnd });
        }

        const mockProvider = createMockProvider(windowEnd, fallbackSlots);
        const scheduler = new SchedulerService(mockProvider);

        const dateRange: DateRange = { start: windowStart, end: windowEnd };
        const result = await scheduler.checkAvailability(calendarConfig, dateRange);

        for (const slot of result) {
          expect(slot.start.getTime()).toBeGreaterThan(windowEnd.getTime());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('fallback slots are selected from slots beyond the window even with randomized slot times', async () => {
    await fc.assert(
      fc.asyncProperty(
        startDateArb,
        fc.array(fc.integer({ min: 1, max: 168 }), {
          minLength: 3,
          maxLength: 10,
        }),
        async (startDate, hourOffsets) => {
          // Compute 7-day window
          const windowStart = new Date(
            Date.UTC(
              startDate.getUTCFullYear(),
              startDate.getUTCMonth(),
              startDate.getUTCDate(),
              0,
              0,
              0,
              0
            )
          );
          const windowEnd = new Date(windowStart);
          windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

          // Create unique sorted offsets (hours after window end)
          // Ensure they fall within the first 7-day fallback search window
          const uniqueOffsets = [...new Set(hourOffsets)].sort((a, b) => a - b);
          // Ensure at least 3
          while (uniqueOffsets.length < 3) {
            uniqueOffsets.push(
              (uniqueOffsets[uniqueOffsets.length - 1] || 0) + 1
            );
          }

          const fallbackSlots: TimeSlot[] = uniqueOffsets.map((hours) => {
            const slotStart = new Date(
              windowEnd.getTime() + hours * 60 * 60 * 1000
            );
            const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
            return { start: slotStart, end: slotEnd };
          });

          const mockProvider = createMockProvider(windowEnd, fallbackSlots);
          const scheduler = new SchedulerService(mockProvider);

          const dateRange: DateRange = { start: windowStart, end: windowEnd };
          const result = await scheduler.checkAvailability(calendarConfig, dateRange);

          // Exactly 3 returned
          expect(result).toHaveLength(3);
          // All strictly after window end
          for (const slot of result) {
            expect(slot.start.getTime()).toBeGreaterThan(windowEnd.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
