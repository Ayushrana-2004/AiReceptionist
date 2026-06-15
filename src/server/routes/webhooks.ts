import { Router, Request, Response } from 'express';
import {
  VapiCallStartEvent,
  VapiCallEndEvent,
  VapiToolCallEvent,
} from '../../shared/types';
import { publish, CHANNELS } from '../db/redis';
import { ICallManager } from '../services/callManager';

/**
 * Vapi webhook routes.
 *
 * These endpoints receive call lifecycle events from Vapi:
 * - call-start: New inbound call received
 * - call-end: Call has ended, includes transcript
 * - tool-call: LLM requested a tool execution (booking, routing, lead capture)
 *
 * Authentication: These routes skip JWT auth (handled by Vapi signature
 * verification). TODO: Implement Vapi signature verification middleware
 * to validate X-Vapi-Signature header against shared secret.
 *
 * Design: Respond quickly with 200 OK and emit events on Redis pub/sub
 * for async processing (lead capture, SMS, summary generation).
 */
export function createWebhookRouter(callManager: ICallManager): Router {
  const router = Router();

  /**
   * POST /api/webhooks/vapi/call-start
   *
   * Handles the call-start webhook from Vapi. Creates a new call session,
   * loads business config, and tracks concurrency.
   *
   * Validates: Requirements 1.1, 1.4
   */
  router.post('/vapi/call-start', async (req: Request, res: Response) => {
    try {
      const event: VapiCallStartEvent = {
        callId: req.body.callId,
        from: req.body.from,
        to: req.body.to,
        timestamp: req.body.timestamp,
        assistantId: req.body.assistantId,
      };

      // Validate required fields
      if (!event.callId || !event.from || !event.to || !event.timestamp || !event.assistantId) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: callId, from, to, timestamp, assistantId',
        });
        return;
      }

      // Respond immediately to avoid Vapi timeout
      res.status(200).json({ status: 'accepted' });

      // Dispatch to call manager asynchronously
      await callManager.handleCallStart(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Webhook] call-start error:', message);
      // If we haven't sent a response yet, send error
      if (!res.headersSent) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Failed to process call-start event',
        });
      }
    }
  });

  /**
   * POST /api/webhooks/vapi/call-end
   *
   * Handles the call-end webhook from Vapi. Stores call record,
   * cleans up tracking, and emits events for async processing
   * (summary generation, lead capture, SMS follow-ups).
   *
   * Validates: Requirements 7.1, 7.2
   */
  router.post('/vapi/call-end', async (req: Request, res: Response) => {
    try {
      const event: VapiCallEndEvent = {
        callId: req.body.callId,
        duration: req.body.duration,
        transcript: req.body.transcript || [],
        endReason: req.body.endReason,
        timestamp: req.body.timestamp,
      };

      // Validate required fields
      if (!event.callId || event.duration === undefined || !event.timestamp) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: callId, duration, timestamp',
        });
        return;
      }

      // Respond immediately to avoid Vapi timeout
      res.status(200).json({ status: 'accepted' });

      // Dispatch to call manager asynchronously
      await callManager.handleCallEnd(event);

      // Emit events for async processing (summary generation, SMS follow-up)
      await publish(CHANNELS.SMS_QUEUED, {
        callId: event.callId,
        duration: event.duration,
        endReason: event.endReason,
        timestamp: event.timestamp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Webhook] call-end error:', message);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Failed to process call-end event',
        });
      }
    }
  });

  /**
   * POST /api/webhooks/vapi/tool-call
   *
   * Handles tool-call webhooks from Vapi. The LLM has decided to invoke
   * a tool (booking, routing, lead capture). Dispatches to the appropriate
   * service and returns the result for the LLM to use.
   *
   * Validates: Requirements 1.4, 7.1
   */
  router.post('/vapi/tool-call', async (req: Request, res: Response) => {
    try {
      const event: VapiToolCallEvent = {
        callId: req.body.callId,
        toolName: req.body.toolName,
        parameters: req.body.parameters || {},
        timestamp: req.body.timestamp,
      };

      // Validate required fields
      if (!event.callId || !event.toolName || !event.timestamp) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: callId, toolName, timestamp',
        });
        return;
      }

      // Tool calls need a synchronous response so Vapi can relay results to the LLM
      const result = await callManager.handleToolCall(event);

      // Emit event for async lead capture processing if relevant
      if (event.toolName === 'capture_lead' && result.success) {
        await publish(CHANNELS.LEAD_CAPTURED, {
          callId: event.callId,
          toolName: event.toolName,
          data: result.data,
          timestamp: event.timestamp,
        });
      }

      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Webhook] tool-call error:', message);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Failed to process tool-call event',
        });
      }
    }
  });

  /**
   * POST /api/webhooks/vapi (root)
   *
   * Handles ALL Vapi webhook events in their native format.
   * Vapi sends { message: { type: "tool-calls", toolCalls: [...] } }
   * This is the main entry point Vapi uses for server-side tool execution.
   */
  router.post('/vapi', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Missing message field' });
        return;
      }

      // Handle tool-calls from Vapi
      if (message.type === 'tool-calls') {
        const toolCalls = message.toolCalls || message.toolCallList || [];
        const results = [];

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function?.name;
          const parameters = toolCall.function?.arguments || {};
          const toolCallId = toolCall.id;

          if (!toolName) continue;

          const event: VapiToolCallEvent = {
            callId: toolCallId || `call_${Date.now()}`,
            toolName,
            parameters,
            timestamp: new Date(message.timestamp || Date.now()).toISOString(),
          };

          const result = await callManager.handleToolCall(event);

          results.push({
            toolCallId,
            result: result.success
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error || 'Tool call failed' }),
          });
        }

        // Vapi expects { results: [{ toolCallId, result }] }
        res.status(200).json({ results });
        return;
      }

      // Handle other message types (status-update, end-of-call-report, etc.)
      console.log(`[Webhook] Received message type: ${message.type}`);
      res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Webhook] vapi error:', message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
