import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api';
import type { ActiveCall } from '../../shared/types';

/**
 * Connection state for the WebSocket.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const POLL_INTERVAL_MS = 2000;
const INITIAL_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

export interface UseCallStatusResult {
  calls: ActiveCall[];
  connectionStatus: ConnectionStatus;
  error: string | null;
  isLoading: boolean;
}

/**
 * Custom hook that provides real-time call status updates via WebSocket
 * with automatic fallback to REST polling on disconnect.
 *
 * Features:
 * - WebSocket connection to /api/calls/active
 * - Parses incoming JSON messages as ActiveCall[]
 * - On disconnect: starts polling fallback (2s interval via REST)
 * - On reconnect: stops polling, resumes WebSocket
 * - Exponential backoff for reconnection (2s, 4s, 8s, max 30s)
 * - Cleanup on unmount (close WS, clear intervals/timeouts)
 *
 * @returns {UseCallStatusResult} Real-time call data with connection state
 */
export function useCallStatus(): UseCallStatusResult {
  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);

  /**
   * Fetch active calls via REST API (fallback polling).
   */
  const fetchCalls = useCallback(async () => {
    try {
      const response = await apiClient.get<ActiveCall[]>('/calls/active');
      if (mountedRef.current) {
        setCalls(response.data);
        setError(null);
        setIsLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setError('Failed to load call data');
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Start fallback polling every 2 seconds.
   */
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    fetchCalls();
    pollIntervalRef.current = setInterval(fetchCalls, POLL_INTERVAL_MS);
  }, [fetchCalls]);

  /**
   * Stop fallback polling.
   */
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  /**
   * Connect to the WebSocket for real-time call updates.
   */
  const connectWebSocket = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/calls/active`;

    setConnectionStatus('connecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      setConnectionStatus('connected');
      setError(null);
      stopPolling();
      // Reset backoff on successful connection
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data) as ActiveCall[];
        setCalls(data);
        setIsLoading(false);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setConnectionStatus('disconnected');
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionStatus('disconnected');
      wsRef.current = null;

      // Start polling as fallback
      startPolling();

      // Schedule reconnection with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectWebSocket();
        }
      }, delay);

      // Increase delay for next attempt (exponential backoff, capped at max)
      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * 2,
        MAX_RECONNECT_DELAY_MS
      );
    };
  }, [startPolling, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;

    // Initial data fetch
    fetchCalls();

    // Attempt WebSocket connection
    connectWebSocket();

    return () => {
      mountedRef.current = false;

      // Cleanup WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Cleanup polling
      stopPolling();

      // Cleanup reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [fetchCalls, connectWebSocket, stopPolling]);

  return { calls, connectionStatus, error, isLoading };
}
