import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SMSService, ITwilioAdapter, CallOutcome } from './smsService';
import type { Appointment } from '../../shared/types/appointment';
import type { SMSTemplate } from '../../shared/types/sms';

// --- Test Helpers ---

function createMockTwilioAdapter(overrides?: Partial<ITwilioAdapter>): ITwilioAdapter {
  return {
    sendSMS: vi.fn().mockResolvedValue({ messageSid: 'SM_test_123' }),
    getMessageStatus: vi.fn().mockResolvedValue({ status: 'delivered', dateDelivered: '2024-01-01T12:00:00Z' }),
    ...overrides,
  };
}

function createTestAppointment(overrides?: Partial<Appointment>): Appointment {
  return {
    id: 'apt-001',
    businessId: 'biz-001',
    callId: 'call-001',
    callerName: 'Jane Doe',
    callerPhone: '+14155551234',
    serviceType: 'Haircut',
    scheduledAt: new Date('2024-06-15T10:00:00Z'),
    calendarEventId: 'cal-001',
    smsConfirmationSent: false,
    remindersSent: [],
    createdAt: new Date('2024-06-10T08:00:00Z'),
    ...overrides,
  };
}

function createTestCallOutcome(overrides?: Partial<CallOutcome>): CallOutcome {
  return {
    callId: 'call-001',
    businessId: 'biz-001',
    outcome: 'missed_call',
    callerPhone: '+14155551234',
    callerName: 'John Smith',
    timestamp: new Date('2024-06-10T09:00:00Z'),
    ...overrides,
  };
}

function createTestTemplate(overrides?: Partial<SMSTemplate>): SMSTemplate {
  return {
    id: 'tpl-001',
    businessId: 'biz-001',
    name: 'Missed Call Follow-up',
    body: 'Hi {{caller_name}}, we missed your call. Please call us back!',
    triggerEvent: 'missed_call',
    isActive: true,
    ...overrides,
  };
}

// --- Tests ---

describe('SMSService', () => {
  let smsService: SMSService;
  let mockAdapter: ITwilioAdapter;

  beforeEach(() => {
    mockAdapter = createMockTwilioAdapter();
    smsService = new SMSService(mockAdapter);
  });

  describe('sendConfirmation', () => {
    it('sends confirmation SMS for a valid appointment', async () => {
      const appointment = createTestAppointment();
      const result = await smsService.sendConfirmation(appointment, '+14155551234');

      expect(result.success).toBe(true);
      expect(result.status).toBe('sent');
      expect(result.messageId).not.toBeNull();
      expect(mockAdapter.sendSMS).toHaveBeenCalledWith(
        '+14155551234',
        expect.stringContaining('Haircut')
      );
    });

    it('includes appointment date in confirmation body', async () => {
      const appointment = createTestAppointment();
      await smsService.sendConfirmation(appointment, '+14155551234');

      expect(mockAdapter.sendSMS).toHaveBeenCalledWith(
        '+14155551234',
        expect.stringContaining('confirmed')
      );
    });

    it('skips SMS for invalid phone number and logs event', async () => {
      const appointment = createTestAppointment();
      const result = await smsService.sendConfirmation(appointment, 'not-a-phone');

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('SMS skipped — invalid number');
      expect(result.messageId).toBeNull();
      expect(mockAdapter.sendSMS).not.toHaveBeenCalled();

      const logs = smsService.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].event).toBe('sms_skipped');
      expect(logs[0].details).toContain('invalid number');
    });

    it('skips SMS for empty phone number', async () => {
      const appointment = createTestAppointment();
      const result = await smsService.sendConfirmation(appointment, '');

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
    });

    it('returns failed status when Twilio adapter throws', async () => {
      mockAdapter = createMockTwilioAdapter({
        sendSMS: vi.fn().mockRejectedValue(new Error('Twilio API error')),
      });
      smsService = new SMSService(mockAdapter);

      const appointment = createTestAppointment();
      const result = await smsService.sendConfirmation(appointment, '+14155551234');

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Twilio API error');
      expect(result.messageId).not.toBeNull();
    });
  });

  describe('sendReminder', () => {
    it('sends reminder with correct interval label', async () => {
      const appointment = createTestAppointment();
      const result = await smsService.sendReminder(appointment, '1hour');

      expect(result.success).toBe(true);
      expect(result.status).toBe('sent');
      expect(mockAdapter.sendSMS).toHaveBeenCalledWith(
        '+14155551234',
        expect.stringContaining('1 hour')
      );
    });

    it('sends reminder for 15min interval', async () => {
      const appointment = createTestAppointment();
      await smsService.sendReminder(appointment, '15min');

      expect(mockAdapter.sendSMS).toHaveBeenCalledWith(
        '+14155551234',
        expect.stringContaining('15 minutes')
      );
    });

    it('sends reminder for 48hours interval', async () => {
      const appointment = createTestAppointment();
      await smsService.sendReminder(appointment, '48hours');

      expect(mockAdapter.sendSMS).toHaveBeenCalledWith(
        '+14155551234',
        expect.stringContaining('48 hours')
      );
    });

    it('uses appointment callerPhone for delivery', async () => {
      const appointment = createTestAppointment({ callerPhone: '+19175559999' });
      await smsService.sendReminder(appointment, '24hours');

      expect(mockAdapter.sendSMS).toHaveBeenCalledWith(
        '+19175559999',
        expect.any(String)
      );
    });

    it('skips reminder for invalid caller phone', async () => {
      const appointment = createTestAppointment({ callerPhone: '555-1234' });
      const result = await smsService.sendReminder(appointment, '1hour');

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
    });
  });

  describe('sendFollowUp', () => {
    it('sends follow-up with rendered template', async () => {
      const outcome = createTestCallOutcome();
      const template = createTestTemplate();
      const result = await smsService.sendFollowUp(outcome, template, '+14155551234');

      expect(result.success).toBe(true);
      expect(result.status).toBe('sent');
      expect(mockAdapter.sendSMS).toHaveBeenCalledWith(
        '+14155551234',
        expect.stringContaining('John Smith')
      );
    });

    it('replaces {{caller_name}} placeholder in template', async () => {
      const outcome = createTestCallOutcome({ callerName: 'Alice' });
      const template = createTestTemplate({ body: 'Hello {{caller_name}}!' });
      await smsService.sendFollowUp(outcome, template, '+14155551234');

      expect(mockAdapter.sendSMS).toHaveBeenCalledWith('+14155551234', 'Hello Alice!');
    });

    it('uses "Valued Customer" when caller name is missing', async () => {
      const outcome = createTestCallOutcome({ callerName: undefined });
      const template = createTestTemplate({ body: 'Hi {{caller_name}}, thanks!' });
      await smsService.sendFollowUp(outcome, template, '+14155551234');

      expect(mockAdapter.sendSMS).toHaveBeenCalledWith('+14155551234', 'Hi Valued Customer, thanks!');
    });

    it('skips follow-up for invalid phone number', async () => {
      const outcome = createTestCallOutcome();
      const template = createTestTemplate();
      const result = await smsService.sendFollowUp(outcome, template, 'invalid');

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('SMS skipped — invalid number');
    });
  });

  describe('getDeliveryStatus', () => {
    it('returns delivery status for a sent message', async () => {
      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');
      const status = await smsService.getDeliveryStatus(sendResult.messageId!);

      expect(status.messageId).toBe(sendResult.messageId);
      expect(status.status).toBe('delivered'); // Mock adapter returns delivered
      expect(status.retryCount).toBe(0);
    });

    it('returns failed status for unknown message id', async () => {
      const status = await smsService.getDeliveryStatus('unknown-id');

      expect(status.status).toBe('failed');
      expect(status.retryCount).toBe(0);
      expect(status.lastAttemptAt).toBeNull();
      expect(status.deliveredAt).toBeNull();
    });

    it('updates status from Twilio when message is sent', async () => {
      mockAdapter = createMockTwilioAdapter({
        getMessageStatus: vi.fn().mockResolvedValue({ status: 'delivered', dateDelivered: '2024-06-15T12:00:00Z' }),
      });
      smsService = new SMSService(mockAdapter);

      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');
      const status = await smsService.getDeliveryStatus(sendResult.messageId!);

      expect(status.status).toBe('delivered');
      expect(status.deliveredAt).not.toBeNull();
    });

    it('handles Twilio status check failure gracefully', async () => {
      mockAdapter = createMockTwilioAdapter({
        getMessageStatus: vi.fn().mockRejectedValue(new Error('Network error')),
      });
      smsService = new SMSService(mockAdapter);

      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');
      const status = await smsService.getDeliveryStatus(sendResult.messageId!);

      // Should return last known status without throwing
      expect(status.status).toBe('sent');
    });
  });

  describe('retryFailed', () => {
    it('retries a failed message successfully', async () => {
      // First call fails, second succeeds
      const failingAdapter = createMockTwilioAdapter({
        sendSMS: vi.fn()
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce({ messageSid: 'SM_retry_456' }),
      });
      smsService = new SMSService(failingAdapter);

      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');

      expect(sendResult.success).toBe(false);
      expect(sendResult.messageId).not.toBeNull();

      const retryResult = await smsService.retryFailed(sendResult.messageId!);
      expect(retryResult.success).toBe(true);
      expect(retryResult.status).toBe('sent');
    });

    it('marks permanently_failed after 3 retries exhausted', async () => {
      const alwaysFailAdapter = createMockTwilioAdapter({
        sendSMS: vi.fn().mockRejectedValue(new Error('Persistent failure')),
      });
      smsService = new SMSService(alwaysFailAdapter);

      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');

      // Retry 3 times (max allowed)
      const retry1 = await smsService.retryFailed(sendResult.messageId!);
      expect(retry1.success).toBe(false);
      expect(retry1.status).toBe('failed');

      const retry2 = await smsService.retryFailed(sendResult.messageId!);
      expect(retry2.success).toBe(false);
      expect(retry2.status).toBe('failed');

      const retry3 = await smsService.retryFailed(sendResult.messageId!);
      expect(retry3.success).toBe(false);
      expect(retry3.status).toBe('permanently_failed');
    });

    it('does not retry beyond permanently_failed state', async () => {
      const alwaysFailAdapter = createMockTwilioAdapter({
        sendSMS: vi.fn().mockRejectedValue(new Error('Failure')),
      });
      smsService = new SMSService(alwaysFailAdapter);

      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');

      // Exhaust retries
      await smsService.retryFailed(sendResult.messageId!);
      await smsService.retryFailed(sendResult.messageId!);
      await smsService.retryFailed(sendResult.messageId!);

      // 4th attempt should be rejected
      const retry4 = await smsService.retryFailed(sendResult.messageId!);
      expect(retry4.success).toBe(false);
      expect(retry4.status).toBe('permanently_failed');
      expect(retry4.error).toContain('permanently failed');
    });

    it('returns error for unknown message id', async () => {
      const result = await smsService.retryFailed('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Message not found');
    });

    it('returns success for already delivered message', async () => {
      // Send successfully, then mark as delivered via status check
      mockAdapter = createMockTwilioAdapter({
        getMessageStatus: vi.fn().mockResolvedValue({ status: 'delivered', dateDelivered: '2024-06-15T12:00:00Z' }),
      });
      smsService = new SMSService(mockAdapter);

      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');

      // Trigger status update
      await smsService.getDeliveryStatus(sendResult.messageId!);

      // Now retry should report already delivered
      const retryResult = await smsService.retryFailed(sendResult.messageId!);
      expect(retryResult.success).toBe(true);
      expect(retryResult.status).toBe('delivered');
    });

    it('increments retry count on each attempt', async () => {
      const failingAdapter = createMockTwilioAdapter({
        sendSMS: vi.fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockRejectedValueOnce(new Error('Fail 2'))
          .mockResolvedValueOnce({ messageSid: 'SM_success' }),
      });
      smsService = new SMSService(failingAdapter);

      const appointment = createTestAppointment();
      const sendResult = await smsService.sendConfirmation(appointment, '+14155551234');

      await smsService.retryFailed(sendResult.messageId!);
      const status1 = await smsService.getDeliveryStatus(sendResult.messageId!);
      expect(status1.retryCount).toBe(1);

      await smsService.retryFailed(sendResult.messageId!);
      const status2 = await smsService.getDeliveryStatus(sendResult.messageId!);
      expect(status2.retryCount).toBe(2);
    });
  });

  describe('message body constraints', () => {
    it('truncates message body to 160 characters', async () => {
      const longService = 'A'.repeat(200);
      const appointment = createTestAppointment({ serviceType: longService });
      await smsService.sendConfirmation(appointment, '+14155551234');

      const [, body] = (mockAdapter.sendSMS as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(body.length).toBeLessThanOrEqual(160);
    });
  });

  describe('logging', () => {
    it('logs successful send events', async () => {
      const appointment = createTestAppointment();
      await smsService.sendConfirmation(appointment, '+14155551234');

      const logs = smsService.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].event).toBe('sent');
    });

    it('logs failed send events', async () => {
      mockAdapter = createMockTwilioAdapter({
        sendSMS: vi.fn().mockRejectedValue(new Error('API down')),
      });
      smsService = new SMSService(mockAdapter);

      const appointment = createTestAppointment();
      await smsService.sendConfirmation(appointment, '+14155551234');

      const logs = smsService.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].event).toBe('send_failed');
    });

    it('logs skip events for invalid numbers', async () => {
      const appointment = createTestAppointment();
      await smsService.sendConfirmation(appointment, 'bad-phone');

      const logs = smsService.getLogs();
      expect(logs[0].event).toBe('sms_skipped');
      expect(logs[0].details).toContain('invalid number');
    });
  });
});
