import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  login,
  refreshToken,
  isAccountLocked,
  recordFailedAttempt,
  resetFailedAttempts,
  isSessionExpired,
  hashPassword,
  decodeToken,
  AUTH_CONFIG,
  IUserRepository,
} from './auth';
import { User } from '../../shared/types';

function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: hashPassword('correctPassword'),
    businessId: 'biz-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastActiveAt: new Date(),
    createdAt: new Date('2024-01-01'),
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

describe('Auth Service', () => {
  describe('isAccountLocked', () => {
    it('returns false when lockedUntil is null', () => {
      const user = createTestUser({ lockedUntil: null });
      expect(isAccountLocked(user)).toBe(false);
    });

    it('returns true when lockedUntil is in the future', () => {
      const user = createTestUser({ lockedUntil: new Date(Date.now() + 60000) });
      expect(isAccountLocked(user)).toBe(true);
    });

    it('returns false when lockedUntil is in the past', () => {
      const user = createTestUser({ lockedUntil: new Date(Date.now() - 1000) });
      expect(isAccountLocked(user)).toBe(false);
    });
  });

  describe('recordFailedAttempt', () => {
    it('increments the failure counter', () => {
      const user = createTestUser({ failedLoginAttempts: 2 });
      const result = recordFailedAttempt(user);
      expect(result.failedLoginAttempts).toBe(3);
    });

    it('does not lock account before 5 failures', () => {
      const user = createTestUser({ failedLoginAttempts: 3 });
      const result = recordFailedAttempt(user);
      expect(result.failedLoginAttempts).toBe(4);
      expect(result.lockedUntil).toBeNull();
    });

    it('locks account on 5th consecutive failure', () => {
      const user = createTestUser({ failedLoginAttempts: 4 });
      const result = recordFailedAttempt(user);
      expect(result.failedLoginAttempts).toBe(5);
      expect(result.lockedUntil).not.toBeNull();
      expect(result.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(result.lockedUntil!.getTime()).toBeLessThanOrEqual(
        Date.now() + AUTH_CONFIG.LOCKOUT_DURATION_MS + 100
      );
    });

    it('locks account on 6th+ failure as well', () => {
      const user = createTestUser({ failedLoginAttempts: 5 });
      const result = recordFailedAttempt(user);
      expect(result.failedLoginAttempts).toBe(6);
      expect(result.lockedUntil).not.toBeNull();
    });
  });

  describe('resetFailedAttempts', () => {
    it('resets counter to 0 and clears lock', () => {
      const user = createTestUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 300000),
      });
      const result = resetFailedAttempts(user);
      expect(result.failedLoginAttempts).toBe(0);
      expect(result.lockedUntil).toBeNull();
    });

    it('works when counter is already 0', () => {
      const user = createTestUser({ failedLoginAttempts: 0, lockedUntil: null });
      const result = resetFailedAttempts(user);
      expect(result.failedLoginAttempts).toBe(0);
      expect(result.lockedUntil).toBeNull();
    });
  });

  describe('isSessionExpired', () => {
    it('returns false for recent activity', () => {
      const lastActive = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      expect(isSessionExpired(lastActive)).toBe(false);
    });

    it('returns false at exactly 30 minutes', () => {
      const lastActive = new Date(Date.now() - AUTH_CONFIG.SESSION_TIMEOUT_MS);
      expect(isSessionExpired(lastActive)).toBe(false);
    });

    it('returns true after 30 minutes of inactivity', () => {
      const lastActive = new Date(Date.now() - AUTH_CONFIG.SESSION_TIMEOUT_MS - 1);
      expect(isSessionExpired(lastActive)).toBe(true);
    });

    it('returns true for very old activity', () => {
      const lastActive = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      expect(isSessionExpired(lastActive)).toBe(true);
    });
  });

  describe('login', () => {
    it('returns INVALID_CREDENTIALS when user does not exist', async () => {
      const repo = createMockRepository(null);
      const result = await login('unknown@example.com', 'password', repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('returns ACCOUNT_LOCKED when user is currently locked', async () => {
      const lockedUser = createTestUser({
        lockedUntil: new Date(Date.now() + 300000),
        failedLoginAttempts: 5,
      });
      const repo = createMockRepository(lockedUser);
      const result = await login('test@example.com', 'wrongPassword', repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ACCOUNT_LOCKED');
      }
    });

    it('records failed attempt on wrong password', async () => {
      const user = createTestUser({ failedLoginAttempts: 0 });
      const repo = createMockRepository(user);
      const result = await login('test@example.com', 'wrongPassword', repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CREDENTIALS');
      }
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ failedLoginAttempts: 1 })
      );
    });

    it('locks account after 5th failed attempt', async () => {
      const user = createTestUser({ failedLoginAttempts: 4 });
      const repo = createMockRepository(user);
      const result = await login('test@example.com', 'wrongPassword', repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ACCOUNT_LOCKED');
      }
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        })
      );
    });

    it('returns tokens on successful login', async () => {
      const user = createTestUser();
      const repo = createMockRepository(user);
      const result = await login('test@example.com', 'correctPassword', repo);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBeTruthy();
        expect(result.data.refreshToken).toBeTruthy();
        // Verify tokens decode properly
        const decoded = decodeToken(result.data.token);
        expect(decoded).not.toBeNull();
        expect(decoded!.email).toBe('test@example.com');
        expect(decoded!.type).toBe('access');
      }
    });

    it('resets failure counter on successful login', async () => {
      const user = createTestUser({ failedLoginAttempts: 3 });
      const repo = createMockRepository(user);
      await login('test@example.com', 'correctPassword', repo);
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
      );
    });

    it('allows login after lockout period has passed', async () => {
      const user = createTestUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000), // Lockout expired
      });
      const repo = createMockRepository(user);
      const result = await login('test@example.com', 'correctPassword', repo);
      expect(result.success).toBe(true);
    });
  });

  describe('refreshToken', () => {
    it('returns INVALID_TOKEN for malformed token', async () => {
      const repo = createMockRepository();
      const result = await refreshToken('not-a-valid-token!!!', repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TOKEN');
      }
    });

    it('returns INVALID_TOKEN for access token type', async () => {
      const repo = createMockRepository();
      const accessToken = btoa(JSON.stringify({
        email: 'test@example.com',
        type: 'access',
        iat: Date.now(),
        exp: Date.now() + 1800000,
      }));
      const result = await refreshToken(accessToken, repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TOKEN');
      }
    });

    it('returns INVALID_TOKEN for expired refresh token', async () => {
      const repo = createMockRepository();
      const expiredToken = btoa(JSON.stringify({
        email: 'test@example.com',
        type: 'refresh',
        iat: Date.now() - 8 * 24 * 60 * 60 * 1000,
        exp: Date.now() - 1000, // expired
      }));
      const result = await refreshToken(expiredToken, repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TOKEN');
      }
    });

    it('returns SESSION_EXPIRED when user session is inactive', async () => {
      const user = createTestUser({
        lastActiveAt: new Date(Date.now() - 31 * 60 * 1000), // 31 min inactive
      });
      const repo = createMockRepository(user);
      const validRefreshToken = btoa(JSON.stringify({
        email: 'test@example.com',
        type: 'refresh',
        iat: Date.now(),
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }));
      const result = await refreshToken(validRefreshToken, repo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SESSION_EXPIRED');
      }
    });

    it('issues new access token from valid refresh token', async () => {
      const user = createTestUser({
        lastActiveAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      });
      const repo = createMockRepository(user);
      const validRefreshToken = btoa(JSON.stringify({
        email: 'test@example.com',
        type: 'refresh',
        iat: Date.now(),
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }));
      const result = await refreshToken(validRefreshToken, repo);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBeTruthy();
        const decoded = decodeToken(result.data.token);
        expect(decoded!.type).toBe('access');
        expect(decoded!.email).toBe('test@example.com');
      }
    });

    it('updates lastActiveAt on successful refresh', async () => {
      const user = createTestUser({
        lastActiveAt: new Date(Date.now() - 5 * 60 * 1000),
      });
      const repo = createMockRepository(user);
      const validRefreshToken = btoa(JSON.stringify({
        email: 'test@example.com',
        type: 'refresh',
        iat: Date.now(),
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }));
      await refreshToken(validRefreshToken, repo);
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastActiveAt: expect.any(Date),
        })
      );
    });
  });
});
