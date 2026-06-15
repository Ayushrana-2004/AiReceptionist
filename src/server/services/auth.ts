import { User } from '../../shared/types';

/**
 * Repository interface for user lookups and persistence.
 * Allows the auth service to be tested without a real database.
 */
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findByRefreshToken(token: string): Promise<User | null>;
  update(user: User): Promise<User>;
}

/**
 * Auth configuration constants.
 */
export const AUTH_CONFIG = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
} as const;

/**
 * Simple base64-encoded token for testability (no real JWT library).
 * Format: base64({ email, type, iat, exp })
 */
function generateToken(payload: { email: string; type: 'access' | 'refresh'; iat: number; exp: number }): string {
  const json = JSON.stringify(payload);
  return btoa(json);
}

/**
 * Decode a simulated token. Returns null if invalid.
 */
export function decodeToken(token: string): { email: string; type: 'access' | 'refresh'; iat: number; exp: number } | null {
  try {
    const json = atob(token);
    const payload = JSON.parse(json);
    if (payload && payload.email && payload.type && typeof payload.iat === 'number' && typeof payload.exp === 'number') {
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Simple password hash comparison for testability.
 * In production this would use bcrypt or argon2.
 * Here we simulate by comparing against the stored hash directly.
 */
function verifyPassword(password: string, passwordHash: string): boolean {
  // For testability: hash is just base64(password)
  return btoa(password) === passwordHash;
}

/**
 * Create a simulated password hash (base64 encoding for testability).
 */
export function hashPassword(password: string): string {
  return btoa(password);
}

/**
 * Check if the user account is currently locked.
 */
export function isAccountLocked(user: User): boolean {
  if (!user.lockedUntil) {
    return false;
  }
  return new Date() < user.lockedUntil;
}

/**
 * Record a failed login attempt. Locks the account if failures reach the threshold.
 */
export function recordFailedAttempt(user: User): User {
  const newAttempts = user.failedLoginAttempts + 1;
  const lockedUntil = newAttempts >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS
    ? new Date(Date.now() + AUTH_CONFIG.LOCKOUT_DURATION_MS)
    : user.lockedUntil;

  return {
    ...user,
    failedLoginAttempts: newAttempts,
    lockedUntil,
  };
}

/**
 * Reset the failure counter on successful login.
 */
export function resetFailedAttempts(user: User): User {
  return {
    ...user,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
}

/**
 * Check if a session has expired due to inactivity (> 30 min since last activity).
 */
export function isSessionExpired(lastActiveAt: Date): boolean {
  const now = Date.now();
  const elapsed = now - lastActiveAt.getTime();
  return elapsed > AUTH_CONFIG.SESSION_TIMEOUT_MS;
}

export interface LoginResult {
  token: string;
  refreshToken: string;
}

export interface RefreshResult {
  token: string;
}

export type AuthError =
  | { code: 'INVALID_CREDENTIALS'; message: string }
  | { code: 'ACCOUNT_LOCKED'; message: string; lockedUntil: Date }
  | { code: 'INVALID_TOKEN'; message: string }
  | { code: 'SESSION_EXPIRED'; message: string };

/**
 * Attempt login with email and password.
 * - Checks if account is locked
 * - Validates credentials
 * - On failure: records attempt, may lock account
 * - On success: resets failure counter, issues tokens
 */
export async function login(
  email: string,
  password: string,
  repository: IUserRepository,
): Promise<{ success: true; data: LoginResult } | { success: false; error: AuthError }> {
  const user = await repository.findByEmail(email);

  if (!user) {
    return {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
  }

  // Check if account is locked
  if (isAccountLocked(user)) {
    return {
      success: false,
      error: {
        code: 'ACCOUNT_LOCKED',
        message: 'Account is locked due to too many failed attempts',
        lockedUntil: user.lockedUntil!,
      },
    };
  }

  // Validate password
  if (!verifyPassword(password, user.passwordHash)) {
    const updatedUser = recordFailedAttempt(user);
    await repository.update(updatedUser);

    if (isAccountLocked(updatedUser)) {
      return {
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Account is locked due to too many failed attempts',
          lockedUntil: updatedUser.lockedUntil!,
        },
      };
    }

    return {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
  }

  // Successful login — reset failures and issue tokens
  const now = Date.now();
  const updatedUser = resetFailedAttempts({
    ...user,
    lastActiveAt: new Date(now),
  });
  await repository.update(updatedUser);

  const token = generateToken({
    email: user.email,
    type: 'access',
    iat: now,
    exp: now + AUTH_CONFIG.SESSION_TIMEOUT_MS,
  });

  const refreshTokenValue = generateToken({
    email: user.email,
    type: 'refresh',
    iat: now,
    exp: now + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return {
    success: true,
    data: { token, refreshToken: refreshTokenValue },
  };
}

/**
 * Issue a new access token from a valid refresh token.
 */
export async function refreshToken(
  token: string,
  repository: IUserRepository,
): Promise<{ success: true; data: RefreshResult } | { success: false; error: AuthError }> {
  const decoded = decodeToken(token);

  if (!decoded || decoded.type !== 'refresh') {
    return {
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or malformed refresh token' },
    };
  }

  // Check token expiry
  if (Date.now() > decoded.exp) {
    return {
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Refresh token has expired' },
    };
  }

  const user = await repository.findByEmail(decoded.email);

  if (!user) {
    return {
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'User not found' },
    };
  }

  // Check session inactivity
  if (isSessionExpired(user.lastActiveAt)) {
    return {
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Session expired due to inactivity' },
    };
  }

  const now = Date.now();
  const newToken = generateToken({
    email: user.email,
    type: 'access',
    iat: now,
    exp: now + AUTH_CONFIG.SESSION_TIMEOUT_MS,
  });

  // Update last active timestamp
  await repository.update({ ...user, lastActiveAt: new Date(now) });

  return {
    success: true,
    data: { token: newToken },
  };
}
