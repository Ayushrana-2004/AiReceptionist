/**
 * Property-Based Test: Authentication security enforcement
 *
 * Feature: ai-receptionist, Property 19: Authentication security enforcement
 *
 * Validates: Requirements 9.4, 9.5
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  recordFailedAttempt,
  resetFailedAttempts,
  isAccountLocked,
  isSessionExpired,
  AUTH_CONFIG,
} from './auth';
import { User } from '../../shared/types';

/**
 * Helper: create a base user with zero failures and no lock.
 */
function makeBaseUser(): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hash',
    businessId: 'biz-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastActiveAt: new Date(),
    createdAt: new Date(),
  };
}

describe('Property 19: Authentication security enforcement', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('account locks after exactly 5 consecutive failures', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // number of consecutive failures to apply
        (failureCount) => {
          let user = makeBaseUser();

          for (let i = 0; i < failureCount; i++) {
            user = recordFailedAttempt(user);
          }

          if (failureCount >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS) {
            // Account should be locked
            expect(user.lockedUntil).not.toBeNull();
            expect(isAccountLocked(user)).toBe(true);
          } else {
            // Account should NOT be locked (lockedUntil remains null from base)
            expect(user.lockedUntil).toBeNull();
            expect(isAccountLocked(user)).toBe(false);
          }

          // failedLoginAttempts should match the number of failures applied
          expect(user.failedLoginAttempts).toBe(failureCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('failure counter resets on any successful login', () => {
    fc.assert(
      fc.property(
        // Generate a sequence of booleans: true = success, false = failure, length 1-20
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (sequence) => {
          let user = makeBaseUser();

          for (const isSuccess of sequence) {
            if (isSuccess) {
              user = resetFailedAttempts(user);
            } else {
              // Only apply failure if account is not locked
              if (!isAccountLocked(user)) {
                user = recordFailedAttempt(user);
              }
            }
          }

          // After every success, failedLoginAttempts should be 0
          // Check the invariant: if the last action was a success, counter is 0
          const lastAction = sequence[sequence.length - 1];
          if (lastAction === true) {
            expect(user.failedLoginAttempts).toBe(0);
            expect(user.lockedUntil).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('session expires after 30 minutes of inactivity', () => {
    fc.assert(
      fc.property(
        // Generate elapsed time in milliseconds: 0 to 1 hour
        fc.integer({ min: 0, max: 60 * 60 * 1000 }),
        (elapsedMs) => {
          const now = Date.now();
          const lastActiveAt = new Date(now - elapsedMs);

          // Mock Date.now to return a consistent value
          vi.spyOn(Date, 'now').mockReturnValue(now);

          const expired = isSessionExpired(lastActiveAt);

          if (elapsedMs > AUTH_CONFIG.SESSION_TIMEOUT_MS) {
            expect(expired).toBe(true);
          } else {
            expect(expired).toBe(false);
          }

          vi.restoreAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isAccountLocked is true iff 5+ consecutive failures have been recorded', () => {
    fc.assert(
      fc.property(
        // Generate a sequence of login attempts (true=success, false=failure), length 1-20
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (sequence) => {
          let user = makeBaseUser();
          let consecutiveFailures = 0;

          for (const isSuccess of sequence) {
            if (isSuccess) {
              user = resetFailedAttempts(user);
              consecutiveFailures = 0;
            } else {
              if (!isAccountLocked(user)) {
                user = recordFailedAttempt(user);
                consecutiveFailures++;
              }
            }
          }

          // After processing, verify the lock state matches consecutive failure count
          if (consecutiveFailures >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS) {
            expect(isAccountLocked(user)).toBe(true);
          } else if (consecutiveFailures === 0) {
            // After a success, account is unlocked
            expect(isAccountLocked(user)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after any run of 5+ consecutive failures isAccountLocked returns true, after success failedLoginAttempts is 0', () => {
    fc.assert(
      fc.property(
        // Generate a longer sequence to cover varied patterns
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (sequence) => {
          let user = makeBaseUser();
          let consecutiveFailures = 0;

          for (const isSuccess of sequence) {
            if (isSuccess) {
              user = resetFailedAttempts(user);
              consecutiveFailures = 0;

              // After success: counter must be 0
              expect(user.failedLoginAttempts).toBe(0);
            } else {
              if (!isAccountLocked(user)) {
                user = recordFailedAttempt(user);
                consecutiveFailures++;

                // After 5 consecutive failures: must be locked
                if (consecutiveFailures >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS) {
                  expect(isAccountLocked(user)).toBe(true);
                }
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
