/**
 * Feature: ai-receptionist, Property 7: Call routing follows priority-ordered fallback
 *
 * Validates: Requirements 4.4
 *
 * For any routing rule configuration with N destinations (1 ≤ N ≤ 3) and a sequence
 * of destination availability states, the Call_Router SHALL attempt destinations in
 * priority order, advancing to the next only when the current is unavailable, and
 * SHALL never exceed 3 total attempts.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  CallRoutingService,
  ITelephonyAdapter,
  IRoutingRuleRepository,
  IOwnerNotifier,
} from './callRouter';
import { TransferDestination } from '../../shared/types';
import { TransferDestinationType } from '../../shared/types/enums';

// --- No-op adapters for testing ---

const noOpTelephonyAdapter: ITelephonyAdapter = {
  async transfer() {
    return false;
  },
};

const noOpRoutingRuleRepo: IRoutingRuleRepository = {
  async findByIntentAndBusiness() {
    return [];
  },
};

const noOpOwnerNotifier: IOwnerNotifier = {
  async notifyTransferFailure() {},
};

// --- Generators ---

const destinationTypeArb: fc.Arbitrary<TransferDestinationType> = fc.constantFrom(
  'phone',
  'sip',
  'queue',
);

const transferDestinationArb: fc.Arbitrary<TransferDestination> = fc.record({
  type: destinationTypeArb,
  target: fc.stringMatching(/^\+1[0-9]{10}$/),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  timeoutSeconds: fc.integer({ min: 5, max: 30 }),
});

/**
 * Generates a list of 1–3 transfer destinations representing a routing config.
 */
const destinationsArb: fc.Arbitrary<TransferDestination[]> = fc.array(transferDestinationArb, {
  minLength: 1,
  maxLength: 3,
});

const callIdArb = fc.uuid();
const businessIdArb = fc.uuid();
const intentCategoryArb = fc.constantFrom('sales', 'support', 'billing', 'emergency');

// --- Tests ---

describe('Property 7: Call routing follows priority-ordered fallback', () => {
  it('handleTransferFailure returns destinations in sequential index order', async () => {
    await fc.assert(
      fc.asyncProperty(
        callIdArb,
        businessIdArb,
        intentCategoryArb,
        destinationsArb,
        async (callId, businessId, intentCategory, destinations) => {
          const service = new CallRoutingService(
            noOpTelephonyAdapter,
            noOpRoutingRuleRepo,
            noOpOwnerNotifier,
          );

          // Register session with the given destinations
          service.registerSession(callId, businessId, intentCategory, destinations);

          // For each attempt index from 0 to destinations.length-1 (but < 3),
          // handleTransferFailure(callId, attempt) should return the destination at that index
          for (let attempt = 0; attempt < Math.min(destinations.length, 3); attempt++) {
            const result = await service.handleTransferFailure(callId, attempt);
            expect(result.type).toBe('next_destination');
            expect(result.nextDestination).toEqual(destinations[attempt]);
            expect(result.attempt).toBe(attempt);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns voicemail fallback after 3 attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        callIdArb,
        businessIdArb,
        intentCategoryArb,
        destinationsArb,
        async (callId, businessId, intentCategory, destinations) => {
          const service = new CallRoutingService(
            noOpTelephonyAdapter,
            noOpRoutingRuleRepo,
            noOpOwnerNotifier,
          );

          service.registerSession(callId, businessId, intentCategory, destinations);

          // Attempt 3 (the max) should always result in voicemail
          const result = await service.handleTransferFailure(callId, 3);
          expect(result.type).toBe('voicemail');
          expect(result.attempt).toBe(3);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns voicemail when destinations are exhausted before 3 attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        callIdArb,
        businessIdArb,
        intentCategoryArb,
        // Generate 1 or 2 destinations to test exhaustion before max
        fc.array(transferDestinationArb, { minLength: 1, maxLength: 2 }),
        async (callId, businessId, intentCategory, destinations) => {
          const service = new CallRoutingService(
            noOpTelephonyAdapter,
            noOpRoutingRuleRepo,
            noOpOwnerNotifier,
          );

          service.registerSession(callId, businessId, intentCategory, destinations);

          // Attempt beyond the destination count (but still < 3)
          // e.g. if 1 destination, attempt=1 should fallback to voicemail
          const exhaustionAttempt = destinations.length;
          if (exhaustionAttempt < 3) {
            const result = await service.handleTransferFailure(callId, exhaustionAttempt);
            expect(result.type).toBe('voicemail');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('never exceeds 3 total attempts regardless of destination count', async () => {
    await fc.assert(
      fc.asyncProperty(
        callIdArb,
        businessIdArb,
        intentCategoryArb,
        destinationsArb,
        // Generate a random attempt number from 0 to 10 to cover edge cases
        fc.integer({ min: 0, max: 10 }),
        async (callId, businessId, intentCategory, destinations, attempt) => {
          const service = new CallRoutingService(
            noOpTelephonyAdapter,
            noOpRoutingRuleRepo,
            noOpOwnerNotifier,
          );

          service.registerSession(callId, businessId, intentCategory, destinations);

          const result = await service.handleTransferFailure(callId, attempt);

          // If attempt >= 3, must be voicemail (never proceed past 3)
          if (attempt >= 3) {
            expect(result.type).toBe('voicemail');
          }

          // If type is 'next_destination', attempt must be < 3
          if (result.type === 'next_destination') {
            expect(result.attempt).toBeLessThan(3);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fallback actions always have valid attempt numbers and structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        callIdArb,
        businessIdArb,
        intentCategoryArb,
        destinationsArb,
        fc.integer({ min: 0, max: 5 }),
        async (callId, businessId, intentCategory, destinations, attempt) => {
          const service = new CallRoutingService(
            noOpTelephonyAdapter,
            noOpRoutingRuleRepo,
            noOpOwnerNotifier,
          );

          service.registerSession(callId, businessId, intentCategory, destinations);

          const result = await service.handleTransferFailure(callId, attempt);

          // Result attempt should always match the input attempt
          expect(result.attempt).toBe(attempt);

          // Type must be one of the two valid fallback action types
          expect(['next_destination', 'voicemail']).toContain(result.type);

          // If next_destination, it must have a valid nextDestination
          if (result.type === 'next_destination') {
            expect(result.nextDestination).toBeDefined();
            expect(result.nextDestination!.target).toBeDefined();
            expect(result.nextDestination!.type).toBeDefined();
          }

          // callerMessage should always be present
          expect(result.callerMessage).toBeDefined();
          expect(result.callerMessage.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
