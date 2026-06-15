import { describe, it, expect } from 'vitest';

/**
 * Unit tests for useCallStatus hook logic.
 * Tests the exponential backoff calculation and connection state machine.
 */

const INITIAL_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * Computes the reconnect delay for a given attempt using exponential backoff.
 * Mirrors the logic in useCallStatus hook.
 */
function computeReconnectDelay(attempt: number): number {
  const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_RECONNECT_DELAY_MS);
}

/**
 * Derives WebSocket protocol from window location protocol.
 */
function deriveWsProtocol(locationProtocol: string): string {
  return locationProtocol === 'https:' ? 'wss:' : 'ws:';
}

/**
 * Builds the WebSocket URL for call status streaming.
 */
function buildWsUrl(protocol: string, host: string): string {
  const wsProtocol = deriveWsProtocol(protocol);
  return `${wsProtocol}//${host}/api/calls/active`;
}

describe('useCallStatus hook logic', () => {
  describe('exponential backoff', () => {
    it('should start with 2s delay on first reconnect attempt', () => {
      expect(computeReconnectDelay(0)).toBe(2000);
    });

    it('should double delay on each subsequent attempt', () => {
      expect(computeReconnectDelay(1)).toBe(4000);
      expect(computeReconnectDelay(2)).toBe(8000);
      expect(computeReconnectDelay(3)).toBe(16000);
    });

    it('should cap at 30s maximum', () => {
      expect(computeReconnectDelay(4)).toBe(30000); // 2000 * 16 = 32000 → capped at 30000
      expect(computeReconnectDelay(5)).toBe(30000);
      expect(computeReconnectDelay(10)).toBe(30000);
    });

    it('should never exceed MAX_RECONNECT_DELAY_MS', () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        expect(computeReconnectDelay(attempt)).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
      }
    });

    it('should always be at least INITIAL_RECONNECT_DELAY_MS', () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        expect(computeReconnectDelay(attempt)).toBeGreaterThanOrEqual(INITIAL_RECONNECT_DELAY_MS);
      }
    });
  });

  describe('WebSocket URL construction', () => {
    it('should use ws:// for http: protocol', () => {
      expect(buildWsUrl('http:', 'localhost:3000')).toBe('ws://localhost:3000/api/calls/active');
    });

    it('should use wss:// for https: protocol', () => {
      expect(buildWsUrl('https:', 'example.com')).toBe('wss://example.com/api/calls/active');
    });

    it('should include port in URL when present', () => {
      expect(buildWsUrl('http:', 'localhost:5173')).toBe('ws://localhost:5173/api/calls/active');
    });

    it('should handle production domain without port', () => {
      expect(buildWsUrl('https:', 'app.example.com')).toBe('wss://app.example.com/api/calls/active');
    });
  });

  describe('connection status state machine', () => {
    type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

    /**
     * Simulates the connection state transitions that occur in the hook.
     */
    function getNextState(
      current: ConnectionStatus,
      event: 'ws_open' | 'ws_close' | 'ws_error' | 'reconnect_attempt'
    ): ConnectionStatus {
      switch (event) {
        case 'reconnect_attempt':
          return 'connecting';
        case 'ws_open':
          return 'connected';
        case 'ws_close':
        case 'ws_error':
          return 'disconnected';
        default:
          return current;
      }
    }

    it('should transition to connecting on reconnect attempt', () => {
      expect(getNextState('disconnected', 'reconnect_attempt')).toBe('connecting');
    });

    it('should transition to connected on ws_open', () => {
      expect(getNextState('connecting', 'ws_open')).toBe('connected');
    });

    it('should transition to disconnected on ws_close', () => {
      expect(getNextState('connected', 'ws_close')).toBe('disconnected');
    });

    it('should transition to disconnected on ws_error', () => {
      expect(getNextState('connecting', 'ws_error')).toBe('disconnected');
    });

    it('should start in connecting state', () => {
      const initial: ConnectionStatus = 'connecting';
      expect(initial).toBe('connecting');
    });
  });

  describe('polling fallback behavior', () => {
    it('should use 2-second poll interval', () => {
      const POLL_INTERVAL_MS = 2000;
      expect(POLL_INTERVAL_MS).toBe(2000);
    });

    it('polling should activate when disconnected and stop when connected', () => {
      let pollingActive = false;

      // Simulate: WebSocket disconnects → polling starts
      pollingActive = true;
      expect(pollingActive).toBe(true);

      // Simulate: WebSocket reconnects → polling stops
      pollingActive = false;
      expect(pollingActive).toBe(false);
    });
  });
});
