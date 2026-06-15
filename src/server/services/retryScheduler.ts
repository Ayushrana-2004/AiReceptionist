/**
 * Retry Scheduler Utility
 *
 * Computes retry timestamps and manages retry state for services that need
 * automatic retry logic (SMS delivery, CRM sync).
 *
 * Used by:
 * - SMS service: 3 retries at 5-minute intervals
 * - CRM sync: 288 retries at 5-minute intervals (24 hours total)
 */

/** Pre-configured retry settings for SMS delivery */
export const SMS_RETRY_CONFIG = {
  maxAttempts: 3,
  intervalMs: 5 * 60 * 1000, // 5 minutes
} as const;

/** Pre-configured retry settings for CRM synchronization */
export const CRM_RETRY_CONFIG = {
  maxAttempts: 288,
  intervalMs: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Computes an array of retry timestamps starting from the initial failure time.
 * Each timestamp is spaced at `intervalMs` from the previous one.
 *
 * @param initialFailure - The time of the initial failure
 * @param intervalMs - Milliseconds between each retry attempt
 * @param maxAttempts - Total number of retry attempts to schedule
 * @returns Array of exactly `maxAttempts` Date objects representing retry times
 */
export function computeRetryTimestamps(
  initialFailure: Date,
  intervalMs: number,
  maxAttempts: number
): Date[] {
  const timestamps: Date[] = [];
  for (let i = 1; i <= maxAttempts; i++) {
    timestamps.push(new Date(initialFailure.getTime() + i * intervalMs));
  }
  return timestamps;
}

/**
 * Determines if retry attempts have been exhausted.
 *
 * @param attemptCount - Number of retry attempts already made
 * @param maxAttempts - Maximum allowed retry attempts
 * @returns true if attemptCount >= maxAttempts
 */
export function isRetryExhausted(
  attemptCount: number,
  maxAttempts: number
): boolean {
  return attemptCount >= maxAttempts;
}

/**
 * Gets the next retry time based on the initial failure and how many
 * attempts have already been made.
 *
 * @param initialFailure - The time of the initial failure
 * @param attemptCount - Number of retry attempts already completed
 * @param intervalMs - Milliseconds between each retry attempt
 * @returns Date representing when the next retry should occur
 */
export function getNextRetryTime(
  initialFailure: Date,
  attemptCount: number,
  intervalMs: number
): Date {
  return new Date(initialFailure.getTime() + (attemptCount + 1) * intervalMs);
}
