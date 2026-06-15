/**
 * Call Routing Service
 *
 * Implements ICallRoutingService for evaluating routing rules,
 * executing call transfers, and handling transfer failures.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { RoutingRule, TransferDestination } from '../../shared/types';

// --- Types ---

/**
 * The result of evaluating a routing decision for an intent/business.
 */
export interface RoutingDecision {
  /** Matched routing rule ID, or null if no rule matched */
  ruleId: string | null;
  /** Detected intent category */
  intentCategory: string;
  /** Priority-ordered list of transfer destinations */
  destinations: TransferDestination[];
  /** Context summary for the receiving agent (≤200 chars) */
  contextSummary: string;
}

/**
 * Result of a call transfer attempt.
 */
export interface TransferResult {
  /** Whether the transfer succeeded */
  success: boolean;
  /** The destination that was attempted */
  destination: TransferDestination;
  /** Duration in ms the transfer attempt took */
  durationMs: number;
  /** Error message if the transfer failed */
  error?: string;
}

/**
 * Action to take when transfer attempts are exhausted.
 */
export interface FallbackAction {
  /** Type of fallback action */
  type: 'next_destination' | 'voicemail' | 'notify_owner';
  /** Current attempt number */
  attempt: number;
  /** Next destination to try (if type is 'next_destination') */
  nextDestination?: TransferDestination;
  /** Message to relay to the caller */
  callerMessage: string;
}

/**
 * Interface for telephony provider adapter (Vapi/Twilio).
 * Used as a seam for testing.
 */
export interface ITelephonyAdapter {
  /** Attempt a call transfer to the given destination. Returns true on success. */
  transfer(callId: string, destination: TransferDestination, timeoutMs: number): Promise<boolean>;
}

/**
 * Interface for retrieving routing rules from the data layer.
 */
export interface IRoutingRuleRepository {
  /** Find active routing rules for a business and intent category, ordered by priority. */
  findByIntentAndBusiness(intentCategory: string, businessId: string): Promise<RoutingRule[]>;
}

/**
 * Interface for notifying the business owner on transfer failure.
 */
export interface IOwnerNotifier {
  /** Notify the owner that all transfer destinations failed. */
  notifyTransferFailure(businessId: string, callId: string, intentCategory: string): Promise<void>;
}

// --- Constants ---

const MAX_TRANSFER_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_CONTEXT_SUMMARY_LENGTH = 200;

// --- Context Summary ---

/**
 * Generates a context summary (≤200 characters) containing the intent category
 * and a truncated description.
 *
 * Exported for testing (Property 8).
 */
export function generateContextSummary(intentCategory: string, description: string): string {
  const prefix = `[${intentCategory}] `;

  if (prefix.length >= MAX_CONTEXT_SUMMARY_LENGTH) {
    // If the category itself is too long, truncate it to fit
    return prefix.slice(0, MAX_CONTEXT_SUMMARY_LENGTH);
  }

  const remainingSpace = MAX_CONTEXT_SUMMARY_LENGTH - prefix.length;

  if (description.length <= remainingSpace) {
    return `${prefix}${description}`;
  }

  // Truncate description with ellipsis to fit within 200 chars
  const ellipsis = '...';
  const truncatedDescription = description.slice(0, remainingSpace - ellipsis.length) + ellipsis;
  return `${prefix}${truncatedDescription}`;
}

// --- Service Implementation ---

export interface ICallRoutingService {
  evaluateRoute(intent: string, businessId: string, description?: string): Promise<RoutingDecision>;
  executeTransfer(callId: string, destination: TransferDestination): Promise<TransferResult>;
  handleTransferFailure(callId: string, attempt: number): Promise<FallbackAction>;
}

/**
 * Tracks active transfer sessions (callId -> routing state).
 */
interface TransferSession {
  callId: string;
  businessId: string;
  intentCategory: string;
  destinations: TransferDestination[];
  currentAttempt: number;
}

export class CallRoutingService implements ICallRoutingService {
  private readonly telephonyAdapter: ITelephonyAdapter;
  private readonly routingRuleRepo: IRoutingRuleRepository;
  private readonly ownerNotifier: IOwnerNotifier;

  /** Active transfer sessions indexed by callId */
  private sessions: Map<string, TransferSession> = new Map();

  constructor(
    telephonyAdapter: ITelephonyAdapter,
    routingRuleRepo: IRoutingRuleRepository,
    ownerNotifier: IOwnerNotifier,
  ) {
    this.telephonyAdapter = telephonyAdapter;
    this.routingRuleRepo = routingRuleRepo;
    this.ownerNotifier = ownerNotifier;
  }

  /**
   * Evaluate routing for a given intent category and business.
   * Returns priority-ordered destinations from matching active routing rules.
   */
  async evaluateRoute(
    intent: string,
    businessId: string,
    description: string = '',
  ): Promise<RoutingDecision> {
    const rules = await this.routingRuleRepo.findByIntentAndBusiness(intent, businessId);

    // Filter to active rules and sort by priority (lower number = higher priority)
    const activeRules = rules
      .filter((r) => r.isActive)
      .sort((a, b) => a.priority - b.priority);

    if (activeRules.length === 0) {
      return {
        ruleId: null,
        intentCategory: intent,
        destinations: [],
        contextSummary: generateContextSummary(intent, description),
      };
    }

    // Use the highest-priority rule's destinations (already ordered)
    const topRule = activeRules[0];
    const destinations = topRule.destinations.slice(0, MAX_TRANSFER_ATTEMPTS);

    // Store session for transfer tracking
    const contextSummary = generateContextSummary(intent, description);

    return {
      ruleId: topRule.id,
      intentCategory: intent,
      destinations,
      contextSummary,
    };
  }

  /**
   * Execute a call transfer to a specific destination.
   * Respects 15s timeout per destination (or the destination's configured timeout).
   */
  async executeTransfer(
    callId: string,
    destination: TransferDestination,
  ): Promise<TransferResult> {
    const timeoutMs = (destination.timeoutSeconds || 15) * 1000;
    const startTime = Date.now();

    try {
      const success = await this.telephonyAdapter.transfer(callId, destination, timeoutMs);
      const durationMs = Date.now() - startTime;

      return {
        success,
        destination,
        durationMs,
        error: success ? undefined : 'Transfer destination did not answer',
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown transfer error';

      return {
        success: false,
        destination,
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle a transfer failure by advancing to the next priority destination.
   * Max 3 attempts total. After exhausting all destinations, offers voicemail
   * and notifies the business owner.
   */
  async handleTransferFailure(
    callId: string,
    attempt: number,
  ): Promise<FallbackAction> {
    const session = this.sessions.get(callId);

    // If no session exists, we're past the max attempts
    if (!session || attempt >= MAX_TRANSFER_ATTEMPTS) {
      // All destinations exhausted — offer voicemail and notify owner
      if (session) {
        await this.ownerNotifier.notifyTransferFailure(
          session.businessId,
          callId,
          session.intentCategory,
        );
        this.sessions.delete(callId);
      }

      return {
        type: 'voicemail',
        attempt: attempt,
        callerMessage:
          'All representatives are currently unavailable. Would you like to leave a message? We will notify the team and get back to you shortly.',
      };
    }

    // Advance to the next destination in priority order
    const nextIndex = attempt; // 0-indexed: attempt 0 tried dest[0], so next is dest[attempt]
    if (nextIndex < session.destinations.length) {
      const nextDestination = session.destinations[nextIndex];
      session.currentAttempt = attempt;

      return {
        type: 'next_destination',
        attempt,
        nextDestination,
        callerMessage: 'Please hold while we connect you to another representative.',
      };
    }

    // No more destinations available even though we haven't hit max attempts
    await this.ownerNotifier.notifyTransferFailure(
      session.businessId,
      callId,
      session.intentCategory,
    );
    this.sessions.delete(callId);

    return {
      type: 'voicemail',
      attempt,
      callerMessage:
        'All representatives are currently unavailable. Would you like to leave a message? We will notify the team and get back to you shortly.',
    };
  }

  /**
   * Register a transfer session so handleTransferFailure can track state.
   * Called after evaluateRoute when a transfer flow begins.
   */
  registerSession(
    callId: string,
    businessId: string,
    intentCategory: string,
    destinations: TransferDestination[],
  ): void {
    this.sessions.set(callId, {
      callId,
      businessId,
      intentCategory,
      destinations,
      currentAttempt: 0,
    });
  }

  /**
   * Clean up a session (e.g., after successful transfer).
   */
  clearSession(callId: string): void {
    this.sessions.delete(callId);
  }
}
