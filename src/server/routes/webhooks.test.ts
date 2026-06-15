import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { createWebhookRouter } from './webhooks';
import { ICallManager } from '../services/callManager';

// Mock redis publish
vi.mock('../db/redis', () => ({
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

import { publish, CHANNELS } from '../db/redis';

/**
 * Helper to create a mock CallManager with all methods stubbed.
 */
function createMockCallManager(): ICallManager {
  return {
    handleCallStart: vi.fn().mockResolvedValue({
      callId: 'call-123',
      businessId: 'biz-1',
      callerNumber: '+15551234567',
      startedAt: new Date(),
      status: 'active',
      businessConfig: {},
      language: 'en',
      metadata: { assistantId: 'asst-1', vapiCallId: 'call-123' },
    }),
    handleCallEnd: vi.fn().mockResolvedValue(undefined),
    handleToolCall: vi.fn().mockResolvedValue({
      success: true,
      toolName: 'check_availability',
      data: { slots: [] },
    }),
    getActiveCalls: vi.fn().mockResolvedValue([]),
    getCallHistory: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  };
}

/**
 * Create mock Express Request object.
 */
function mockRequest(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

/**
 * Create mock Express Response object that captures status and json calls.
 */
function mockResponse() {
  const res = {
    headersSent: false,
    statusCode: 200,
    jsonBody: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.headersSent = true;
      res.jsonBody = data;
      return res;
    },
  } as unknown as Response & { statusCode: number; jsonBody: unknown };
  return res;
}

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
  };
}

interface RouterWithStack {
  stack: RouteLayer[];
}

/**
 * Extract the route handler from the router for a given method and path.
 */
function getRouteHandler(
  callManager: ICallManager,
  path: string
): (req: Request, res: Response) => Promise<void> {
  const router = createWebhookRouter(callManager);
  const layers = (router as unknown as RouterWithStack).stack;
  for (const layer of layers) {
    if (layer.route && layer.route.path === path && layer.route.methods.post) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`No POST handler found for path: ${path}`);
}

describe('Webhook Routes - /api/webhooks/vapi', () => {
  let mockCallManager: ICallManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallManager = createMockCallManager();
  });

  describe('POST /vapi/call-start', () => {
    const validCallStartBody = {
      callId: 'call-abc-123',
      from: '+15551234567',
      to: '+15559876543',
      timestamp: '2024-01-15T10:30:00.000Z',
      assistantId: 'asst-xyz-789',
    };

    it('should return 200 and dispatch to callManager.handleCallStart', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-start');
      const req = mockRequest(validCallStartBody);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ status: 'accepted' });
      expect(mockCallManager.handleCallStart).toHaveBeenCalledWith(validCallStartBody);
    });

    it('should return 400 when callId is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-start');
      const { callId, ...body } = validCallStartBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: callId, from, to, timestamp, assistantId',
      });
      expect(mockCallManager.handleCallStart).not.toHaveBeenCalled();
    });

    it('should return 400 when from is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-start');
      const { from, ...body } = validCallStartBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when to is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-start');
      const { to, ...body } = validCallStartBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when timestamp is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-start');
      const { timestamp, ...body } = validCallStartBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when assistantId is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-start');
      const { assistantId, ...body } = validCallStartBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /vapi/call-end', () => {
    const validCallEndBody = {
      callId: 'call-abc-123',
      duration: 120,
      transcript: [
        { role: 'assistant', text: 'Hello!', timestamp: 1000 },
        { role: 'user', text: 'Hi there', timestamp: 2000 },
      ],
      endReason: 'hangup',
      timestamp: '2024-01-15T10:32:00.000Z',
    };

    it('should return 200 and dispatch to callManager.handleCallEnd', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-end');
      const req = mockRequest(validCallEndBody);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ status: 'accepted' });
      expect(mockCallManager.handleCallEnd).toHaveBeenCalledWith(validCallEndBody);
    });

    it('should emit SMS_QUEUED event on Redis after call-end', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-end');
      const req = mockRequest(validCallEndBody);
      const res = mockResponse();

      await handler(req, res);

      expect(publish).toHaveBeenCalledWith(CHANNELS.SMS_QUEUED, {
        callId: validCallEndBody.callId,
        duration: validCallEndBody.duration,
        endReason: validCallEndBody.endReason,
        timestamp: validCallEndBody.timestamp,
      });
    });

    it('should return 400 when callId is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-end');
      const { callId, ...body } = validCallEndBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(mockCallManager.handleCallEnd).not.toHaveBeenCalled();
    });

    it('should return 400 when duration is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-end');
      const { duration, ...body } = validCallEndBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when timestamp is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-end');
      const { timestamp, ...body } = validCallEndBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should handle empty transcript gracefully', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/call-end');
      const body = { ...validCallEndBody, transcript: undefined };
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockCallManager.handleCallEnd).toHaveBeenCalledWith({
        ...validCallEndBody,
        transcript: [],
      });
    });
  });

  describe('POST /vapi/tool-call', () => {
    const validToolCallBody = {
      callId: 'call-abc-123',
      toolName: 'check_availability',
      parameters: { date: '2024-01-20', serviceType: 'consultation' },
      timestamp: '2024-01-15T10:31:00.000Z',
    };

    it('should return 200 with tool call result', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const req = mockRequest(validToolCallBody);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({
        success: true,
        toolName: 'check_availability',
        data: { slots: [] },
      });
      expect(mockCallManager.handleToolCall).toHaveBeenCalledWith(validToolCallBody);
    });

    it('should emit LEAD_CAPTURED event when capture_lead tool succeeds', async () => {
      const captureLeadBody = {
        callId: 'call-abc-123',
        toolName: 'capture_lead',
        parameters: { name: 'John', phone: '+15551234567' },
        timestamp: '2024-01-15T10:31:00.000Z',
      };

      (mockCallManager.handleToolCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        toolName: 'capture_lead',
        data: { leadId: 'lead-1' },
      });

      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const req = mockRequest(captureLeadBody);
      const res = mockResponse();

      await handler(req, res);

      expect(publish).toHaveBeenCalledWith(CHANNELS.LEAD_CAPTURED, {
        callId: captureLeadBody.callId,
        toolName: 'capture_lead',
        data: { leadId: 'lead-1' },
        timestamp: captureLeadBody.timestamp,
      });
    });

    it('should NOT emit LEAD_CAPTURED when capture_lead fails', async () => {
      const captureLeadBody = {
        callId: 'call-abc-123',
        toolName: 'capture_lead',
        parameters: { name: 'John', phone: 'invalid' },
        timestamp: '2024-01-15T10:31:00.000Z',
      };

      (mockCallManager.handleToolCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        toolName: 'capture_lead',
        data: {},
        error: 'Invalid phone number',
      });

      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const req = mockRequest(captureLeadBody);
      const res = mockResponse();

      await handler(req, res);

      expect(publish).not.toHaveBeenCalledWith(
        CHANNELS.LEAD_CAPTURED,
        expect.anything()
      );
    });

    it('should NOT emit LEAD_CAPTURED for non-lead-capture tools', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const req = mockRequest(validToolCallBody);
      const res = mockResponse();

      await handler(req, res);

      expect(publish).not.toHaveBeenCalledWith(
        CHANNELS.LEAD_CAPTURED,
        expect.anything()
      );
    });

    it('should return 400 when callId is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const { callId, ...body } = validToolCallBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(mockCallManager.handleToolCall).not.toHaveBeenCalled();
    });

    it('should return 400 when toolName is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const { toolName, ...body } = validToolCallBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when timestamp is missing', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const { timestamp, ...body } = validToolCallBody;
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should handle missing parameters gracefully (defaults to empty object)', async () => {
      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const body = { callId: 'call-1', toolName: 'transfer_call', timestamp: '2024-01-15T10:31:00Z' };
      const req = mockRequest(body);
      const res = mockResponse();

      await handler(req, res);

      expect(mockCallManager.handleToolCall).toHaveBeenCalledWith({
        callId: 'call-1',
        toolName: 'transfer_call',
        parameters: {},
        timestamp: '2024-01-15T10:31:00Z',
      });
    });
  });

  describe('Error handling', () => {
    it('should return 200 even when callManager.handleCallStart throws (async fire-and-forget)', async () => {
      (mockCallManager.handleCallStart as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Business not found')
      );

      const handler = getRouteHandler(mockCallManager, '/vapi/call-start');
      const req = mockRequest({
        callId: 'call-1',
        from: '+1555',
        to: '+1666',
        timestamp: '2024-01-15T10:30:00Z',
        assistantId: 'asst-1',
      });
      const res = mockResponse();

      // The handler sends 200 before awaiting the callManager, but since
      // in this implementation await happens after res.json(), we catch it
      await handler(req, res);

      // Response was already sent as 200
      expect(res.statusCode).toBe(200);
    });

    it('should return 500 when tool-call throws before response', async () => {
      (mockCallManager.handleToolCall as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Service unavailable')
      );

      const handler = getRouteHandler(mockCallManager, '/vapi/tool-call');
      const req = mockRequest({
        callId: 'call-1',
        toolName: 'book_appointment',
        parameters: {},
        timestamp: '2024-01-15T10:30:00Z',
      });
      const res = mockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to process tool-call event',
      });
    });
  });

  describe('Router structure', () => {
    it('should create a router with 3 POST routes', () => {
      const router = createWebhookRouter(mockCallManager);
      const layers = (router as unknown as RouterWithStack).stack;
      const postRoutes = layers.filter(l => l.route && l.route.methods.post);

      expect(postRoutes).toHaveLength(3);
      expect(postRoutes.map(l => l.route!.path)).toEqual([
        '/vapi/call-start',
        '/vapi/call-end',
        '/vapi/tool-call',
      ]);
    });
  });
});
