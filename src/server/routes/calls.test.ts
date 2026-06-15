import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Express } from 'express';
import { createCallsRouter, CallsRouteDependencies } from './calls';
import { CallRecord, ActiveCall, PaginatedResult, CallFilters } from '../../shared/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Express app with the calls router mounted.
 */
function createTestApp(deps: CallsRouteDependencies): Express {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware by attaching a businessId
  app.use((req, _res, next) => {
    (req as express.Request & { user?: Record<string, unknown> }).user = {
      email: 'test@example.com',
      businessId: 'business-123',
      type: 'access',
      iat: Date.now(),
      exp: Date.now() + 3600000,
    };
    next();
  });

  const router = createCallsRouter(deps);
  app.use('/api/calls', router);
  return app;
}

/**
 * Makes a GET request to the test app and returns the response.
 */
async function makeGetRequest(
  app: Express,
  path: string
): Promise<{ status: number; body: unknown }> {
  // Use native fetch with a simple server-like approach via Express's handle
  return new Promise((resolve, reject) => {
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      fetch(`http://127.0.0.1:${port}${path}`)
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function createMockCallRecord(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: 'call-001',
    businessId: 'business-123',
    callerNumber: '+15551234567',
    startedAt: new Date('2024-01-15T10:00:00Z'),
    endedAt: new Date('2024-01-15T10:05:00Z'),
    durationSeconds: 300,
    status: 'completed',
    outcomeCategory: 'appointment_booked',
    summaryText: 'Caller booked a dental cleaning appointment for next Tuesday.',
    transcriptUrl: 'https://s3.example.com/transcripts/call-001.json',
    intentClassification: 'booking',
    language: 'en',
    metadata: {
      vapiCallId: 'vapi-call-001',
      assistantId: 'asst-001',
      transferAttempts: 0,
      sttFailures: 0,
      languageDetected: 'en',
      toolCallsMade: ['book_appointment'],
    },
    ...overrides,
  };
}

function createMockActiveCall(overrides: Partial<ActiveCall> = {}): ActiveCall {
  return {
    callId: 'active-call-001',
    businessId: 'business-123',
    callerNumber: '+15559876543',
    startedAt: new Date('2024-01-15T10:30:00Z'),
    status: 'active',
    durationSeconds: 45,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Calls API Routes', () => {
  let mockDeps: CallsRouteDependencies;

  beforeEach(() => {
    mockDeps = {
      getCallHistory: vi.fn().mockResolvedValue({
        items: [createMockCallRecord()],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
        pageSize: 20,
      }),
      getCallById: vi.fn().mockResolvedValue(createMockCallRecord()),
      getActiveCalls: vi.fn().mockResolvedValue([createMockActiveCall()]),
    };
  });

  describe('GET /api/calls', () => {
    it('returns paginated call history', async () => {
      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls');

      expect(status).toBe(200);
      const result = body as PaginatedResult<CallRecord>;
      expect(result.items).toHaveLength(1);
      expect(result.totalItems).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.currentPage).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('passes filter parameters to the service', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(
        app,
        '/api/calls?outcomeCategory=appointment_booked&callerNumber=%2B15551234567&keyword=dental&page=2&pageSize=10'
      );

      expect(mockDeps.getCallHistory).toHaveBeenCalledWith(
        'business-123',
        expect.objectContaining({
          outcomeCategory: 'appointment_booked',
          callerNumber: '+15551234567',
          keyword: 'dental',
          page: 2,
          pageSize: 10,
        })
      );
    });

    it('passes date filters correctly', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(
        app,
        '/api/calls?dateFrom=2024-01-01T00:00:00Z&dateTo=2024-01-31T23:59:59Z'
      );

      expect(mockDeps.getCallHistory).toHaveBeenCalledWith(
        'business-123',
        expect.objectContaining({
          dateFrom: new Date('2024-01-01T00:00:00Z'),
          dateTo: new Date('2024-01-31T23:59:59Z'),
        })
      );
    });

    it('ignores invalid date filters', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(app, '/api/calls?dateFrom=not-a-date');

      expect(mockDeps.getCallHistory).toHaveBeenCalledWith(
        'business-123',
        expect.not.objectContaining({ dateFrom: expect.anything() })
      );
    });

    it('clamps pageSize to maximum 100', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(app, '/api/calls?pageSize=500');

      // Should not pass pageSize > 100
      const callArgs = (mockDeps.getCallHistory as ReturnType<typeof vi.fn>).mock.calls[0];
      const filters = callArgs[1] as CallFilters;
      expect(filters.pageSize).toBeUndefined();
    });

    it('returns 500 on service error', async () => {
      (mockDeps.getCallHistory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls');

      expect(status).toBe(500);
      expect((body as { error: string }).error).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /api/calls/active', () => {
    it('returns active and queued calls', async () => {
      const activeCalls = [
        createMockActiveCall({ status: 'active' }),
        createMockActiveCall({ callId: 'queued-001', status: 'queued' }),
      ];
      (mockDeps.getActiveCalls as ReturnType<typeof vi.fn>).mockResolvedValue(activeCalls);

      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls/active');

      expect(status).toBe(200);
      const result = body as { calls: ActiveCall[]; count: number };
      expect(result.calls).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('returns empty when no active calls', async () => {
      (mockDeps.getActiveCalls as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls/active');

      expect(status).toBe(200);
      const result = body as { calls: ActiveCall[]; count: number };
      expect(result.calls).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('returns 500 on service error', async () => {
      (mockDeps.getActiveCalls as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis unavailable')
      );

      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls/active');

      expect(status).toBe(500);
      expect((body as { error: string }).error).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /api/calls/:id', () => {
    it('returns a single call record by ID', async () => {
      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls/call-001');

      expect(status).toBe(200);
      const record = body as CallRecord;
      expect(record.id).toBe('call-001');
      expect(record.summaryText).toContain('dental cleaning');
      expect(record.transcriptUrl).toBeDefined();
    });

    it('returns 404 when call not found', async () => {
      (mockDeps.getCallById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls/nonexistent-id');

      expect(status).toBe(404);
      expect((body as { error: string }).error).toBe('NOT_FOUND');
      expect((body as { message: string }).message).toContain('nonexistent-id');
    });

    it('calls getCallById with correct businessId', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(app, '/api/calls/call-001');

      expect(mockDeps.getCallById).toHaveBeenCalledWith('call-001', 'business-123');
    });

    it('returns 500 on service error', async () => {
      (mockDeps.getCallById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Unexpected error')
      );

      const app = createTestApp(mockDeps);
      const { status, body } = await makeGetRequest(app, '/api/calls/call-001');

      expect(status).toBe(500);
      expect((body as { error: string }).error).toBe('INTERNAL_ERROR');
    });
  });

  describe('Business ID resolution', () => {
    it('returns 400 when no businessId available', async () => {
      // Create app without auth middleware attaching businessId
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      const router = createCallsRouter(mockDeps);
      appWithoutAuth.use('/api/calls', router);

      const { status, body } = await makeGetRequest(appWithoutAuth, '/api/calls');
      expect(status).toBe(400);
      expect((body as { error: string }).error).toBe('BAD_REQUEST');
    });

    it('accepts businessId from query parameter', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      const router = createCallsRouter(mockDeps);
      appWithoutAuth.use('/api/calls', router);

      const { status } = await makeGetRequest(
        appWithoutAuth,
        '/api/calls?businessId=query-biz-123'
      );

      expect(status).toBe(200);
      expect(mockDeps.getCallHistory).toHaveBeenCalledWith(
        'query-biz-123',
        expect.any(Object)
      );
    });

    it('accepts businessId from x-business-id header', async () => {
      // We need a slightly different approach for headers
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      // Simulate header-based auth
      appWithoutAuth.use((req, _res, next) => {
        req.headers['x-business-id'] = 'header-biz-123';
        next();
      });
      const router = createCallsRouter(mockDeps);
      appWithoutAuth.use('/api/calls', router);

      const { status } = await makeGetRequest(appWithoutAuth, '/api/calls');

      expect(status).toBe(200);
      expect(mockDeps.getCallHistory).toHaveBeenCalledWith(
        'header-biz-123',
        expect.any(Object)
      );
    });
  });

  describe('Filter parsing edge cases', () => {
    it('ignores empty string filters', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(app, '/api/calls?outcomeCategory=&keyword=&callerNumber=');

      expect(mockDeps.getCallHistory).toHaveBeenCalledWith(
        'business-123',
        {}
      );
    });

    it('ignores negative page numbers', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(app, '/api/calls?page=-1');

      const callArgs = (mockDeps.getCallHistory as ReturnType<typeof vi.fn>).mock.calls[0];
      const filters = callArgs[1] as CallFilters;
      expect(filters.page).toBeUndefined();
    });

    it('ignores non-numeric page values', async () => {
      const app = createTestApp(mockDeps);
      await makeGetRequest(app, '/api/calls?page=abc');

      const callArgs = (mockDeps.getCallHistory as ReturnType<typeof vi.fn>).mock.calls[0];
      const filters = callArgs[1] as CallFilters;
      expect(filters.page).toBeUndefined();
    });
  });
});
