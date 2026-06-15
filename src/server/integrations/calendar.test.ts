import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarAdapter, CalendlyAdapter, createCalendarAdapter, GoogleCalendarAdapterConfig } from './calendar';
import { CalendarConfig, CalendarEvent, DateRange } from '../services/scheduler';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GoogleCalendarAdapter', () => {
  let adapter: GoogleCalendarAdapter;
  const config: GoogleCalendarAdapterConfig = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GoogleCalendarAdapter(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAvailableSlots', () => {
    const calendarId = 'primary';
    const dateRange: DateRange = {
      start: new Date('2024-01-15T00:00:00.000Z'),
      end: new Date('2024-01-22T00:00:00.000Z'),
    };

    it('should return available slots when FreeBusy API returns busy periods', async () => {
      // Token is fresh (won't trigger refresh)
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: 'calendar#freeBusy',
          timeMin: dateRange.start.toISOString(),
          timeMax: dateRange.end.toISOString(),
          calendars: {
            [calendarId]: {
              busy: [
                // Busy 9-10 AM on Jan 15
                { start: '2024-01-15T09:00:00.000Z', end: '2024-01-15T10:00:00.000Z' },
              ],
            },
          },
        }),
      });

      const slots = await adapter.getAvailableSlots(calendarId, dateRange);

      // Should have slots for 7 days × 8 hours - 1 busy slot = 55 slots
      expect(slots.length).toBe(55);
      // The 9 AM slot on Jan 15 should be excluded
      const jan15At9 = slots.find(
        s => s.start.toISOString() === '2024-01-15T09:00:00.000Z'
      );
      expect(jan15At9).toBeUndefined();
    });

    it('should return empty array when API returns error status', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const slots = await adapter.getAvailableSlots(calendarId, dateRange);
      expect(slots).toEqual([]);
    });

    it('should return empty array when fetch throws (network failure)', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

      const slots = await adapter.getAvailableSlots(calendarId, dateRange);
      expect(slots).toEqual([]);
    });

    it('should return empty array when calendar has errors in response', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: 'calendar#freeBusy',
          timeMin: dateRange.start.toISOString(),
          timeMax: dateRange.end.toISOString(),
          calendars: {
            [calendarId]: {
              busy: [],
              errors: [{ domain: 'global', reason: 'notFound' }],
            },
          },
        }),
      });

      const slots = await adapter.getAvailableSlots(calendarId, dateRange);
      expect(slots).toEqual([]);
    });

    it('should return all business-hours slots when calendar is completely free', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: 'calendar#freeBusy',
          timeMin: dateRange.start.toISOString(),
          timeMax: dateRange.end.toISOString(),
          calendars: {
            [calendarId]: { busy: [] },
          },
        }),
      });

      const slots = await adapter.getAvailableSlots(calendarId, dateRange);
      // 7 days × 8 hours per day (9 AM – 5 PM) = 56 slots
      expect(slots.length).toBe(56);
    });
  });

  describe('createEvent', () => {
    const calendarId = 'primary';
    const event: CalendarEvent = {
      title: 'Consultation - John Doe',
      start: new Date('2024-01-15T10:00:00.000Z'),
      end: new Date('2024-01-15T11:00:00.000Z'),
      description: 'Service: General Consultation',
      attendeeName: 'John Doe',
      attendeePhone: '+15551234567',
    };

    it('should create an event and return the event ID', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'google-event-123',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event/123',
          summary: event.title,
          start: { dateTime: event.start.toISOString() },
          end: { dateTime: event.end.toISOString() },
        }),
      });

      const eventId = await adapter.createEvent(calendarId, event);
      expect(eventId).toBe('google-event-123');

      // Verify request was called with correct data
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/calendars/primary/events'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-access-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw descriptive error when API returns error', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Calendar access denied',
      });

      await expect(adapter.createEvent(calendarId, event)).rejects.toThrow(
        'Failed to create Google Calendar event: 403 Forbidden - Calendar access denied'
      );
    });

    it('should throw descriptive error when fetch throws', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(adapter.createEvent(calendarId, event)).rejects.toThrow(
        'Google Calendar event creation failed: Connection refused'
      );
    });
  });

  describe('deleteEvent', () => {
    const calendarId = 'primary';
    const eventId = 'google-event-123';

    it('should delete an event successfully', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await expect(adapter.deleteEvent(calendarId, eventId)).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/calendars/primary/events/${eventId}`),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should handle 410 Gone (already deleted) gracefully', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 410,
        statusText: 'Gone',
      });

      await expect(adapter.deleteEvent(calendarId, eventId)).resolves.toBeUndefined();
    });

    it('should throw descriptive error when API returns error', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Event not found',
      });

      await expect(adapter.deleteEvent(calendarId, eventId)).rejects.toThrow(
        'Failed to delete Google Calendar event: 404 Not Found - Event not found'
      );
    });

    it('should throw descriptive error when fetch throws', async () => {
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockRejectedValueOnce(new Error('Connection reset'));

      await expect(adapter.deleteEvent(calendarId, eventId)).rejects.toThrow(
        'Google Calendar event deletion failed: Connection reset'
      );
    });
  });

  describe('OAuth2 token refresh', () => {
    it('should refresh the token when expired', async () => {
      // Token expired
      (adapter as any).tokenExpiresAt = 0;

      // First call: token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      // Second call: the actual API call (FreeBusy)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: 'calendar#freeBusy',
          timeMin: '2024-01-15T00:00:00.000Z',
          timeMax: '2024-01-22T00:00:00.000Z',
          calendars: {
            primary: { busy: [] },
          },
        }),
      });

      const dateRange: DateRange = {
        start: new Date('2024-01-15T00:00:00.000Z'),
        end: new Date('2024-01-22T00:00:00.000Z'),
      };

      const slots = await adapter.getAvailableSlots('primary', dateRange);
      expect(slots.length).toBeGreaterThan(0);

      // Verify token refresh was called
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[0]).toBe('https://oauth2.googleapis.com/token');
    });

    it('should throw when token refresh fails', async () => {
      (adapter as any).tokenExpiresAt = 0;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid refresh token',
      });

      const event: CalendarEvent = {
        title: 'Test Event',
        start: new Date(),
        end: new Date(),
      };

      await expect(adapter.createEvent('primary', event)).rejects.toThrow(
        'OAuth2 token refresh failed'
      );
    });

    it('should not refresh token when still valid', async () => {
      // Token valid for another hour
      (adapter as any).tokenExpiresAt = Date.now() + 3600_000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: 'calendar#freeBusy',
          timeMin: '2024-01-15T00:00:00.000Z',
          timeMax: '2024-01-22T00:00:00.000Z',
          calendars: {
            primary: { busy: [] },
          },
        }),
      });

      const dateRange: DateRange = {
        start: new Date('2024-01-15T00:00:00.000Z'),
        end: new Date('2024-01-22T00:00:00.000Z'),
      };

      await adapter.getAvailableSlots('primary', dateRange);

      // Only one fetch call (the FreeBusy call, no token refresh)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createCalendarAdapter', () => {
  it('should create a GoogleCalendarAdapter for google provider', () => {
    const config: CalendarConfig = {
      provider: 'google',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
    };

    const adapter = createCalendarAdapter(config);
    expect(adapter).toBeInstanceOf(GoogleCalendarAdapter);
  });

  it('should create a CalendlyAdapter for calendly provider', () => {
    const config: CalendarConfig = {
      provider: 'calendly',
      accessToken: 'calendly-pat-token',
      refreshToken: '',
      calendarId: 'event-type-uuid',
    };

    const adapter = createCalendarAdapter(config);
    expect(adapter).toBeInstanceOf(CalendlyAdapter);
  });

  it('should throw for unsupported provider', () => {
    const config: CalendarConfig = {
      provider: 'outlook' as any,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
    };

    expect(() => createCalendarAdapter(config)).toThrow(
      "Unsupported calendar provider: outlook. Supported: 'google', 'calendly'."
    );
  });
});
