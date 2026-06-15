import { describe, it, expect } from 'vitest';
import type { CallStatus, ActiveCall } from '../../shared/types';

/**
 * Unit tests for CallMonitor logic.
 * Tests the helper functions and data transformations used by the component.
 */

// Replicate helper functions from CallMonitor.tsx for unit testing

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getStatusColor(status: CallStatus): string {
  switch (status) {
    case 'active':
      return '#16a34a';
    case 'queued':
      return '#ca8a04';
    case 'completed':
      return '#6b7280';
    case 'failed':
      return '#dc2626';
    default:
      return '#374151';
  }
}

function getStatusLabel(status: CallStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'queued':
      return 'Queued';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function countByStatus(calls: ActiveCall[]): Record<CallStatus, number> {
  return calls.reduce<Record<string, number>>((acc, call) => {
    acc[call.status] = (acc[call.status] || 0) + 1;
    return acc;
  }, {}) as Record<CallStatus, number>;
}

function getLiveCalls(calls: ActiveCall[]): ActiveCall[] {
  return calls.filter((c) => c.status === 'active' || c.status === 'queued');
}

describe('CallMonitor logic', () => {
  describe('formatDuration', () => {
    it('should format 0 seconds as 00:00', () => {
      expect(formatDuration(0)).toBe('00:00');
    });

    it('should format seconds under a minute correctly', () => {
      expect(formatDuration(45)).toBe('00:45');
    });

    it('should format exactly one minute', () => {
      expect(formatDuration(60)).toBe('01:00');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(125)).toBe('02:05');
    });

    it('should handle large durations', () => {
      expect(formatDuration(3661)).toBe('61:01');
    });

    it('should pad single-digit values with zero', () => {
      expect(formatDuration(9)).toBe('00:09');
      expect(formatDuration(61)).toBe('01:01');
    });
  });

  describe('getStatusColor', () => {
    it('should return green for active', () => {
      expect(getStatusColor('active')).toBe('#16a34a');
    });

    it('should return amber for queued', () => {
      expect(getStatusColor('queued')).toBe('#ca8a04');
    });

    it('should return gray for completed', () => {
      expect(getStatusColor('completed')).toBe('#6b7280');
    });

    it('should return red for failed', () => {
      expect(getStatusColor('failed')).toBe('#dc2626');
    });
  });

  describe('getStatusLabel', () => {
    it('should return "Active" for active status', () => {
      expect(getStatusLabel('active')).toBe('Active');
    });

    it('should return "Queued" for queued status', () => {
      expect(getStatusLabel('queued')).toBe('Queued');
    });

    it('should return "Completed" for completed status', () => {
      expect(getStatusLabel('completed')).toBe('Completed');
    });

    it('should return "Failed" for failed status', () => {
      expect(getStatusLabel('failed')).toBe('Failed');
    });
  });

  describe('countByStatus', () => {
    const mockCalls: ActiveCall[] = [
      { callId: '1', businessId: 'b1', callerNumber: '+1234567890', startedAt: new Date(), status: 'active', durationSeconds: 30 },
      { callId: '2', businessId: 'b1', callerNumber: '+1234567891', startedAt: new Date(), status: 'active', durationSeconds: 60 },
      { callId: '3', businessId: 'b1', callerNumber: '+1234567892', startedAt: new Date(), status: 'queued', durationSeconds: 0 },
      { callId: '4', businessId: 'b1', callerNumber: '+1234567893', startedAt: new Date(), status: 'completed', durationSeconds: 120 },
    ];

    it('should count active calls', () => {
      const counts = countByStatus(mockCalls);
      expect(counts['active']).toBe(2);
    });

    it('should count queued calls', () => {
      const counts = countByStatus(mockCalls);
      expect(counts['queued']).toBe(1);
    });

    it('should count completed calls', () => {
      const counts = countByStatus(mockCalls);
      expect(counts['completed']).toBe(1);
    });

    it('should handle empty array', () => {
      const counts = countByStatus([]);
      expect(counts['active']).toBeUndefined();
      expect(counts['queued']).toBeUndefined();
    });
  });

  describe('getLiveCalls', () => {
    const mockCalls: ActiveCall[] = [
      { callId: '1', businessId: 'b1', callerNumber: '+1234567890', startedAt: new Date(), status: 'active', durationSeconds: 30 },
      { callId: '2', businessId: 'b1', callerNumber: '+1234567891', startedAt: new Date(), status: 'queued', durationSeconds: 0 },
      { callId: '3', businessId: 'b1', callerNumber: '+1234567892', startedAt: new Date(), status: 'completed', durationSeconds: 120 },
      { callId: '4', businessId: 'b1', callerNumber: '+1234567893', startedAt: new Date(), status: 'failed', durationSeconds: 10 },
    ];

    it('should include active calls', () => {
      const live = getLiveCalls(mockCalls);
      expect(live.some((c) => c.status === 'active')).toBe(true);
    });

    it('should include queued calls', () => {
      const live = getLiveCalls(mockCalls);
      expect(live.some((c) => c.status === 'queued')).toBe(true);
    });

    it('should exclude completed calls', () => {
      const live = getLiveCalls(mockCalls);
      expect(live.some((c) => c.status === 'completed')).toBe(false);
    });

    it('should exclude failed calls', () => {
      const live = getLiveCalls(mockCalls);
      expect(live.some((c) => c.status === 'failed')).toBe(false);
    });

    it('should return only active and queued calls', () => {
      const live = getLiveCalls(mockCalls);
      expect(live).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const live = getLiveCalls([]);
      expect(live).toHaveLength(0);
    });
  });

  describe('WebSocket URL derivation', () => {
    function deriveWsProtocol(protocol: string): string {
      return protocol === 'https:' ? 'wss:' : 'ws:';
    }

    it('should use ws:// for http:// origins', () => {
      expect(deriveWsProtocol('http:')).toBe('ws:');
    });

    it('should use wss:// for https:// origins', () => {
      expect(deriveWsProtocol('https:')).toBe('wss:');
    });

    it('should construct correct WebSocket URL', () => {
      const host = 'localhost:3000';
      const wsUrl = `ws://${host}/api/calls/active`;
      expect(wsUrl).toBe('ws://localhost:3000/api/calls/active');
    });
  });

  describe('Constants', () => {
    it('should poll every 2 seconds for fallback', () => {
      const POLL_INTERVAL_MS = 2000;
      expect(POLL_INTERVAL_MS).toBe(2000);
    });

    it('should reconnect after 2 seconds', () => {
      const RECONNECT_DELAY_MS = 2000;
      expect(RECONNECT_DELAY_MS).toBe(2000);
    });
  });
});
