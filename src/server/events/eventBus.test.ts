/**
 * Unit tests for Event Bus handlers.
 *
 * Tests validate:
 * - CALL_ENDED handler generates summary, captures lead, queues SMS
 * - APPOINTMENT_BOOKED handler sends SMS confirmation
 * - LEAD_CAPTURED handler qualifies lead and syncs to CRM
 * - Errors in handlers are caught and do not propagate
 * - Short calls (<5s) are skipped
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCallEnded,
  handleAppointmentBooked,
  handleLeadCaptured,
  initEventBus,
  type CallEndedPayload,
  type AppointmentBookedPayload,
  type LeadCapturedPayload,
} from './eventBus';

// Mock the Redis module
vi.mock('../db/redis', () => ({
  subscribe: vi.fn(),
  publish: vi.fn().mockResolvedValue(undefined),
  CHANNELS: {
    CALL_STARTED: 'events:call:started',
    CALL_ENDED: 'events:call:ended',
    LEAD_CAPTURED: 'events:lead:captured',
    SMS_QUEUED: 'events:sms:queued',
    SMS_FAILED: 'events:sms:failed',
    APPOINTMENT_BOOKED: 'events:appointment:booked',
    CRM_SYNC_REQUIRED: 'events:crm:sync',
    CONFIG_UPDATED: 'events:config:updated',
  },
}));

// Mock summaryService
vi.mock('../services/summaryService', () => ({
  generateTranscript: vi.fn().mockReturnValue({
    text: 'AI: Hello, how can I help?\nCaller: I need an appointment.',
    durationSeconds: 120,
    segments: [
      { speaker: 'AI', text: 'Hello, how can I help?', timestamp: 0 },
      { speaker: 'Caller', text: 'I need an appointment.', timestamp: 2 },
    ],
  }),
  generateSummary: vi.fn().mockReturnValue({
    summary: 'Caller requested an appointment for dental cleaning next week.',
    outcome: 'appointment_booked',
  }),
  DEFAULT_OUTCOME_CATEGORIES: [
    'appointment_booked',
    'information_provided',
    'transferred',
    'message_taken',
    'lead_captured',
  ],
}));

// Mock leadCapture
vi.mock('../services/leadCapture', () => ({
  captureLead: vi.fn().mockResolvedValue({
    id: 'lead_123',
    businessId: 'biz_1',
    callId: 'call_1',
    name: 'John Doe',
    phone: '+14155551234',
    email: null,
    reason: 'Caller requested an appointment for dental cleaning next week.',
    qualificationStatus: 'needs_review',
    crmSyncStatus: 'pending',
    crmRecordId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  qualifyLead: vi.fn().mockReturnValue('qualified'),
  syncToCRM: vi.fn().mockResolvedValue({
    success: true,
    crmRecordId: 'hs_lead_123',
  }),
}));

describe('Event Bus Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCallEnded', () => {
    const basePayload: CallEndedPayload = {
      callId: 'call_1',
      businessId: 'biz_1',
      duration: 120,
      transcript: [
        { role: 'assistant', text: 'Hello, how can I help?', timestamp: 0 },
        { role: 'user', text: 'I need an appointment.', timestamp: 2 },
      ],
      endReason: 'hangup',
      timestamp: new Date().toISOString(),
      callerPhone: '+14155551234',
      callerName: 'John Doe',
    };

    it('should generate transcript and summary for calls >= 5s', async () => {
      const { generateTranscript, generateSummary } = await import('../services/summaryService');

      await handleCallEnded(basePayload);

      expect(generateTranscript).toHaveBeenCalledWith({
        segments: basePayload.transcript,
        durationSeconds: 120,
      });
      expect(generateSummary).toHaveBeenCalled();
    });

    it('should skip processing for short calls (< 5s)', async () => {
      const { generateTranscript } = await import('../services/summaryService');

      await handleCallEnded({ ...basePayload, duration: 3 });

      expect(generateTranscript).not.toHaveBeenCalled();
    });

    it('should capture lead when caller info is available', async () => {
      const { captureLead } = await import('../services/leadCapture');
      const { publish } = await import('../db/redis');

      await handleCallEnded(basePayload);

      expect(captureLead).toHaveBeenCalledWith('biz_1', {
        callId: 'call_1',
        name: 'John Doe',
        phone: '+14155551234',
        reason: expect.any(String),
      });
      expect(publish).toHaveBeenCalledWith(
        'events:lead:captured',
        expect.objectContaining({ callId: 'call_1', businessId: 'biz_1' })
      );
    });

    it('should not capture lead when caller info is missing', async () => {
      const { captureLead } = await import('../services/leadCapture');

      await handleCallEnded({ ...basePayload, callerPhone: undefined, callerName: undefined });

      expect(captureLead).not.toHaveBeenCalled();
    });

    it('should not throw on internal errors', async () => {
      const { generateTranscript } = await import('../services/summaryService');
      (generateTranscript as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Transcript generation failed');
      });

      // Should not throw
      await expect(handleCallEnded(basePayload)).resolves.toBeUndefined();
    });
  });

  describe('handleAppointmentBooked', () => {
    const mockSMSService = {
      sendConfirmation: vi.fn().mockResolvedValue({ success: true, messageId: 'msg_1', status: 'sent' }),
      sendReminder: vi.fn(),
      sendFollowUp: vi.fn(),
      getDeliveryStatus: vi.fn(),
      retryFailed: vi.fn(),
    };

    it('should send SMS confirmation when smsService is available', async () => {
      // Initialize with mock SMS service
      initEventBus({ smsService: mockSMSService as any });

      const payload: AppointmentBookedPayload = {
        callId: 'call_1',
        businessId: 'biz_1',
        appointment: {
          id: 'appt_1',
          callerPhone: '+14155551234',
          callerName: 'Jane Doe',
          serviceType: 'Dental Cleaning',
          scheduledAt: new Date().toISOString(),
        },
      };

      await handleAppointmentBooked(payload);

      expect(mockSMSService.sendConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'appt_1',
          callerPhone: '+14155551234',
          serviceType: 'Dental Cleaning',
        }),
        '+14155551234'
      );
    });

    it('should skip SMS when caller phone is missing', async () => {
      initEventBus({ smsService: mockSMSService as any });

      const payload: AppointmentBookedPayload = {
        callId: 'call_1',
        businessId: 'biz_1',
        appointment: {
          id: 'appt_1',
          callerPhone: '',
          callerName: 'Jane Doe',
          serviceType: 'Dental Cleaning',
          scheduledAt: new Date().toISOString(),
        },
      };

      await handleAppointmentBooked(payload);

      expect(mockSMSService.sendConfirmation).not.toHaveBeenCalled();
    });

    it('should not throw on SMS service errors', async () => {
      mockSMSService.sendConfirmation.mockRejectedValueOnce(new Error('Twilio timeout'));
      initEventBus({ smsService: mockSMSService as any });

      const payload: AppointmentBookedPayload = {
        callId: 'call_1',
        businessId: 'biz_1',
        appointment: {
          id: 'appt_1',
          callerPhone: '+14155551234',
          callerName: 'Jane Doe',
          serviceType: 'Dental Cleaning',
          scheduledAt: new Date().toISOString(),
        },
      };

      await expect(handleAppointmentBooked(payload)).resolves.toBeUndefined();
    });
  });

  describe('handleLeadCaptured', () => {
    it('should qualify lead and sync to CRM', async () => {
      const { qualifyLead, syncToCRM } = await import('../services/leadCapture');

      const crmConfig = {
        provider: 'hubspot' as const,
        accessToken: 'token_123',
        refreshToken: 'refresh_123',
        fieldMapping: { name: 'firstname', phone: 'phone' },
        isActive: true,
      };

      const payload: LeadCapturedPayload = {
        callId: 'call_1',
        businessId: 'biz_1',
        lead: {
          id: 'lead_1',
          businessId: 'biz_1',
          callId: 'call_1',
          name: 'John Doe',
          phone: '+14155551234',
          email: null,
          reason: 'Needs dental cleaning',
          qualificationStatus: 'needs_review',
          crmSyncStatus: 'pending',
          crmRecordId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        qualificationCriteria: [
          {
            id: 'crit_1',
            businessId: 'biz_1',
            category: 'service_type',
            values: ['dental', 'cleaning'],
            weight: 1.0,
          },
        ],
        crmConfig,
      };

      await handleLeadCaptured(payload);

      expect(qualifyLead).toHaveBeenCalledWith(
        payload.lead,
        payload.qualificationCriteria
      );
      expect(syncToCRM).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'lead_1', qualificationStatus: 'qualified' }),
        crmConfig
      );
    });

    it('should use dependency providers when payload lacks config', async () => {
      const mockGetCriteria = vi.fn().mockResolvedValue([
        { id: 'c1', businessId: 'biz_1', category: 'budget', values: ['high'], weight: 1 },
      ]);
      const mockGetCRM = vi.fn().mockResolvedValue({
        provider: 'salesforce',
        accessToken: 'sf_token',
        refreshToken: 'sf_refresh',
        fieldMapping: {},
        isActive: true,
      });

      initEventBus({
        getQualificationCriteria: mockGetCriteria,
        getCRMConfig: mockGetCRM,
      });

      const payload: LeadCapturedPayload = {
        callId: 'call_2',
        businessId: 'biz_1',
        lead: {
          id: 'lead_2',
          businessId: 'biz_1',
          callId: 'call_2',
          name: 'Alice',
          phone: '+14155559999',
          email: null,
          reason: 'Budget inquiry',
          qualificationStatus: 'needs_review',
          crmSyncStatus: 'pending',
          crmRecordId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      await handleLeadCaptured(payload);

      expect(mockGetCriteria).toHaveBeenCalledWith('biz_1');
      expect(mockGetCRM).toHaveBeenCalledWith('biz_1');
    });

    it('should not throw on CRM sync failure', async () => {
      const { syncToCRM } = await import('../services/leadCapture');
      (syncToCRM as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const payload: LeadCapturedPayload = {
        callId: 'call_3',
        businessId: 'biz_1',
        lead: {
          id: 'lead_3',
          businessId: 'biz_1',
          callId: 'call_3',
          name: 'Bob',
          phone: '+14155550000',
          email: null,
          reason: 'Service inquiry',
          qualificationStatus: 'needs_review',
          crmSyncStatus: 'pending',
          crmRecordId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        crmConfig: {
          provider: 'hubspot',
          accessToken: 'tok',
          refreshToken: 'ref',
          fieldMapping: {},
          isActive: true,
        },
      };

      await expect(handleLeadCaptured(payload)).resolves.toBeUndefined();
    });
  });

  describe('initEventBus', () => {
    it('should subscribe to the correct channels', async () => {
      const { subscribe } = await import('../db/redis');

      initEventBus();

      expect(subscribe).toHaveBeenCalledWith('events:call:ended', expect.any(Function));
      expect(subscribe).toHaveBeenCalledWith('events:appointment:booked', expect.any(Function));
      expect(subscribe).toHaveBeenCalledWith('events:lead:captured', expect.any(Function));
    });
  });
});
