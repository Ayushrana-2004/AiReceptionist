/**
 * Unit tests for Call Routing Service
 *
 * Tests specific examples and edge cases for:
 * - evaluateRoute: matching intent to routing rules
 * - executeTransfer: transfer with timeout behavior
 * - handleTransferFailure: fallback to next destination, max 3 attempts
 * - generateContextSummary: ≤200 char summary generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CallRoutingService,
  generateContextSummary,
  ITelephonyAdapter,
  IRoutingRuleRepository,
  IOwnerNotifier,
} from './callRouter';
import { RoutingRule, TransferDestination } from '../../shared/types';

// --- Test helpers ---

function createMockTelephonyAdapter(
  transferResult: boolean = true,
): ITelephonyAdapter {
  return {
    transfer: vi.fn().mockResolvedValue(transferResult),
  };
}

function createMockRoutingRuleRepo(
  rules: RoutingRule[] = [],
): IRoutingRuleRepository {
  return {
    findByIntentAndBusiness: vi.fn().mockResolvedValue(rules),
  };
}

function createMockOwnerNotifier(): IOwnerNotifier {
  return {
    notifyTransferFailure: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDestination(overrides: Partial<TransferDestination> = {}): TransferDestination {
  return {
    type: 'phone',
    target: '+15551234567',
    label: 'Sales Team',
    timeoutSeconds: 15,
    ...overrides,
  };
}

function makeRoutingRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: 'rule-1',
    businessId: 'biz-1',
    intentCategory: 'sales',
    priority: 1,
    destinations: [makeDestination()],
    isActive: true,
    ...overrides,
  };
}

// --- Tests ---

describe('generateContextSummary', () => {
  it('should include intent category in brackets', () => {
    const result = generateContextSummary('sales', 'Customer wants pricing info');
    expect(result).toBe('[sales] Customer wants pricing info');
  });

  it('should not exceed 200 characters', () => {
    const longDescription = 'a'.repeat(300);
    const result = generateContextSummary('support', longDescription);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('should contain the intent category', () => {
    const result = generateContextSummary('billing', 'Wants refund');
    expect(result).toContain('billing');
  });

  it('should truncate long descriptions with ellipsis', () => {
    const longDescription = 'a'.repeat(250);
    const result = generateContextSummary('sales', longDescription);
    expect(result).toContain('...');
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('should handle empty description', () => {
    const result = generateContextSummary('emergency', '');
    expect(result).toBe('[emergency] ');
  });

  it('should handle description that exactly fills remaining space', () => {
    // prefix = "[cat] " = 6 chars, so remaining = 194
    const description = 'x'.repeat(194);
    const result = generateContextSummary('cat', description);
    expect(result.length).toBe(200);
    expect(result).not.toContain('...');
  });
});

describe('CallRoutingService', () => {
  let telephonyAdapter: ITelephonyAdapter;
  let routingRuleRepo: IRoutingRuleRepository;
  let ownerNotifier: IOwnerNotifier;
  let service: CallRoutingService;

  beforeEach(() => {
    telephonyAdapter = createMockTelephonyAdapter();
    routingRuleRepo = createMockRoutingRuleRepo();
    ownerNotifier = createMockOwnerNotifier();
    service = new CallRoutingService(telephonyAdapter, routingRuleRepo, ownerNotifier);
  });

  describe('evaluateRoute', () => {
    it('should return empty destinations when no routing rules match', async () => {
      const result = await service.evaluateRoute('sales', 'biz-1', 'Need pricing');
      expect(result.destinations).toEqual([]);
      expect(result.ruleId).toBeNull();
      expect(result.intentCategory).toBe('sales');
    });

    it('should return destinations from highest-priority active rule', async () => {
      const dest1 = makeDestination({ label: 'Primary Sales' });
      const dest2 = makeDestination({ label: 'Secondary Sales', target: '+15559999999' });
      const rules: RoutingRule[] = [
        makeRoutingRule({ id: 'rule-2', priority: 2, destinations: [dest2] }),
        makeRoutingRule({ id: 'rule-1', priority: 1, destinations: [dest1] }),
      ];
      routingRuleRepo = createMockRoutingRuleRepo(rules);
      service = new CallRoutingService(telephonyAdapter, routingRuleRepo, ownerNotifier);

      const result = await service.evaluateRoute('sales', 'biz-1', 'Pricing question');
      expect(result.ruleId).toBe('rule-1');
      expect(result.destinations).toEqual([dest1]);
    });

    it('should skip inactive rules', async () => {
      const dest = makeDestination({ label: 'Active Dest' });
      const rules: RoutingRule[] = [
        makeRoutingRule({ id: 'inactive', priority: 1, isActive: false }),
        makeRoutingRule({ id: 'active', priority: 2, destinations: [dest], isActive: true }),
      ];
      routingRuleRepo = createMockRoutingRuleRepo(rules);
      service = new CallRoutingService(telephonyAdapter, routingRuleRepo, ownerNotifier);

      const result = await service.evaluateRoute('sales', 'biz-1');
      expect(result.ruleId).toBe('active');
      expect(result.destinations).toEqual([dest]);
    });

    it('should limit destinations to max 3', async () => {
      const destinations = [
        makeDestination({ label: 'Dest 1' }),
        makeDestination({ label: 'Dest 2' }),
        makeDestination({ label: 'Dest 3' }),
        makeDestination({ label: 'Dest 4' }),
      ];
      const rules = [makeRoutingRule({ destinations })];
      routingRuleRepo = createMockRoutingRuleRepo(rules);
      service = new CallRoutingService(telephonyAdapter, routingRuleRepo, ownerNotifier);

      const result = await service.evaluateRoute('sales', 'biz-1');
      expect(result.destinations.length).toBe(3);
    });

    it('should generate context summary in the routing decision', async () => {
      const rules = [makeRoutingRule()];
      routingRuleRepo = createMockRoutingRuleRepo(rules);
      service = new CallRoutingService(telephonyAdapter, routingRuleRepo, ownerNotifier);

      const result = await service.evaluateRoute('billing', 'biz-1', 'Wants a refund for last month');
      expect(result.contextSummary).toContain('billing');
      expect(result.contextSummary.length).toBeLessThanOrEqual(200);
    });
  });

  describe('executeTransfer', () => {
    it('should return success when telephony adapter succeeds', async () => {
      const dest = makeDestination();
      const result = await service.executeTransfer('call-1', dest);
      expect(result.success).toBe(true);
      expect(result.destination).toBe(dest);
      expect(result.error).toBeUndefined();
    });

    it('should return failure when telephony adapter returns false', async () => {
      telephonyAdapter = createMockTelephonyAdapter(false);
      service = new CallRoutingService(telephonyAdapter, routingRuleRepo, ownerNotifier);

      const dest = makeDestination();
      const result = await service.executeTransfer('call-1', dest);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Transfer destination did not answer');
    });

    it('should return failure with error message when adapter throws', async () => {
      telephonyAdapter = {
        transfer: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      };
      service = new CallRoutingService(telephonyAdapter, routingRuleRepo, ownerNotifier);

      const dest = makeDestination();
      const result = await service.executeTransfer('call-1', dest);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });

    it('should use destination timeout in seconds converted to ms', async () => {
      const dest = makeDestination({ timeoutSeconds: 20 });
      await service.executeTransfer('call-1', dest);
      expect(telephonyAdapter.transfer).toHaveBeenCalledWith('call-1', dest, 20_000);
    });

    it('should default to 15s timeout when destination has no timeout', async () => {
      const dest = makeDestination({ timeoutSeconds: 0 });
      // timeoutSeconds: 0 is falsy, should fall back to 15s
      await service.executeTransfer('call-1', dest);
      expect(telephonyAdapter.transfer).toHaveBeenCalledWith('call-1', dest, 15_000);
    });
  });

  describe('handleTransferFailure', () => {
    it('should return next destination on first failure when session has multiple destinations', async () => {
      const destinations = [
        makeDestination({ label: 'Dest 1' }),
        makeDestination({ label: 'Dest 2' }),
        makeDestination({ label: 'Dest 3' }),
      ];
      service.registerSession('call-1', 'biz-1', 'sales', destinations);

      const result = await service.handleTransferFailure('call-1', 1);
      expect(result.type).toBe('next_destination');
      expect(result.nextDestination?.label).toBe('Dest 2');
      expect(result.attempt).toBe(1);
    });

    it('should return voicemail after max 3 attempts', async () => {
      const destinations = [
        makeDestination({ label: 'Dest 1' }),
        makeDestination({ label: 'Dest 2' }),
        makeDestination({ label: 'Dest 3' }),
      ];
      service.registerSession('call-1', 'biz-1', 'support', destinations);

      const result = await service.handleTransferFailure('call-1', 3);
      expect(result.type).toBe('voicemail');
      expect(result.callerMessage).toContain('unavailable');
    });

    it('should notify owner when all destinations are exhausted', async () => {
      const destinations = [makeDestination({ label: 'Only Dest' })];
      service.registerSession('call-1', 'biz-1', 'billing', destinations);

      await service.handleTransferFailure('call-1', 3);
      expect(ownerNotifier.notifyTransferFailure).toHaveBeenCalledWith(
        'biz-1',
        'call-1',
        'billing',
      );
    });

    it('should return voicemail when no session exists', async () => {
      const result = await service.handleTransferFailure('unknown-call', 0);
      expect(result.type).toBe('voicemail');
    });

    it('should return voicemail when destinations run out before max attempts', async () => {
      const destinations = [makeDestination({ label: 'Only Dest' })];
      service.registerSession('call-1', 'biz-1', 'sales', destinations);

      // attempt=1 means we already tried dest[0], next would be dest[1] which doesn't exist
      const result = await service.handleTransferFailure('call-1', 1);
      expect(result.type).toBe('voicemail');
    });

    it('should clean up session after voicemail fallback', async () => {
      const destinations = [makeDestination()];
      service.registerSession('call-1', 'biz-1', 'sales', destinations);

      await service.handleTransferFailure('call-1', 3);

      // Second call should still return voicemail (no session)
      const result = await service.handleTransferFailure('call-1', 0);
      expect(result.type).toBe('voicemail');
    });
  });

  describe('registerSession / clearSession', () => {
    it('should allow clearing a session manually', async () => {
      const destinations = [
        makeDestination({ label: 'Dest 1' }),
        makeDestination({ label: 'Dest 2' }),
      ];
      service.registerSession('call-1', 'biz-1', 'sales', destinations);
      service.clearSession('call-1');

      const result = await service.handleTransferFailure('call-1', 0);
      expect(result.type).toBe('voicemail');
    });
  });
});
