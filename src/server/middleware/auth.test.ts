import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth';

/**
 * Helper to create a mock request.
 */
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    path: '/api/test',
    ...overrides,
  } as unknown as Request;
}

/**
 * Helper to create a mock response.
 */
function createMockResponse(): Response & { jsonData: unknown; statusCode: number } {
  const res = {
    statusCode: 200,
    jsonData: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.jsonData = data;
      return this;
    },
  } as unknown as Response & { jsonData: unknown; statusCode: number };
  return res;
}

describe('authMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('skips auth for webhook routes', () => {
    const req = createMockRequest({ path: '/api/webhooks/vapi/call-start' });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.jsonData).toBeNull();
  });

  it('skips auth for any webhook sub-path', () => {
    const req = createMockRequest({ path: '/api/webhooks/vapi/call-end' });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no Authorization header is present', () => {
    const req = createMockRequest({ headers: {} });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
    });
  });

  it('returns 401 when Authorization header does not start with Bearer', () => {
    const req = createMockRequest({
      headers: { authorization: 'Basic abc123' },
    });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for an invalid/malformed token', () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Invalid or malformed token',
    });
  });

  it('returns 401 for an expired token', () => {
    const payload = {
      email: 'test@example.com',
      type: 'access',
      iat: Date.now() - 60000,
      exp: Date.now() - 1000, // expired 1 second ago
    };
    const token = btoa(JSON.stringify(payload));
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({
      error: 'TOKEN_EXPIRED',
      message: 'Token has expired',
    });
  });

  it('returns 401 for a refresh token used as access token', () => {
    const payload = {
      email: 'test@example.com',
      type: 'refresh',
      iat: Date.now(),
      exp: Date.now() + 60000,
    };
    const token = btoa(JSON.stringify(payload));
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Invalid token type',
    });
  });

  it('attaches decoded user info and calls next for a valid access token', () => {
    const payload = {
      email: 'user@business.com',
      type: 'access',
      iat: Date.now(),
      exp: Date.now() + 30 * 60 * 1000, // 30 min from now
    };
    const token = btoa(JSON.stringify(payload));
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.email).toBe('user@business.com');
    expect(req.user!.type).toBe('access');
  });
});
