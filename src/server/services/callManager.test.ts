import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CallManager, CallManagerDependencies } from './callManager';
import {
  VapiCallStartEvent,
  VapiCallEndEvent,
  VapiToolCallEvent,
  Business,
  CallRecord,
  PaginatedResult,
} from '../../shared/types';

// Mock Redis module
vi.mock('../db/redis', () => {
  const store = new Map<string, string>();
  const hashStore = new Map<string, Map<string, string>>();
  const listStore = new Map<string, string[]>();

  return {
    redisClient: {
      get: vi.fn(async (key: string) => store.get(key) || null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      incr: vi.fn(async (key: string) => {
        const current = parseInt(store.get(key) || '0', 10);
        const next = current + 1;
        store.set(key, String(next));
        return next;
      }),
      decr: vi.fn(async (key: string) => {
        const current = parseInt(store.get(key) || '0', 10);
        const next = current - 1;
        store.set(key, String(next));
        return next;
      }),
      hset: vi.fn(async (key: string, field: string, value: string) => {
        if (!hashStore.has(key)) hashStore.set(key, new Map());
        hashStore.get(key)!.set(field, value);
      }),
      hdel: vi.fn(async (key: string, field: string) => {
        hashStore.get(key)?.delete(field);
      }),
      hgetall: vi.fn(async (key: string) => {
        const map = hashStore.get(key);
        if (!map) return {};
        return Object.fromEntries(map.entries());
      }),
      hget: vi.fn(async (key: string, field: string) => {
        return hashStore.get(key)?.get(field) || null;
      }),
      rpush: vi.fn(async (key: string, value: string) => {
        if (!listStore.has(key)) listStore.set(key, []);
        listStore.get(key)!.push(value);
      }),
      lpop: vi.fn(async (key: string) => {
        const list = listStore.get(key);
        if (!list || list.length === 0) return null;
        return list.shift()!;
      }),
    },
    redisSubscriber: {},
    redisPublisher: {},
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(),
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
    cacheSet: vi.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
    cacheGet: vi.fn(async (key: string) => {
      const raw = store.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    }),
    cacheDelete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    // Expose stores for test manipulation
    __store: store,
    __hashStore: hashStore,
    __listStore: listStore,
  };
});

function createMockBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'business-123',
    name: 'Test Business',
    greeting: 'Hello, welcome!',
    voiceProfileId: 'voice-1',
    enabledLanguages: ['en'],
    operatingHours: {
      timezone: 'America/New_York',
      schedule: {
        monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
        tuesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
        wednesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
        thursday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
        friday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
        saturday: { isOpen: false, openTime: '09:00', closeTime: '17:00' },
        sunday: { isOpen: false, openTime: '09:00', closeTime: '17:00' },
      },
    },
    maxConcurrentCalls: 50,
    callTimeoutSeconds: 300,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createMockDeps(
  overrides: Partial<CallManagerDependencies> = {}
): CallManagerDependencies {
  const mockBusiness = createMockBusiness();
  return {
    getBusinessByPhoneNumber: vi.fn(async () => mockBusiness),
    getBusinessById: vi.fn(async () => mockBusiness),
    storeCallRecord: vi.fn(async (record) => ({
      ...record,
      id: 'record-123',
    })) as unknown as CallManagerDependencies['storeCallRecord'],
    queryCallHistory: vi.fn(async () => ({
      items: [],
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      pageSize: 20,
    })),
    dispatchBooking: vi.fn(async () => ({ success: true })),
    dispatchRouting: vi.fn(async () => ({ transferred: true })),
    dispatchLeadCapture: vi.fn(async () => ({ leadId: 'lead-1' })),
    ...overrides,
  };
}

function createCallStartEvent(
  overrides: Partial<VapiCallStartEvent> = {}
): VapiCallStartEvent {
  return {
    callId: 'call-001',
    from: '+15551234567',
    to: '+15559876543',
    timestamp: new Date().toISOString(),
    assistantId: 'asst-001',
    ...overrides,
  };
}

function createCallEndEvent(
  overrides: Partial<VapiCallEndEvent> = {}
): VapiCallEndEvent {
  return {
    callId: 'call-001',
    duration: 120,
    transcript: [
      { role: 'assistant', text: 'Hello!', timestamp: 1000 },
      { role: 'user', text: 'Hi there', timestamp: 2000 },
    ],
    endReason: 'caller_hung_up',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('CallManager', () => {
  let callManager: CallManager;
  let deps: CallManagerDependencies;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear the mock Redis stores
    const redis = await import('../db/redis');
    const { __store, __hashStore, __listStore } = redis as unknown as {
      __store: Map<string, string>;
      __hashStore: Map<string, Map<string, string>>;
      __listStore: Map<string, string[]>;
    };
    __store.clear();
    __hashStore.clear();
    __listStore.clear();

    deps = createMockDeps();
    callManager = new CallManager(deps);
  });

  describe('handleCallStart', () => {
    it('creates a session with active status when below capacity', async () => {
      const event = createCallStartEvent();
      const session = await callManager.handleCallStart(event);

      expect(session.callId).toBe('call-001');
      expect(session.businessId).toBe('business-123');
      expect(session.callerNumber).toBe('+15551234567');
      expect(session.status).toBe('active');
      expect(session.businessConfig.name).toBe('Test Business');
    });

    it('throws error when no business found for phone number', async () => {
      deps = createMockDeps({
        getBusinessByPhoneNumber: vi.fn(async () => null),
      });
      callManager = new CallManager(deps);

      const event = createCallStartEvent();
      await expect(callManager.handleCallStart(event)).rejects.toThrow(
        'No business found for phone number'
      );
    });

    it('queues call when at max capacity', async () => {
      const business = createMockBusiness({ maxConcurrentCalls: 2 });
      deps = createMockDeps({
        getBusinessByPhoneNumber: vi.fn(async () => business),
      });
      callManager = new CallManager(deps);

      // Fill capacity
      await callManager.handleCallStart(
        createCallStartEvent({ callId: 'call-1' })
      );
      await callManager.handleCallStart(
        createCallStartEvent({ callId: 'call-2' })
      );

      // Third call should be queued
      const session = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'call-3' })
      );

      expect(session.status).toBe('queued');
    });

    it('publishes CALL_STARTED event', async () => {
      const { publish } = await import('../db/redis');
      const event = createCallStartEvent();
      await callManager.handleCallStart(event);

      expect(publish).toHaveBeenCalledWith(
        'events:call:started',
        expect.objectContaining({
          callId: 'call-001',
          businessId: 'business-123',
          status: 'active',
        })
      );
    });
  });

  describe('handleCallEnd', () => {
    it('stores call record and emits CALL_ENDED event', async () => {
      const { publish } = await import('../db/redis');

      // First start a call
      await callManager.handleCallStart(createCallStartEvent());

      // Then end it
      const endEvent = createCallEndEvent();
      await callManager.handleCallEnd(endEvent);

      expect(deps.storeCallRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 'business-123',
          callerNumber: '+15551234567',
          durationSeconds: 120,
          status: 'completed',
        })
      );

      expect(publish).toHaveBeenCalledWith(
        'events:call:ended',
        expect.objectContaining({
          callId: 'call-001',
          businessId: 'business-123',
          duration: 120,
        })
      );
    });

    it('throws error when no session found', async () => {
      const endEvent = createCallEndEvent({ callId: 'nonexistent' });
      await expect(callManager.handleCallEnd(endEvent)).rejects.toThrow(
        'No session found for call'
      );
    });

    it('promotes queued call when active call ends', async () => {
      const business = createMockBusiness({ maxConcurrentCalls: 1 });
      deps = createMockDeps({
        getBusinessByPhoneNumber: vi.fn(async () => business),
      });
      callManager = new CallManager(deps);

      // Start first call (active)
      await callManager.handleCallStart(
        createCallStartEvent({ callId: 'call-1' })
      );

      // Start second call (queued)
      const queuedSession = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'call-2', from: '+15550000001' })
      );
      expect(queuedSession.status).toBe('queued');

      // End first call — should promote call-2
      await callManager.handleCallEnd(
        createCallEndEvent({ callId: 'call-1' })
      );

      // Verify the queued call was promoted (session status updated in Redis)
      const { cacheGet } = await import('../db/redis');
      const promotedSession = await cacheGet('call:session:call-2');
      expect((promotedSession as { status: string })?.status).toBe('active');
    });
  });

  describe('handleToolCall', () => {
    it('dispatches booking tool calls', async () => {
      await callManager.handleCallStart(createCallStartEvent());

      const toolEvent: VapiToolCallEvent = {
        callId: 'call-001',
        toolName: 'check_availability',
        parameters: { date: '2024-03-15' },
        timestamp: new Date().toISOString(),
      };

      const result = await callManager.handleToolCall(toolEvent);
      expect(result.success).toBe(true);
      expect(result.toolName).toBe('check_availability');
      expect(deps.dispatchBooking).toHaveBeenCalledWith('call-001', {
        action: 'check_availability',
        date: '2024-03-15',
      });
    });

    it('dispatches book_appointment tool calls', async () => {
      const toolEvent: VapiToolCallEvent = {
        callId: 'call-001',
        toolName: 'book_appointment',
        parameters: { slot: '2024-03-15T10:00' },
        timestamp: new Date().toISOString(),
      };

      const result = await callManager.handleToolCall(toolEvent);
      expect(result.success).toBe(true);
      expect(deps.dispatchBooking).toHaveBeenCalled();
    });

    it('dispatches transfer_call tool calls to routing', async () => {
      const toolEvent: VapiToolCallEvent = {
        callId: 'call-001',
        toolName: 'transfer_call',
        parameters: { intent: 'sales' },
        timestamp: new Date().toISOString(),
      };

      const result = await callManager.handleToolCall(toolEvent);
      expect(result.success).toBe(true);
      expect(deps.dispatchRouting).toHaveBeenCalledWith('call-001', {
        intent: 'sales',
      });
    });

    it('dispatches capture_lead tool calls', async () => {
      const toolEvent: VapiToolCallEvent = {
        callId: 'call-001',
        toolName: 'capture_lead',
        parameters: { name: 'John', phone: '+15551234567' },
        timestamp: new Date().toISOString(),
      };

      const result = await callManager.handleToolCall(toolEvent);
      expect(result.success).toBe(true);
      expect(deps.dispatchLeadCapture).toHaveBeenCalledWith('call-001', {
        name: 'John',
        phone: '+15551234567',
      });
    });

    it('returns error for unknown tool names', async () => {
      const toolEvent: VapiToolCallEvent = {
        callId: 'call-001',
        toolName: 'unknown_tool',
        parameters: {},
        timestamp: new Date().toISOString(),
      };

      const result = await callManager.handleToolCall(toolEvent);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('handles service errors gracefully', async () => {
      deps = createMockDeps({
        dispatchBooking: vi.fn(async () => {
          throw new Error('Calendar API unavailable');
        }),
      });
      callManager = new CallManager(deps);

      const toolEvent: VapiToolCallEvent = {
        callId: 'call-001',
        toolName: 'check_availability',
        parameters: { date: '2024-03-15' },
        timestamp: new Date().toISOString(),
      };

      const result = await callManager.handleToolCall(toolEvent);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Calendar API unavailable');
    });
  });

  describe('getActiveCalls', () => {
    it('returns empty array when no active calls', async () => {
      const calls = await callManager.getActiveCalls('business-123');
      expect(calls).toEqual([]);
    });

    it('returns active calls with updated duration', async () => {
      await callManager.handleCallStart(createCallStartEvent());

      const calls = await callManager.getActiveCalls('business-123');
      expect(calls).toHaveLength(1);
      expect(calls[0].callId).toBe('call-001');
      expect(calls[0].businessId).toBe('business-123');
      expect(calls[0].durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it('returns multiple active calls', async () => {
      await callManager.handleCallStart(
        createCallStartEvent({ callId: 'call-1', from: '+15551111111' })
      );
      await callManager.handleCallStart(
        createCallStartEvent({ callId: 'call-2', from: '+15552222222' })
      );

      const calls = await callManager.getActiveCalls('business-123');
      expect(calls).toHaveLength(2);
    });
  });

  describe('getCallHistory', () => {
    it('delegates to data layer with filters', async () => {
      const mockResult: PaginatedResult<CallRecord> = {
        items: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        pageSize: 20,
      };
      deps = createMockDeps({
        queryCallHistory: vi.fn(async () => mockResult),
      });
      callManager = new CallManager(deps);

      const filters: import('../../shared/types').CallFilters = {
        outcomeCategory: 'appointment_booked',
        page: 1,
        pageSize: 20,
      };

      const result = await callManager.getCallHistory('business-123', filters);
      expect(result).toEqual(mockResult);
      expect(deps.queryCallHistory).toHaveBeenCalledWith(
        'business-123',
        filters
      );
    });
  });

  describe('concurrent call enforcement', () => {
    it('allows up to max concurrent calls as active', async () => {
      const business = createMockBusiness({ maxConcurrentCalls: 3 });
      deps = createMockDeps({
        getBusinessByPhoneNumber: vi.fn(async () => business),
      });
      callManager = new CallManager(deps);

      const session1 = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'c1' })
      );
      const session2 = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'c2' })
      );
      const session3 = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'c3' })
      );

      expect(session1.status).toBe('active');
      expect(session2.status).toBe('active');
      expect(session3.status).toBe('active');
    });

    it('queues calls beyond max concurrent', async () => {
      const business = createMockBusiness({ maxConcurrentCalls: 2 });
      deps = createMockDeps({
        getBusinessByPhoneNumber: vi.fn(async () => business),
      });
      callManager = new CallManager(deps);

      const s1 = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'c1' })
      );
      const s2 = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'c2' })
      );
      const s3 = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'c3' })
      );
      const s4 = await callManager.handleCallStart(
        createCallStartEvent({ callId: 'c4' })
      );

      expect(s1.status).toBe('active');
      expect(s2.status).toBe('active');
      expect(s3.status).toBe('queued');
      expect(s4.status).toBe('queued');
    });

    it('uses default max 50 when business has no config', async () => {
      const business = createMockBusiness({ maxConcurrentCalls: 0 });
      deps = createMockDeps({
        getBusinessByPhoneNumber: vi.fn(async () => business),
      });
      callManager = new CallManager(deps);

      // With default 50, first call should be active
      const session = await callManager.handleCallStart(
        createCallStartEvent()
      );
      expect(session.status).toBe('active');
    });
  });
});
