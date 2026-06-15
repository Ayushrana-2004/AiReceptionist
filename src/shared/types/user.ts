/**
 * Authentication user account.
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  businessId: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastActiveAt: Date;
  createdAt: Date;
}
