import {
  VapiCallStartEvent,
  VapiCallEndEvent,
  VapiToolCallEvent,
  CallSession,
  ActiveCall,
  CallFilters,
  ToolCallResult,
  CallRecord,
  Business,
  PaginatedResult,
} from '../../shared/types';
import {
  redisClient,
  publish,
  CHANNELS,
  cacheSet,
  cacheGet,
  cacheDelete,
} from '../db/redis';

// Redis key patterns for call tracking
const ACTIVE_CALLS_KEY = (businessId: string) => `calls:active:${businessId}`;
const CALL_SESSION_KEY = (callId: string) => `call:session:${callId}`;
const CALL_QUEUE_KEY = (businessId: string) => `calls:queue:${businessId}`;
const GLOBAL_ACTIVE_COUNT_KEY = (businessId: string) => `calls:count:${businessId}`;

// Default maximum concurrent calls
const DEFAULT_MAX_CONCURRENT_CALLS = 50;

// Session TTL: 2 hours (max call is 30 min, but allow buffer)
const SESSION_TTL_SECONDS = 7200;

/**
 * ICallManager interface as defined in the design document.
 */
export interface ICallManager {
  handleCallStart(event: VapiCallStartEvent): Promise<CallSession>;
  handleCallEnd(event: VapiCallEndEvent): Promise<void>;
  handleToolCall(event: VapiToolCallEvent): Promise<ToolCallResult>;
  getActiveCalls(businessId: string): Promise<ActiveCall[]>;
  getCallHistory(
    businessId: string,
    filters: CallFilters
  ): Promise<PaginatedResult<CallRecord>>;
}

/**
 * Dependencies injected into the Call Manager for testability.
 */
export interface CallManagerDependencies {
  getBusinessByPhoneNumber: (phoneNumber: string) => Promise<Business | null>;
  getBusinessById: (businessId: string) => Promise<Business | null>;
  storeCallRecord: (record: Omit<CallRecord, 'id'>) => Promise<CallRecord>;
  queryCallHistory: (
    businessId: string,
    filters: CallFilters
  ) => Promise<PaginatedResult<CallRecord>>;
  dispatchBooking: (
    callId: string,
    params: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  dispatchRouting: (
    callId: string,
    params: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  dispatchLeadCapture: (
    callId: string,
    params: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
}

/**
 * Call Manager Service
 *
 * Handles Vapi webhook events for the call lifecycle:
 * - call-start: creates session, loads business config, tracks concurrency
 * - call-end: emits events, stores call record, cleans up tracking
 * - tool-call: dispatches to appropriate service (booking, routing, lead capture)
 *
 * Enforces max concurrent calls (default 50) with Redis-based tracking.
 * Excess calls are queued and processed as capacity becomes available.
 */
export class CallManager implements ICallManager {
  private deps: CallManagerDependencies;

  constructor(deps: CallManagerDependencies) {
    this.deps = deps;
  }

  /**
   * Handle call-start webhook from Vapi.
   *
   * 1. Resolve the business from the called phone number
   * 2. Check concurrent call count against business max
   * 3. If at capacity, queue the call; otherwise mark active
   * 4. Create a CallSession with the business config
   * 5. Store session in Redis for the duration of the call
   */
  async handleCallStart(event: VapiCallStartEvent): Promise<CallSession> {
    // Resolve the business configuration from the called number
    const business = await this.deps.getBusinessByPhoneNumber(event.to);
    if (!business) {
      throw new Error(
        `No business found for phone number: ${event.to}`
      );
    }

    const maxConcurrent =
      business.maxConcurrentCalls || DEFAULT_MAX_CONCURRENT_CALLS;

    // Get current active call count for this business
    const currentCount = await this.getActiveCallCount(business.id);

    // Determine call status based on capacity
    let status: 'active' | 'queued';
    if (currentCount >= maxConcurrent) {
      // Queue the call — capacity exceeded
      status = 'queued';
      await this.enqueueCall(business.id, event.callId);
    } else {
      // Track as active
      status = 'active';
      await this.incrementActiveCount(business.id);
    }

    // Create the call session
    const session: CallSession = {
      callId: event.callId,
      businessId: business.id,
      callerNumber: event.from,
      startedAt: new Date(event.timestamp),
      status,
      businessConfig: business,
      language: 'en', // Default; updated by language detection during the call
      metadata: {
        assistantId: event.assistantId,
        vapiCallId: event.callId,
      },
    };

    // Store the active call info in the business's active calls set
    const activeCall: ActiveCall = {
      callId: event.callId,
      businessId: business.id,
      callerNumber: event.from,
      startedAt: session.startedAt,
      status,
      durationSeconds: 0,
    };

    await cacheSet(
      CALL_SESSION_KEY(event.callId),
      session,
      SESSION_TTL_SECONDS
    );

    // Add to the business's active calls hash
    await redisClient.hset(
      ACTIVE_CALLS_KEY(business.id),
      event.callId,
      JSON.stringify(activeCall)
    );

    // Publish call started event
    await publish(CHANNELS.CALL_STARTED, {
      callId: event.callId,
      businessId: business.id,
      callerNumber: event.from,
      status,
      timestamp: event.timestamp,
    });

    return session;
  }

  /**
   * Handle call-end webhook from Vapi.
   *
   * 1. Load the session from Redis
   * 2. Remove from active tracking
   * 3. Decrement active count
   * 4. Process any queued calls (promote next in queue)
   * 5. Store the call record in the database
   * 6. Emit CALL_ENDED event on Redis pub/sub
   * 7. Clean up session data
   */
  async handleCallEnd(event: VapiCallEndEvent): Promise<void> {
    // Load the call session
    const session = await cacheGet<CallSession>(
      CALL_SESSION_KEY(event.callId)
    );

    if (!session) {
      throw new Error(`No session found for call: ${event.callId}`);
    }

    // Remove from active calls tracking
    await redisClient.hdel(
      ACTIVE_CALLS_KEY(session.businessId),
      event.callId
    );

    // Decrement active count if call was active (not queued)
    if (session.status === 'active') {
      await this.decrementActiveCount(session.businessId);
    }

    // Promote next queued call if any
    await this.promoteQueuedCall(session.businessId);

    // Build and store the call record
    const callRecord: Omit<CallRecord, 'id'> = {
      businessId: session.businessId,
      callerNumber: session.callerNumber,
      startedAt: session.startedAt,
      endedAt: new Date(event.timestamp),
      durationSeconds: event.duration,
      status: 'completed',
      outcomeCategory: '', // Will be classified by summary service
      summaryText: null,
      transcriptUrl: null,
      intentClassification: '',
      language: session.language,
      metadata: {
        vapiCallId: event.callId,
        assistantId: session.metadata.assistantId,
        transferAttempts: 0,
        sttFailures: 0,
        languageDetected: session.language,
        toolCallsMade: [],
      },
    };

    const storedRecord = await this.deps.storeCallRecord(callRecord);

    // Emit CALL_ENDED event for async processing (summary, lead capture, SMS)
    await publish(CHANNELS.CALL_ENDED, {
      callId: event.callId,
      businessId: session.businessId,
      callRecordId: storedRecord.id,
      callerNumber: session.callerNumber,
      duration: event.duration,
      transcript: event.transcript,
      endReason: event.endReason,
      timestamp: event.timestamp,
    });

    // Clean up session from Redis
    await cacheDelete(CALL_SESSION_KEY(event.callId));
  }

  /**
   * Handle tool-call webhook from Vapi.
   *
   * Dispatches to the appropriate service based on toolName:
   * - check_availability, book_appointment → Booking/Scheduler service
   * - transfer_call → Routing service
   * - capture_lead → Lead Capture service
   */
  async handleToolCall(event: VapiToolCallEvent): Promise<ToolCallResult> {
    const { callId, toolName, parameters } = event;

    try {
      let data: Record<string, unknown>;

      switch (toolName) {
        case 'check_availability':
        case 'book_appointment':
        case 'cancel_appointment':
          data = await this.deps.dispatchBooking(callId, {
            action: toolName,
            ...parameters,
          });
          break;

        case 'transfer_call':
          data = await this.deps.dispatchRouting(callId, parameters);
          break;

        case 'capture_lead':
          data = await this.deps.dispatchLeadCapture(callId, parameters);
          break;

        default:
          return {
            success: false,
            toolName,
            data: {},
            error: `Unknown tool: ${toolName}`,
          };
      }

      return {
        success: true,
        toolName,
        data,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        toolName,
        data: {},
        error: errorMessage,
      };
    }
  }

  /**
   * Get currently active calls for a business from Redis.
   */
  async getActiveCalls(businessId: string): Promise<ActiveCall[]> {
    const callsMap = await redisClient.hgetall(
      ACTIVE_CALLS_KEY(businessId)
    );

    const activeCalls: ActiveCall[] = [];
    const now = Date.now();

    for (const [, value] of Object.entries(callsMap)) {
      try {
        const call = JSON.parse(value) as ActiveCall;
        // Update duration dynamically
        call.durationSeconds = Math.floor(
          (now - new Date(call.startedAt).getTime()) / 1000
        );
        activeCalls.push(call);
      } catch {
        // Skip malformed entries
      }
    }

    return activeCalls;
  }

  /**
   * Get call history for a business with filtering and pagination.
   * Delegates to the data layer for PostgreSQL queries.
   */
  async getCallHistory(
    businessId: string,
    filters: CallFilters
  ): Promise<PaginatedResult<CallRecord>> {
    return this.deps.queryCallHistory(businessId, filters);
  }

  // ============================================================
  // Private helpers for concurrent call tracking
  // ============================================================

  /**
   * Get the current active call count for a business.
   */
  private async getActiveCallCount(businessId: string): Promise<number> {
    const count = await redisClient.get(GLOBAL_ACTIVE_COUNT_KEY(businessId));
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Increment the active call count for a business.
   */
  private async incrementActiveCount(businessId: string): Promise<void> {
    await redisClient.incr(GLOBAL_ACTIVE_COUNT_KEY(businessId));
  }

  /**
   * Decrement the active call count for a business.
   */
  private async decrementActiveCount(businessId: string): Promise<void> {
    const result = await redisClient.decr(
      GLOBAL_ACTIVE_COUNT_KEY(businessId)
    );
    // Ensure count never goes below 0
    if (result < 0) {
      await redisClient.set(GLOBAL_ACTIVE_COUNT_KEY(businessId), '0');
    }
  }

  /**
   * Add a call to the overflow queue when capacity is exceeded.
   */
  private async enqueueCall(
    businessId: string,
    callId: string
  ): Promise<void> {
    await redisClient.rpush(CALL_QUEUE_KEY(businessId), callId);
  }

  /**
   * Promote the next queued call to active status when capacity frees up.
   */
  private async promoteQueuedCall(businessId: string): Promise<void> {
    const nextCallId = await redisClient.lpop(CALL_QUEUE_KEY(businessId));
    if (!nextCallId) return;

    // Load the queued call's session and update its status
    const session = await cacheGet<CallSession>(
      CALL_SESSION_KEY(nextCallId)
    );
    if (session) {
      session.status = 'active';
      await cacheSet(
        CALL_SESSION_KEY(nextCallId),
        session,
        SESSION_TTL_SECONDS
      );

      // Update the active call entry
      const activeCallData = await redisClient.hget(
        ACTIVE_CALLS_KEY(businessId),
        nextCallId
      );
      if (activeCallData) {
        const activeCall = JSON.parse(activeCallData) as ActiveCall;
        activeCall.status = 'active';
        await redisClient.hset(
          ACTIVE_CALLS_KEY(businessId),
          nextCallId,
          JSON.stringify(activeCall)
        );
      }

      // Increment the active count for the promoted call
      await this.incrementActiveCount(businessId);
    }
  }
}
