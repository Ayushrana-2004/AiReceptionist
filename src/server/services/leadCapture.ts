/**
 * Lead Capture Service
 *
 * Implements ILeadCaptureService:
 * - captureLead: collect name, phone, email, reason with format validation
 * - qualifyLead: deterministic status assignment based on configured criteria (pure function)
 * - syncToCRM: push to HubSpot/Salesforce/Zoho with field mapping
 * - getLeads: paginated lead list with filters
 * - Retry queue for failed CRM syncs (every 5 min, max 288 attempts over 24h)
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { Lead } from '../../shared/types/lead';
import { QualificationCriteria } from '../../shared/types/qualification';
import { CRMIntegration } from '../../shared/types/integrations';
import { PaginatedResult } from '../../shared/types/common';
import {
  QualificationStatus,
  CRMSyncStatus,
  CRMProvider,
} from '../../shared/types/enums';
import { isValidPhone, isValidEmail } from '../validators/formatValidator';

// ─── DTOs and Types ──────────────────────────────────────────────────────────

/**
 * Data transfer object for capturing a new lead.
 */
export interface LeadCaptureDTO {
  callId: string;
  name: string;
  phone: string;
  email?: string | null;
  reason: string;
}

/**
 * Filters for querying leads.
 */
export interface LeadFilters {
  qualificationStatus?: QualificationStatus;
  crmSyncStatus?: CRMSyncStatus;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * CRM configuration for syncing leads.
 */
export interface CRMConfig {
  provider: CRMProvider;
  accessToken: string;
  refreshToken: string;
  fieldMapping: Record<string, string>;
  isActive: boolean;
}

/**
 * Result of a CRM sync operation.
 */
export interface SyncResult {
  success: boolean;
  crmRecordId?: string;
  error?: string;
  retryQueued?: boolean;
}

/**
 * Validation error for lead capture.
 */
export interface LeadValidationError {
  field: string;
  message: string;
}

/**
 * Entry in the CRM sync retry queue.
 */
export interface RetryQueueEntry {
  leadId: string;
  lead: Lead;
  crmConfig: CRMConfig;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: Date;
  createdAt: Date;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NAME_MAX_LENGTH = 100;
const REASON_MAX_LENGTH = 500;
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 288; // 24 hours at 5-min intervals

// Qualification thresholds
const QUALIFIED_THRESHOLD = 0.7;
const UNQUALIFIED_THRESHOLD = 0.3;

// ─── Lead Qualification (Pure, Standalone Function) ──────────────────────────

/**
 * Deterministic lead qualification based on scoring criteria.
 *
 * Given lead data and an array of qualification criteria configs,
 * assigns exactly one status: 'qualified', 'unqualified', or 'needs_review'.
 *
 * Scoring algorithm:
 * 1. For each criterion, check if any of its values match the lead's reason (case-insensitive).
 * 2. If a match is found, add the criterion's weight to the total score.
 * 3. Compute normalized score = totalScore / maxPossibleScore (sum of all weights).
 * 4. Apply thresholds:
 *    - score > 0.7 → 'qualified'
 *    - score < 0.3 → 'unqualified'
 *    - otherwise → 'needs_review'
 *
 * Edge cases:
 * - If no criteria are provided, returns 'needs_review'.
 * - If maxPossibleScore is 0, returns 'needs_review'.
 *
 * This is a PURE function with no side effects.
 *
 * @param lead - The lead to qualify
 * @param criteria - Array of qualification criteria configurations
 * @returns Exactly one QualificationStatus
 */
export function qualifyLead(
  lead: Lead,
  criteria: QualificationCriteria[]
): QualificationStatus {
  if (criteria.length === 0) {
    return 'needs_review';
  }

  const maxPossibleScore = criteria.reduce((sum, c) => sum + Math.abs(c.weight), 0);

  if (maxPossibleScore === 0) {
    return 'needs_review';
  }

  let totalScore = 0;
  const leadReason = lead.reason.toLowerCase();
  const leadName = lead.name.toLowerCase();

  for (const criterion of criteria) {
    const matched = criterion.values.some((value) => {
      const lowerValue = value.toLowerCase();
      return leadReason.includes(lowerValue) || leadName.includes(lowerValue);
    });

    if (matched) {
      totalScore += Math.abs(criterion.weight);
    }
  }

  const normalizedScore = totalScore / maxPossibleScore;

  if (normalizedScore > QUALIFIED_THRESHOLD) {
    return 'qualified';
  } else if (normalizedScore < UNQUALIFIED_THRESHOLD) {
    return 'unqualified';
  } else {
    return 'needs_review';
  }
}

// ─── CRM Adapters ────────────────────────────────────────────────────────────

/**
 * CRM adapter interface for provider-specific implementations.
 */
interface CRMAdapter {
  createLead(lead: Lead, fieldMapping: Record<string, string>, accessToken: string): Promise<SyncResult>;
}

/**
 * Maps lead fields to CRM-specific field names using the field mapping config.
 */
function mapLeadFields(lead: Lead, fieldMapping: Record<string, string>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  // Default field mappings (lead field → CRM field)
  const defaultFields: Record<string, unknown> = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    reason: lead.reason,
    qualificationStatus: lead.qualificationStatus,
    createdAt: lead.createdAt,
    businessId: lead.businessId,
    callId: lead.callId,
  };

  for (const [leadField, crmField] of Object.entries(fieldMapping)) {
    if (leadField in defaultFields) {
      mapped[crmField] = defaultFields[leadField];
    }
  }

  // Include any unmapped required fields under their original names
  if (Object.keys(mapped).length === 0) {
    return defaultFields;
  }

  return mapped;
}

/**
 * HubSpot CRM adapter.
 */
const hubspotAdapter: CRMAdapter = {
  async createLead(lead: Lead, fieldMapping: Record<string, string>, accessToken: string): Promise<SyncResult> {
    const mappedData = mapLeadFields(lead, fieldMapping);

    try {
      // In production, this would make an HTTP request to HubSpot API:
      // POST https://api.hubapi.com/crm/v3/objects/contacts
      // Headers: { Authorization: `Bearer ${accessToken}` }
      // Body: { properties: mappedData }

      // For now, simulate API call
      if (!accessToken) {
        return { success: false, error: 'Missing access token for HubSpot' };
      }

      // Simulate successful CRM record creation
      const crmRecordId = `hs_${lead.id}`;
      return { success: true, crmRecordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown HubSpot API error';
      return { success: false, error: message };
    }
  },
};

/**
 * Salesforce CRM adapter.
 */
const salesforceAdapter: CRMAdapter = {
  async createLead(lead: Lead, fieldMapping: Record<string, string>, accessToken: string): Promise<SyncResult> {
    const mappedData = mapLeadFields(lead, fieldMapping);

    try {
      // In production, this would make an HTTP request to Salesforce API:
      // POST https://instance.salesforce.com/services/data/vXX.0/sobjects/Lead/
      // Headers: { Authorization: `Bearer ${accessToken}` }
      // Body: mappedData

      if (!accessToken) {
        return { success: false, error: 'Missing access token for Salesforce' };
      }

      const crmRecordId = `sf_${lead.id}`;
      return { success: true, crmRecordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Salesforce API error';
      return { success: false, error: message };
    }
  },
};

/**
 * Zoho CRM adapter.
 */
const zohoAdapter: CRMAdapter = {
  async createLead(lead: Lead, fieldMapping: Record<string, string>, accessToken: string): Promise<SyncResult> {
    const mappedData = mapLeadFields(lead, fieldMapping);

    try {
      // In production, this would make an HTTP request to Zoho CRM API:
      // POST https://www.zohoapis.com/crm/v2/Leads
      // Headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
      // Body: { data: [mappedData] }

      if (!accessToken) {
        return { success: false, error: 'Missing access token for Zoho' };
      }

      const crmRecordId = `zoho_${lead.id}`;
      return { success: true, crmRecordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Zoho API error';
      return { success: false, error: message };
    }
  },
};

/**
 * Get the appropriate CRM adapter by provider name.
 */
function getCRMAdapter(provider: CRMProvider): CRMAdapter {
  switch (provider) {
    case 'hubspot':
      return hubspotAdapter;
    case 'salesforce':
      return salesforceAdapter;
    case 'zoho':
      return zohoAdapter;
    default:
      throw new Error(`Unsupported CRM provider: ${provider}`);
  }
}

// ─── Retry Queue ─────────────────────────────────────────────────────────────

/**
 * In-memory retry queue for failed CRM syncs.
 * In production, this would be backed by Redis or a persistent store.
 */
const retryQueue: Map<string, RetryQueueEntry> = new Map();

/**
 * Add a failed sync to the retry queue.
 */
function enqueueRetry(lead: Lead, crmConfig: CRMConfig): void {
  const now = new Date();
  const entry: RetryQueueEntry = {
    leadId: lead.id,
    lead,
    crmConfig,
    attemptCount: 0,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    nextRetryAt: new Date(now.getTime() + RETRY_INTERVAL_MS),
    createdAt: now,
  };
  retryQueue.set(lead.id, entry);
}

/**
 * Get the current retry queue (for testing/monitoring).
 */
export function getRetryQueue(): Map<string, RetryQueueEntry> {
  return retryQueue;
}

/**
 * Clear the retry queue (for testing).
 */
export function clearRetryQueue(): void {
  retryQueue.clear();
}

/**
 * Process a single retry entry. Returns the sync result.
 */
async function processRetryEntry(entry: RetryQueueEntry): Promise<SyncResult> {
  const adapter = getCRMAdapter(entry.crmConfig.provider);
  const result = await adapter.createLead(
    entry.lead,
    entry.crmConfig.fieldMapping,
    entry.crmConfig.accessToken
  );

  if (result.success) {
    retryQueue.delete(entry.leadId);
    return result;
  }

  entry.attemptCount += 1;

  if (entry.attemptCount >= entry.maxAttempts) {
    retryQueue.delete(entry.leadId);
    return { success: false, error: 'Max retry attempts reached (288). Lead sync abandoned.' };
  }

  // Schedule next retry
  entry.nextRetryAt = new Date(Date.now() + RETRY_INTERVAL_MS);
  return { success: false, error: result.error, retryQueued: true };
}

/**
 * Process all due retry entries. Called on a 5-minute interval.
 */
export async function processRetryQueue(): Promise<SyncResult[]> {
  const now = new Date();
  const results: SyncResult[] = [];

  for (const [, entry] of retryQueue) {
    if (entry.nextRetryAt <= now) {
      const result = await processRetryEntry(entry);
      results.push(result);
    }
  }

  return results;
}

// ─── Lead Capture Service ────────────────────────────────────────────────────

/**
 * Validates lead capture input data.
 *
 * @returns Array of validation errors (empty if valid)
 */
export function validateLeadData(leadData: LeadCaptureDTO): LeadValidationError[] {
  const errors: LeadValidationError[] = [];

  // Validate name
  if (!leadData.name || leadData.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
  } else if (leadData.name.length > NAME_MAX_LENGTH) {
    errors.push({
      field: 'name',
      message: `Name must not exceed ${NAME_MAX_LENGTH} characters`,
    });
  }

  // Validate phone (E.164 format)
  if (!leadData.phone || leadData.phone.trim().length === 0) {
    errors.push({ field: 'phone', message: 'Phone number is required' });
  } else if (!isValidPhone(leadData.phone)) {
    errors.push({
      field: 'phone',
      message: 'Phone number must be in E.164 format (e.g., +14155551234)',
    });
  }

  // Validate email (optional, but if provided must be valid RFC 5322)
  if (leadData.email && leadData.email.trim().length > 0) {
    if (!isValidEmail(leadData.email.trim())) {
      errors.push({
        field: 'email',
        message: 'Email must be in valid format (e.g., user@example.com)',
      });
    }
  }

  // Validate reason
  if (!leadData.reason || leadData.reason.trim().length === 0) {
    errors.push({ field: 'reason', message: 'Reason for calling is required' });
  } else if (leadData.reason.length > REASON_MAX_LENGTH) {
    errors.push({
      field: 'reason',
      message: `Reason must not exceed ${REASON_MAX_LENGTH} characters`,
    });
  }

  // Validate callId
  if (!leadData.callId || leadData.callId.trim().length === 0) {
    errors.push({ field: 'callId', message: 'Call ID is required' });
  }

  return errors;
}

/**
 * Captures a new lead with input validation.
 *
 * @param businessId - The business this lead belongs to
 * @param leadData - Lead data from the call
 * @returns The created Lead record
 * @throws Error if validation fails
 */
export async function captureLead(
  businessId: string,
  leadData: LeadCaptureDTO
): Promise<Lead> {
  // Validate input
  const errors = validateLeadData(leadData);
  if (errors.length > 0) {
    const errorMessages = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`Lead validation failed: ${errorMessages}`);
  }

  // Create Lead record
  const now = new Date();
  const lead: Lead = {
    id: generateId(),
    businessId,
    callId: leadData.callId,
    name: leadData.name.trim(),
    phone: leadData.phone.trim(),
    email: leadData.email?.trim() || null,
    reason: leadData.reason.trim(),
    qualificationStatus: 'needs_review', // Default until qualifyLead is called
    crmSyncStatus: 'pending',
    crmRecordId: null,
    createdAt: now,
    updatedAt: now,
  };

  // In production, persist to database here
  return lead;
}

/**
 * Syncs a lead record to the configured CRM using the adapter pattern.
 *
 * If sync fails, the lead is queued for retry (every 5 min, max 288 attempts over 24h).
 *
 * @param lead - The lead to sync
 * @param crmConfig - CRM configuration with provider, credentials, and field mapping
 * @returns SyncResult indicating success or failure with retry status
 */
export async function syncToCRM(lead: Lead, crmConfig: CRMConfig): Promise<SyncResult> {
  if (!crmConfig.isActive) {
    return { success: false, error: 'CRM integration is not active' };
  }

  try {
    const adapter = getCRMAdapter(crmConfig.provider);
    const result = await adapter.createLead(
      lead,
      crmConfig.fieldMapping,
      crmConfig.accessToken
    );

    if (result.success) {
      return result;
    }

    // Sync failed — queue for retry
    enqueueRetry(lead, crmConfig);
    return { success: false, error: result.error, retryQueued: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during CRM sync';

    // Queue for retry on unexpected errors
    enqueueRetry(lead, crmConfig);
    return { success: false, error: message, retryQueued: true };
  }
}

/**
 * Returns a paginated list of leads for a business, filtered by the provided criteria.
 * Results are sorted by most recent first (createdAt descending).
 *
 * @param businessId - The business to fetch leads for
 * @param filters - Optional filters for qualification status, CRM sync status, date range
 * @param allLeads - The full set of leads (in production, this comes from the database)
 * @returns PaginatedResult containing the filtered, sorted, paginated leads
 */
export function getLeads(
  businessId: string,
  filters: LeadFilters,
  allLeads: Lead[]
): PaginatedResult<Lead> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  // Filter leads for the business
  let filtered = allLeads.filter((lead) => lead.businessId === businessId);

  // Apply qualification status filter
  if (filters.qualificationStatus) {
    filtered = filtered.filter(
      (lead) => lead.qualificationStatus === filters.qualificationStatus
    );
  }

  // Apply CRM sync status filter
  if (filters.crmSyncStatus) {
    filtered = filtered.filter(
      (lead) => lead.crmSyncStatus === filters.crmSyncStatus
    );
  }

  // Apply date range filter
  if (filters.fromDate) {
    filtered = filtered.filter((lead) => lead.createdAt >= filters.fromDate!);
  }
  if (filters.toDate) {
    filtered = filtered.filter((lead) => lead.createdAt <= filters.toDate!);
  }

  // Sort by most recent first
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Paginate
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const items = filtered.slice(startIndex, endIndex);

  return {
    items,
    totalItems,
    totalPages,
    currentPage: page,
    pageSize,
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Generate a simple UUID-like ID.
 * In production, use a proper UUID library or database-generated IDs.
 */
function generateId(): string {
  return `lead_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
