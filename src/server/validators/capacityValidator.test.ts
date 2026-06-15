import { describe, it, expect } from 'vitest';
import {
  canAddKBEntry,
  canAddRoutingRule,
  canAddDestination,
  canAddQualificationCriteria,
  CAPACITY_LIMITS,
} from './capacityValidator';

describe('capacityValidator', () => {
  describe('canAddKBEntry', () => {
    it('allows adding when both total and category are under limits', () => {
      const result = canAddKBEntry(0, 0);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('allows adding at total = 499 and category = 99', () => {
      const result = canAddKBEntry(499, 99);
      expect(result.valid).toBe(true);
    });

    it('rejects when total reaches 500', () => {
      const result = canAddKBEntry(500, 50);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.field).toBe('kbEntries');
      expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.KB_ENTRIES_TOTAL);
      expect(result.error!.currentCount).toBe(500);
    });

    it('rejects when category reaches 100 even if total is under 500', () => {
      const result = canAddKBEntry(200, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.field).toBe('kbCategoryEntries');
      expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.KB_ENTRIES_PER_CATEGORY);
      expect(result.error!.currentCount).toBe(100);
    });

    it('rejects with total limit error when both limits are exceeded', () => {
      const result = canAddKBEntry(500, 100);
      expect(result.valid).toBe(false);
      expect(result.error!.field).toBe('kbEntries');
    });
  });

  describe('canAddRoutingRule', () => {
    it('allows adding when under 50', () => {
      const result = canAddRoutingRule(0);
      expect(result.valid).toBe(true);
    });

    it('allows adding at 49', () => {
      const result = canAddRoutingRule(49);
      expect(result.valid).toBe(true);
    });

    it('rejects when at 50', () => {
      const result = canAddRoutingRule(50);
      expect(result.valid).toBe(false);
      expect(result.error!.field).toBe('routingRules');
      expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.ROUTING_RULES_PER_BUSINESS);
      expect(result.error!.currentCount).toBe(50);
    });

    it('rejects when above 50', () => {
      const result = canAddRoutingRule(75);
      expect(result.valid).toBe(false);
    });
  });

  describe('canAddDestination', () => {
    it('allows adding when under 3', () => {
      const result = canAddDestination(0);
      expect(result.valid).toBe(true);
    });

    it('allows adding at 2', () => {
      const result = canAddDestination(2);
      expect(result.valid).toBe(true);
    });

    it('rejects when at 3', () => {
      const result = canAddDestination(3);
      expect(result.valid).toBe(false);
      expect(result.error!.field).toBe('destinations');
      expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.DESTINATIONS_PER_ROUTING_RULE);
      expect(result.error!.currentCount).toBe(3);
    });
  });

  describe('canAddQualificationCriteria', () => {
    it('allows adding when under 10', () => {
      const result = canAddQualificationCriteria(0);
      expect(result.valid).toBe(true);
    });

    it('allows adding at 9', () => {
      const result = canAddQualificationCriteria(9);
      expect(result.valid).toBe(true);
    });

    it('rejects when at 10', () => {
      const result = canAddQualificationCriteria(10);
      expect(result.valid).toBe(false);
      expect(result.error!.field).toBe('qualificationCriteria');
      expect(result.error!.maxAllowed).toBe(CAPACITY_LIMITS.QUALIFICATION_CRITERIA_PER_CATEGORY);
      expect(result.error!.currentCount).toBe(10);
    });

    it('rejects when above 10', () => {
      const result = canAddQualificationCriteria(15);
      expect(result.valid).toBe(false);
    });
  });

  describe('CAPACITY_LIMITS constants', () => {
    it('exports correct constant values', () => {
      expect(CAPACITY_LIMITS.KB_ENTRIES_TOTAL).toBe(500);
      expect(CAPACITY_LIMITS.KB_ENTRIES_PER_CATEGORY).toBe(100);
      expect(CAPACITY_LIMITS.ROUTING_RULES_PER_BUSINESS).toBe(50);
      expect(CAPACITY_LIMITS.DESTINATIONS_PER_ROUTING_RULE).toBe(3);
      expect(CAPACITY_LIMITS.QUALIFICATION_CRITERIA_PER_CATEGORY).toBe(10);
    });
  });
});
