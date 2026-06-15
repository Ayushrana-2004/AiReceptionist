/**
 * Capacity Validator Module
 *
 * Enforces system capacity limits:
 * - 500 KB entries total per business
 * - 100 KB entries per category
 * - 50 routing rules per business
 * - 3 destinations per routing rule
 * - 10 qualification criteria per category
 *
 * Validates: Requirements 3.4, 4.2, 5.3
 */

export interface CapacityValidationError {
  field: string;
  message: string;
  maxAllowed: number;
  currentCount: number;
}

export interface CapacityValidationResult {
  valid: boolean;
  error?: CapacityValidationError;
}

// Capacity constants
export const CAPACITY_LIMITS = {
  KB_ENTRIES_TOTAL: 500,
  KB_ENTRIES_PER_CATEGORY: 100,
  ROUTING_RULES_PER_BUSINESS: 50,
  DESTINATIONS_PER_ROUTING_RULE: 3,
  QUALIFICATION_CRITERIA_PER_CATEGORY: 10,
} as const;

/**
 * Checks whether a new KB entry can be added given the current total
 * count and the current count within the target category.
 *
 * @param currentTotal - Total KB entries currently stored for the business
 * @param currentCategoryCount - KB entries currently in the target category
 * @returns CapacityValidationResult indicating whether the insertion is allowed
 */
export function canAddKBEntry(
  currentTotal: number,
  currentCategoryCount: number
): CapacityValidationResult {
  if (currentTotal >= CAPACITY_LIMITS.KB_ENTRIES_TOTAL) {
    return {
      valid: false,
      error: {
        field: 'kbEntries',
        message: `Knowledge base cannot exceed ${CAPACITY_LIMITS.KB_ENTRIES_TOTAL} entries total`,
        maxAllowed: CAPACITY_LIMITS.KB_ENTRIES_TOTAL,
        currentCount: currentTotal,
      },
    };
  }

  if (currentCategoryCount >= CAPACITY_LIMITS.KB_ENTRIES_PER_CATEGORY) {
    return {
      valid: false,
      error: {
        field: 'kbCategoryEntries',
        message: `Category cannot exceed ${CAPACITY_LIMITS.KB_ENTRIES_PER_CATEGORY} entries`,
        maxAllowed: CAPACITY_LIMITS.KB_ENTRIES_PER_CATEGORY,
        currentCount: currentCategoryCount,
      },
    };
  }

  return { valid: true };
}

/**
 * Checks whether a new routing rule can be added for the business.
 *
 * @param currentCount - Routing rules currently configured for the business
 * @returns CapacityValidationResult indicating whether the insertion is allowed
 */
export function canAddRoutingRule(
  currentCount: number
): CapacityValidationResult {
  if (currentCount >= CAPACITY_LIMITS.ROUTING_RULES_PER_BUSINESS) {
    return {
      valid: false,
      error: {
        field: 'routingRules',
        message: `Cannot exceed ${CAPACITY_LIMITS.ROUTING_RULES_PER_BUSINESS} routing rules per business`,
        maxAllowed: CAPACITY_LIMITS.ROUTING_RULES_PER_BUSINESS,
        currentCount: currentCount,
      },
    };
  }

  return { valid: true };
}

/**
 * Checks whether a new destination can be added to a routing rule.
 *
 * @param currentCount - Destinations currently in the routing rule
 * @returns CapacityValidationResult indicating whether the insertion is allowed
 */
export function canAddDestination(
  currentCount: number
): CapacityValidationResult {
  if (currentCount >= CAPACITY_LIMITS.DESTINATIONS_PER_ROUTING_RULE) {
    return {
      valid: false,
      error: {
        field: 'destinations',
        message: `Cannot exceed ${CAPACITY_LIMITS.DESTINATIONS_PER_ROUTING_RULE} destinations per routing rule`,
        maxAllowed: CAPACITY_LIMITS.DESTINATIONS_PER_ROUTING_RULE,
        currentCount: currentCount,
      },
    };
  }

  return { valid: true };
}

/**
 * Checks whether a new qualification criteria entry can be added to a category.
 *
 * @param currentCategoryCount - Criteria entries currently in the target category
 * @returns CapacityValidationResult indicating whether the insertion is allowed
 */
export function canAddQualificationCriteria(
  currentCategoryCount: number
): CapacityValidationResult {
  if (currentCategoryCount >= CAPACITY_LIMITS.QUALIFICATION_CRITERIA_PER_CATEGORY) {
    return {
      valid: false,
      error: {
        field: 'qualificationCriteria',
        message: `Cannot exceed ${CAPACITY_LIMITS.QUALIFICATION_CRITERIA_PER_CATEGORY} qualification criteria per category`,
        maxAllowed: CAPACITY_LIMITS.QUALIFICATION_CRITERIA_PER_CATEGORY,
        currentCount: currentCategoryCount,
      },
    };
  }

  return { valid: true };
}
