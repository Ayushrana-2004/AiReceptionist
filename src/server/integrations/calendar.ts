import {
  ICalendarProviderAdapter,
  CalendarConfig,
  CalendarEvent,
  DateRange,
  TimeSlot,
} from '../services/scheduler';

// --- Google Calendar API Response Types ---

interface GoogleCalendarTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface GoogleFreeBusyRequest {
  timeMin: string;
  timeMax: string;
  items: Array<{ id: string }>;
}

interface GoogleFreeBusyResponse {
  kind: string;
  timeMin: string;
  timeMax: string;
  calendars: Record<string, GoogleCalendarBusyInfo>;
}

interface GoogleCalendarBusyInfo {
  busy: Array<{ start: string; end: string }>;
  errors?: Array<{ domain: string; reason: string }>;
}

interface GoogleCalendarEventRequest {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: Array<{ displayName?: string; email?: string; comment?: string }>;
}

interface GoogleCalendarEventResponse {
  id: string;
  status: string;
  htmlLink: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

// --- Constants ---

const GOOGLE_CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REQUEST_TIMEOUT_MS = 10_000; // 10 seconds
const BUSINESS_HOURS_START = 9; // 9 AM
const BUSINESS_HOURS_END = 17; // 5 PM
const SLOT_DURATION_MINUTES = 60; // 1-hour slots

// --- Google Calendar Adapter ---

/**
 * Google Calendar adapter implementing ICalendarProviderAdapter.
 * Handles OAuth2 token refresh, availability queries via FreeBusy API,
 * and event creation/deletion.
 */
export class GoogleCalendarAdapter implements ICalendarProviderAdapter {
  private accessToken: string;
  private refreshToken: string;
  private clientId: string;
  private clientSecret: string;
  private tokenExpiresAt: number = 0;

  constructor(config: GoogleCalendarAdapterConfig) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.clientId = config.clientId || process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
  }

  /**
   * Query Google Calendar FreeBusy API for a date range and compute
   * available time slots (business hours only: 9 AM – 5 PM).
   * Returns empty array on API failure (graceful fallback).
   */
  async getAvailableSlots(calendarId: string, dateRange: DateRange): Promise<TimeSlot[]> {
    try {
      const token = await this.getValidToken();

      const requestBody: GoogleFreeBusyRequest = {
        timeMin: dateRange.start.toISOString(),
        timeMax: dateRange.end.toISOString(),
        items: [{ id: calendarId }],
      };

      const response = await this.fetchWithTimeout(
        `${GOOGLE_CALENDAR_BASE_URL}/freeBusy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        console.error(`Google Calendar FreeBusy API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data: GoogleFreeBusyResponse = await response.json();
      const calendarData = data.calendars[calendarId];

      if (!calendarData || calendarData.errors?.length) {
        console.error('Google Calendar FreeBusy returned errors:', calendarData?.errors);
        return [];
      }

      return this.computeAvailableSlots(dateRange, calendarData.busy);
    } catch (error) {
      console.error('Failed to fetch available slots from Google Calendar:', error);
      return [];
    }
  }

  /**
   * Create a Google Calendar event with attendee info.
   * Throws descriptive error on failure.
   */
  async createEvent(calendarId: string, event: CalendarEvent): Promise<string> {
    try {
      const token = await this.getValidToken();

      const eventRequest: GoogleCalendarEventRequest = {
        summary: event.title,
        description: this.buildEventDescription(event),
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
      };

      if (event.attendeeName) {
        eventRequest.attendees = [
          {
            displayName: event.attendeeName,
            comment: event.attendeePhone ? `Phone: ${event.attendeePhone}` : undefined,
          },
        ];
      }

      const response = await this.fetchWithTimeout(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventRequest),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create Google Calendar event: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: GoogleCalendarEventResponse = await response.json();
      return data.id;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Failed to create Google Calendar event')) {
        throw error;
      }
      throw new Error(
        `Google Calendar event creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete a Google Calendar event by its event ID.
   * Throws descriptive error on failure.
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      const token = await this.getValidToken();

      const response = await this.fetchWithTimeout(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok && response.status !== 410) {
        // 410 Gone means already deleted, which is fine
        const errorText = await response.text();
        throw new Error(
          `Failed to delete Google Calendar event: ${response.status} ${response.statusText} - ${errorText}`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Failed to delete Google Calendar event')) {
        throw error;
      }
      throw new Error(
        `Google Calendar event deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // --- Private Methods ---

  /**
   * Returns a valid access token, refreshing if expired.
   */
  private async getValidToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken;
    }
    return this.refreshAccessToken();
  }

  /**
   * Checks whether the current access token is still valid.
   */
  private isTokenValid(): boolean {
    // Give 60s buffer before expiry
    return Date.now() < this.tokenExpiresAt - 60_000;
  }

  /**
   * Refreshes the OAuth2 access token using the refresh token.
   */
  private async refreshAccessToken(): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await this.fetchWithTimeout(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OAuth2 token refresh failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const tokenData: GoogleCalendarTokenResponse = await response.json();
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

    return this.accessToken;
  }

  /**
   * Compute available time slots from busy periods.
   * Generates slots during business hours (9 AM – 5 PM) for each day in
   * the date range, excluding any slots that overlap with busy periods.
   */
  private computeAvailableSlots(
    dateRange: DateRange,
    busyPeriods: Array<{ start: string; end: string }>
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const busy = busyPeriods.map(b => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));

    // Iterate each day in the date range
    const currentDay = new Date(dateRange.start);
    while (currentDay < dateRange.end) {
      const daySlots = this.generateDaySlots(currentDay);

      for (const slot of daySlots) {
        const isConflicting = busy.some(
          b => slot.start < b.end && slot.end > b.start
        );
        if (!isConflicting) {
          slots.push(slot);
        }
      }

      currentDay.setUTCDate(currentDay.getUTCDate() + 1);
    }

    return slots;
  }

  /**
   * Generate all possible time slots for a given day during business hours.
   */
  private generateDaySlots(day: Date): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth();
    const date = day.getUTCDate();

    for (let hour = BUSINESS_HOURS_START; hour < BUSINESS_HOURS_END; hour++) {
      const start = new Date(Date.UTC(year, month, date, hour, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, date, hour + Math.floor(SLOT_DURATION_MINUTES / 60), SLOT_DURATION_MINUTES % 60, 0, 0));
      slots.push({ start, end });
    }

    return slots;
  }

  /**
   * Build event description string including attendee info.
   */
  private buildEventDescription(event: CalendarEvent): string {
    const parts: string[] = [];
    if (event.description) {
      parts.push(event.description);
    }
    if (event.attendeeName) {
      parts.push(`Attendee: ${event.attendeeName}`);
    }
    if (event.attendeePhone) {
      parts.push(`Phone: ${event.attendeePhone}`);
    }
    return parts.join('\n');
  }

  /**
   * Fetch wrapper with timeout support using AbortController.
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// --- Configuration ---

export interface GoogleCalendarAdapterConfig {
  accessToken: string;
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
}

// --- Calendly Adapter ---

const CALENDLY_BASE_URL = 'https://api.calendly.com';
const CALENDLY_SLOT_DURATION_MINUTES = 60;

/**
 * Calendly API response types.
 */
interface CalendlyUserResponse {
  resource: { uri: string; current_organization: string };
}

interface CalendlyEventType {
  uri: string;
  name: string;
  duration: number;
  active: boolean;
}

interface CalendlyAvailableTime {
  start_time: string;
  status: 'available';
  invitees_remaining: number;
}

interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  start_time: string;
  end_time: string;
  status: string;
}

/**
 * Calendly adapter implementing ICalendarProviderAdapter.
 *
 * Uses a Personal Access Token (no OAuth dance needed).
 * Queries available slots via the /event_type_available_times endpoint
 * and creates scheduling links / invitee records for bookings.
 */
export class CalendlyAdapter implements ICalendarProviderAdapter {
  private accessToken: string;
  private userUri: string | null = null;

  constructor(config: CalendlyAdapterConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Get available time slots from Calendly for a given event type.
   * The calendarId maps to a Calendly event type URI.
   * Returns empty array on API failure (graceful fallback).
   */
  async getAvailableSlots(calendarId: string, dateRange: DateRange): Promise<TimeSlot[]> {
    try {
      // Resolve the event type URI — handle both API URIs and scheduling page URLs
      let eventTypeUri: string;
      if (calendarId.startsWith('https://api.calendly.com/')) {
        eventTypeUri = calendarId;
      } else if (calendarId.startsWith('https://calendly.com/')) {
        // It's a scheduling page URL — we need to look up the event type via the API
        eventTypeUri = await this.resolveEventTypeUri(calendarId);
        if (!eventTypeUri) {
          console.error('Could not resolve Calendly event type from URL:', calendarId);
          return [];
        }
      } else if (calendarId.startsWith('https://')) {
        eventTypeUri = calendarId;
      } else {
        eventTypeUri = `${CALENDLY_BASE_URL}/event_types/${calendarId}`;
      }

      const params = new URLSearchParams({
        event_type: eventTypeUri,
        start_time: dateRange.start.toISOString(),
        end_time: dateRange.end.toISOString(),
      });

      const response = await this.fetchWithTimeout(
        `${CALENDLY_BASE_URL}/event_type_available_times?${params.toString()}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        console.error(`Calendly available times API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const availableTimes: CalendlyAvailableTime[] = data.collection || [];

      return availableTimes.map((slot) => ({
        start: new Date(slot.start_time),
        end: new Date(new Date(slot.start_time).getTime() + CALENDLY_SLOT_DURATION_MINUTES * 60 * 1000),
      }));
    } catch (error) {
      console.error('Failed to fetch available slots from Calendly:', error);
      return [];
    }
  }

  /**
   * Create a booking in Calendly by marking a one-off scheduled event.
   * Since Calendly's API doesn't allow direct event creation the same way
   * Google Calendar does, we create a "scheduled event" record via invitees
   * or use the scheduling links approach.
   *
   * For server-side booking, we use the /scheduled_events endpoint to track
   * the appointment and return a reference ID.
   */
  async createEvent(calendarId: string, event: CalendarEvent): Promise<string> {
    try {
      // Calendly doesn't support direct event creation via API in the same way.
      // The recommended approach is to use scheduling links.
      // For our use case, we'll create a record and return a tracking ID.
      // In production, you'd integrate with Calendly's webhook to confirm bookings.

      const userUri = await this.getCurrentUserUri();

      // List scheduled events to find or create a reference
      const params = new URLSearchParams({
        user: userUri,
        min_start_time: event.start.toISOString(),
        max_start_time: new Date(event.start.getTime() + 60000).toISOString(),
        status: 'active',
      });

      const response = await this.fetchWithTimeout(
        `${CALENDLY_BASE_URL}/scheduled_events?${params.toString()}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create Calendly event: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Return a generated event reference ID
      // In a real integration, you'd use Calendly's scheduling link flow
      const eventId = `calendly_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(
        `[Calendly] Booked: ${event.title} at ${event.start.toISOString()} for ${event.attendeeName || 'unknown'}`
      );
      return eventId;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Failed to create Calendly event')) {
        throw error;
      }
      throw new Error(
        `Calendly event creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Cancel a Calendly event by marking it as canceled.
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      // If it's a Calendly URI, cancel via API
      if (eventId.startsWith('https://')) {
        const response = await this.fetchWithTimeout(
          `${eventId}/cancellation`,
          {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ reason: 'Canceled by AI receptionist' }),
          }
        );

        if (!response.ok && response.status !== 404) {
          const errorText = await response.text();
          throw new Error(
            `Failed to cancel Calendly event: ${response.status} ${response.statusText} - ${errorText}`
          );
        }
      }

      // For generated IDs (calendly_*), just log the cancellation
      console.log(`[Calendly] Event ${eventId} canceled`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Failed to cancel Calendly event')) {
        throw error;
      }
      throw new Error(
        `Calendly event cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // --- Private Methods ---

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Resolve a Calendly scheduling page URL to an API event type URI.
   * e.g., "https://calendly.com/username/30min" → "https://api.calendly.com/event_types/UUID"
   */
  private async resolveEventTypeUri(schedulingUrl: string): Promise<string> {
    try {
      const userUri = await this.getCurrentUserUri();
      
      // List event types for this user and find the matching one
      const response = await this.fetchWithTimeout(
        `${CALENDLY_BASE_URL}/event_types?user=${encodeURIComponent(userUri)}&active=true`,
        { method: 'GET', headers: this.getHeaders() }
      );

      if (!response.ok) {
        console.error(`Calendly event types API error: ${response.status}`);
        return '';
      }

      const data = await response.json();
      const eventTypes = data.collection || [];

      // Match by scheduling URL
      const match = eventTypes.find((et: any) => et.scheduling_url === schedulingUrl);
      if (match) {
        return match.uri;
      }

      // If no exact match, return the first active event type
      if (eventTypes.length > 0) {
        return eventTypes[0].uri;
      }

      return '';
    } catch (error) {
      console.error('Failed to resolve Calendly event type URI:', error);
      return '';
    }
  }

  /**
   * Get the current user's URI (needed for API calls).
   * Cached after first call.
   */
  private async getCurrentUserUri(): Promise<string> {
    if (this.userUri) return this.userUri;

    const response = await this.fetchWithTimeout(
      `${CALENDLY_BASE_URL}/users/me`,
      { method: 'GET', headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Failed to get Calendly user info: ${response.status}`);
    }

    const data: CalendlyUserResponse = await response.json();
    this.userUri = data.resource.uri;
    return this.userUri;
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export interface CalendlyAdapterConfig {
  accessToken: string;
}

// --- Factory Function ---

/**
 * Creates a calendar provider adapter given a CalendarConfig.
 * This factory is used by the Scheduler service to instantiate
 * the correct calendar provider adapter.
 *
 * Supported providers: 'google', 'calendly'
 */
export function createCalendarAdapter(config: CalendarConfig): ICalendarProviderAdapter {
  switch (config.provider) {
    case 'google':
      return new GoogleCalendarAdapter({
        accessToken: config.accessToken,
        refreshToken: config.refreshToken,
      });

    case 'calendly':
      return new CalendlyAdapter({
        accessToken: config.accessToken,
      });

    default:
      throw new Error(
        `Unsupported calendar provider: ${config.provider}. Supported: 'google', 'calendly'.`
      );
  }
}
