import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing the app
vi.mock('./db/redis', () => ({
  redisSubscriber: {
    subscribe: vi.fn(),
    on: vi.fn(),
  },
  redisPublisher: {
    publish: vi.fn(),
  },
  redisClient: {},
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
  publish: vi.fn(),
  subscribe: vi.fn(),
}));

import app, { initializeEventBus, publishEvent } from './index';
import { redisSubscriber, redisPublisher } from './db/redis';

/**
 * Minimal request helper for testing express app without supertest.
 * We test the middleware behavior directly since Express 5 doesn't require supertest.
 */
describe('Express Server Configuration', () => {
  describe('app instance', () => {
    it('exports an Express app', () => {
      expect(app).toBeDefined();
      expect(typeof app.use).toBe('function');
      expect(typeof app.get).toBe('function');
      expect(typeof app.post).toBe('function');
    });
  });

  describe('initializeEventBus', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('subscribes to all channels', () => {
      initializeEventBus();

      // Should subscribe to each channel
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:call:started');
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:call:ended');
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:lead:captured');
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:sms:queued');
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:sms:failed');
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:appointment:booked');
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:crm:sync');
      expect(redisSubscriber.subscribe).toHaveBeenCalledWith('events:config:updated');
    });

    it('registers a message listener', () => {
      initializeEventBus();

      expect(redisSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('publishEvent', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('publishes serialized data to the specified channel', async () => {
      const data = { callId: 'test-123', status: 'started' };
      await publishEvent('events:call:started', data);

      expect(redisPublisher.publish).toHaveBeenCalledWith(
        'events:call:started',
        JSON.stringify(data)
      );
    });
  });
});
