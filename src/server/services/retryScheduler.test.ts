import { describe, it, expect } from 'vitest';
import {
  computeRetryTimestamps,
  isRetryExhausted,
  getNextRetryTime,
  SMS_RETRY_CONFIG,
  CRM_RETRY_CONFIG,
} from './retryScheduler';

describe('retryScheduler', () => {
  describe('SMS_RETRY_CONFIG', () => {
    it('should have 3 max attempts', () => {
      expect(SMS_RETRY_CONFIG.maxAttempts).toBe(3);
    });

    it('should have 5-minute interval', () => {
      expect(SMS_RETRY_CONFIG.intervalMs).toBe(5 * 60 * 1000);
    });
  });

  describe('CRM_RETRY_CONFIG', () => {
    it('should have 288 max attempts', () => {
      expect(CRM_RETRY_CONFIG.maxAttempts).toBe(288);
    });

    it('should have 5-minute interval', () => {
      expect(CRM_RETRY_CONFIG.intervalMs).toBe(5 * 60 * 1000);
    });

    it('should total 24 hours of retries', () => {
      const totalMs = CRM_RETRY_CONFIG.maxAttempts * CRM_RETRY_CONFIG.intervalMs;
      const totalHours = totalMs / (1000 * 60 * 60);
      expect(totalHours).toBe(24);
    });
  });

  describe('computeRetryTimestamps', () => {
    const baseTime = new Date('2024-01-15T10:00:00.000Z');
    const fiveMinMs = 5 * 60 * 1000;

    it('should return exactly maxAttempts timestamps', () => {
      const timestamps = computeRetryTimestamps(baseTime, fiveMinMs, 3);
      expect(timestamps).toHaveLength(3);
    });

    it('should space timestamps at the configured interval', () => {
      const timestamps = computeRetryTimestamps(baseTime, fiveMinMs, 3);
      expect(timestamps[0]).toEqual(new Date('2024-01-15T10:05:00.000Z'));
      expect(timestamps[1]).toEqual(new Date('2024-01-15T10:10:00.000Z'));
      expect(timestamps[2]).toEqual(new Date('2024-01-15T10:15:00.000Z'));
    });

    it('should return an empty array when maxAttempts is 0', () => {
      const timestamps = computeRetryTimestamps(baseTime, fiveMinMs, 0);
      expect(timestamps).toHaveLength(0);
    });

    it('should work with SMS retry config values', () => {
      const timestamps = computeRetryTimestamps(
        baseTime,
        SMS_RETRY_CONFIG.intervalMs,
        SMS_RETRY_CONFIG.maxAttempts
      );
      expect(timestamps).toHaveLength(3);
      // Last retry at 15 minutes after initial failure
      expect(timestamps[2].getTime() - baseTime.getTime()).toBe(15 * 60 * 1000);
    });

    it('should work with CRM retry config values', () => {
      const timestamps = computeRetryTimestamps(
        baseTime,
        CRM_RETRY_CONFIG.intervalMs,
        CRM_RETRY_CONFIG.maxAttempts
      );
      expect(timestamps).toHaveLength(288);
      // Last retry at 24 hours after initial failure
      const lastTimestamp = timestamps[287];
      expect(lastTimestamp.getTime() - baseTime.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('should produce timestamps in strictly ascending order', () => {
      const timestamps = computeRetryTimestamps(baseTime, fiveMinMs, 5);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i].getTime()).toBeGreaterThan(timestamps[i - 1].getTime());
      }
    });

    it('should handle 1ms interval', () => {
      const timestamps = computeRetryTimestamps(baseTime, 1, 3);
      expect(timestamps[0].getTime() - baseTime.getTime()).toBe(1);
      expect(timestamps[1].getTime() - baseTime.getTime()).toBe(2);
      expect(timestamps[2].getTime() - baseTime.getTime()).toBe(3);
    });
  });

  describe('isRetryExhausted', () => {
    it('should return false when attemptCount is less than maxAttempts', () => {
      expect(isRetryExhausted(0, 3)).toBe(false);
      expect(isRetryExhausted(1, 3)).toBe(false);
      expect(isRetryExhausted(2, 3)).toBe(false);
    });

    it('should return true when attemptCount equals maxAttempts', () => {
      expect(isRetryExhausted(3, 3)).toBe(true);
    });

    it('should return true when attemptCount exceeds maxAttempts', () => {
      expect(isRetryExhausted(4, 3)).toBe(true);
      expect(isRetryExhausted(100, 3)).toBe(true);
    });

    it('should return true when maxAttempts is 0', () => {
      expect(isRetryExhausted(0, 0)).toBe(true);
    });

    it('should work with SMS config values at boundary', () => {
      expect(isRetryExhausted(2, SMS_RETRY_CONFIG.maxAttempts)).toBe(false);
      expect(isRetryExhausted(3, SMS_RETRY_CONFIG.maxAttempts)).toBe(true);
    });

    it('should work with CRM config values at boundary', () => {
      expect(isRetryExhausted(287, CRM_RETRY_CONFIG.maxAttempts)).toBe(false);
      expect(isRetryExhausted(288, CRM_RETRY_CONFIG.maxAttempts)).toBe(true);
    });
  });

  describe('getNextRetryTime', () => {
    const baseTime = new Date('2024-01-15T10:00:00.000Z');
    const fiveMinMs = 5 * 60 * 1000;

    it('should return the first retry time when attemptCount is 0', () => {
      const next = getNextRetryTime(baseTime, 0, fiveMinMs);
      expect(next).toEqual(new Date('2024-01-15T10:05:00.000Z'));
    });

    it('should return the second retry time when attemptCount is 1', () => {
      const next = getNextRetryTime(baseTime, 1, fiveMinMs);
      expect(next).toEqual(new Date('2024-01-15T10:10:00.000Z'));
    });

    it('should return the third retry time when attemptCount is 2', () => {
      const next = getNextRetryTime(baseTime, 2, fiveMinMs);
      expect(next).toEqual(new Date('2024-01-15T10:15:00.000Z'));
    });

    it('should match the corresponding entry from computeRetryTimestamps', () => {
      const timestamps = computeRetryTimestamps(baseTime, fiveMinMs, 5);
      for (let i = 0; i < 5; i++) {
        const next = getNextRetryTime(baseTime, i, fiveMinMs);
        expect(next).toEqual(timestamps[i]);
      }
    });

    it('should work with large attempt counts for CRM retry', () => {
      const next = getNextRetryTime(baseTime, 287, CRM_RETRY_CONFIG.intervalMs);
      // 288th retry = 288 * 5 minutes = 1440 minutes = 24 hours
      expect(next.getTime() - baseTime.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });
});
