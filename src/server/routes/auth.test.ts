import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createAuthRouter } from './auth';
import { IUserRepository } from '../services/auth';
import { User } from '../../shared/types';
import { hashPassword } from '../services/auth';

/**
 * Minimal HTTP request helper for testing Express routers without supertest.
 * Simulates request/response cycle through the router.
 */
function createTestApp(repository: IUserRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(repository));
  return app;
}

/**
 * Helper to make requests to the Express test app.
 */
async function makeRequest(
  app: express.Express,
  method: 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const req = {
      method,
      url: path,
      headers: { 'content-type': 'application/json' } as Record<string, string>,
      body: body || {},
    };

    let statusCode = 200;
    let responseBody: Record<string, unknown> = {};

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: Record<string, unknown>) {
        responseBody = data;
        resolve({ status: statusCode, body: responseBody });
      },
    };

    // Use a real HTTP-like approach by injecting into Express
    // For proper testing, we use Express's built-in handling
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      
      fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
        .then(async (response) => {
          const json = await response.json();
          server.close();
          resolve({ status: response.status, body: json });
        })
        .catch(() => {
          server.close();
          resolve({ status: 500, body: { error: 'REQUEST_FAILED' } });
        });
    });
  });
}

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: hashPassword('correctpassword'),
    businessId: 'biz-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockRepository(user: User | null = null): IUserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(user),
    findByRefreshToken: vi.fn().mockResolvedValue(user),
    update: vi.fn().mockImplementation(async (u: User) => u),
  };
}

describe('Auth API Routes', () => {
  describe('POST /api/auth/login', () => {
    it('returns 400 when email is missing', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        password: 'test123',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Email');
    });

    it('returns 400 when password is missing', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Password');
    });

    it('returns 400 when email is not a string', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 123,
        password: 'test123',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 401 for invalid credentials (user not found)', async () => {
      const repo = createMockRepository(null);
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('INVALID_CREDENTIALS');
    });

    it('returns 401 for invalid credentials (wrong password)', async () => {
      const user = createMockUser();
      const repo = createMockRepository(user);
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('INVALID_CREDENTIALS');
    });

    it('returns 200 with tokens on successful login', async () => {
      const user = createMockUser();
      const repo = createMockRepository(user);
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'correctpassword',
      });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(typeof response.body.token).toBe('string');
      expect(response.body.refreshToken).toBeDefined();
      expect(typeof response.body.refreshToken).toBe('string');
    });

    it('returns 423 when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
      const user = createMockUser({
        failedLoginAttempts: 5,
        lockedUntil,
      });
      const repo = createMockRepository(user);
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'correctpassword',
      });

      expect(response.status).toBe(423);
      expect(response.body.error).toBe('ACCOUNT_LOCKED');
      expect(response.body.lockedUntil).toBeDefined();
    });

    it('trims whitespace from email', async () => {
      const user = createMockUser();
      const repo = createMockRepository(user);
      const app = createTestApp(repo);

      await makeRequest(app, 'POST', '/api/auth/login', {
        email: '  test@example.com  ',
        password: 'correctpassword',
      });

      expect(repo.findByEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns 400 when refreshToken is missing', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', {});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('refreshToken');
    });

    it('returns 400 when refreshToken is not a string', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', {
        refreshToken: 12345,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 401 for invalid refresh token', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', {
        refreshToken: 'invalid-token-value',
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('INVALID_TOKEN');
    });

    it('returns 200 with new access token for valid refresh token', async () => {
      const user = createMockUser();
      const repo = createMockRepository(user);
      const app = createTestApp(repo);

      // First login to get a valid refresh token
      const loginResponse = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'correctpassword',
      });

      expect(loginResponse.status).toBe(200);
      const refreshTokenValue = loginResponse.body.refreshToken as string;

      // Now use the refresh token
      const refreshResponse = await makeRequest(app, 'POST', '/api/auth/refresh', {
        refreshToken: refreshTokenValue,
      });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.token).toBeDefined();
      expect(typeof refreshResponse.body.token).toBe('string');
    });

    it('returns 401 for expired refresh token', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      // Create an expired refresh token manually
      const expiredPayload = {
        email: 'test@example.com',
        type: 'refresh',
        iat: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        exp: Date.now() - 1 * 24 * 60 * 60 * 1000, // expired 1 day ago
      };
      const expiredToken = btoa(JSON.stringify(expiredPayload));

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', {
        refreshToken: expiredToken,
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('INVALID_TOKEN');
    });

    it('returns 401 when using an access token as refresh token', async () => {
      const repo = createMockRepository();
      const app = createTestApp(repo);

      // Create an access token (wrong type for refresh)
      const accessPayload = {
        email: 'test@example.com',
        type: 'access',
        iat: Date.now(),
        exp: Date.now() + 30 * 60 * 1000,
      };
      const accessToken = btoa(JSON.stringify(accessPayload));

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', {
        refreshToken: accessToken,
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('INVALID_TOKEN');
    });
  });
});
