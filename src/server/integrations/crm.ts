/**
 * CRM Integration Service
 *
 * Implements CRM integrations for HubSpot, Salesforce, and Zoho using the adapter pattern.
 * - OAuth2 token refresh for all providers
 * - Lead creation and updates with configurable field mapping
 * - Retry queue backed by Redis (288 attempts over 24h at 5-min intervals)
 *
 * Validates: Requirements 5.5, 5.6
 */

import { Lead } from '../../shared/types/lead';
import { CRMProvider } from '../../shared/types/enums';
import { CRMIntegration } from '../../shared/types/integrations';
import { redisClient } from '../db/redis';

// ─── Constants ───────────────────────────────────────────────────────────────

const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 288; // 24 hours at 5-min intervals
const HTTP_TIMEOUT_MS = 10_000; // 10 second timeout for external calls
const RETRY_QUEUE_PREFIX = 'crm:retry:';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * CRM adapter interface defining required methods for each provider.
 */
export interface ICRMAdapter {
  /** Refresh the OAuth2 access token using the refresh token. */
  authenticate(refreshToken: string): Promise<AuthResult>;

  /** Create a new lead record in the CRM. */
  createLead(
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult>;

  /** Update an existing lead record in the CRM. */
  updateLead(
    crmRecordId: string,
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult>;

  /** Test that the CRM connection is valid. */
  testConnection(accessToken: string): Promise<ConnectionTestResult>;
}

/**
 * Result of an OAuth2 token refresh.
 */
export interface AuthResult {
  success: boolean;
  accessToken?: string;
  expiresIn?: number; // seconds until expiry
  error?: string;
}

/**
 * Result of a CRM create/update operation.
 */
export interface CRMOperationResult {
  success: boolean;
  crmRecordId?: string;
  error?: string;
}

/**
 * Result of a connection test.
 */
export interface ConnectionTestResult {
  success: boolean;
  providerName?: string;
  error?: string;
}

/**
 * Entry stored in the Redis-backed retry queue.
 */
export interface CRMRetryEntry {
  id: string;
  leadId: string;
  lead: Lead;
  integration: CRMIntegration;
  operation: 'create' | 'update';
  crmRecordId?: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: number; // epoch ms
  createdAt: number; // epoch ms
  lastError?: string;
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Performs a fetch request with a timeout.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = HTTP_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Maps lead fields to CRM-specific field names using the configured field mapping.
 * If the field mapping is empty, returns default lead fields.
 */
export function mapLeadFields(
  lead: Lead,
  fieldMapping: Record<string, string>
): Record<string, unknown> {
  const sourceFields: Record<string, unknown> = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    reason: lead.reason,
    qualificationStatus: lead.qualificationStatus,
    createdAt: lead.createdAt,
    businessId: lead.businessId,
    callId: lead.callId,
  };

  if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
    return sourceFields;
  }

  const mapped: Record<string, unknown> = {};
  for (const [leadField, crmField] of Object.entries(fieldMapping)) {
    if (leadField in sourceFields) {
      mapped[crmField] = sourceFields[leadField];
    }
  }

  return Object.keys(mapped).length > 0 ? mapped : sourceFields;
}

// ─── HubSpot Adapter ─────────────────────────────────────────────────────────

/**
 * HubSpot CRM adapter implementing OAuth2 and Contacts API.
 */
export class HubSpotAdapter implements ICRMAdapter {
  private readonly baseUrl = 'https://api.hubapi.com';
  private readonly authUrl = 'https://api.hubapi.com/oauth/v1/token';

  async authenticate(refreshToken: string): Promise<AuthResult> {
    try {
      const response = await fetchWithTimeout(this.authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.HUBSPOT_CLIENT_ID || '',
          client_secret: process.env.HUBSPOT_CLIENT_SECRET || '',
        }).toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `HubSpot token refresh failed (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `HubSpot authentication error: ${message}` };
    }
  }

  async createLead(
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult> {
    try {
      const mappedData = mapLeadFields(lead, fieldMapping);
      const url = `${this.baseUrl}/crm/v3/objects/contacts`;

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: mappedData }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `HubSpot create lead failed (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      return { success: true, crmRecordId: data.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `HubSpot create lead error: ${message}` };
    }
  }

  async updateLead(
    crmRecordId: string,
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult> {
    try {
      const mappedData = mapLeadFields(lead, fieldMapping);
      const url = `${this.baseUrl}/crm/v3/objects/contacts/${crmRecordId}`;

      const response = await fetchWithTimeout(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: mappedData }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `HubSpot update lead failed (${response.status}): ${errorBody}`,
        };
      }

      return { success: true, crmRecordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `HubSpot update lead error: ${message}` };
    }
  }

  async testConnection(accessToken: string): Promise<ConnectionTestResult> {
    try {
      const url = `${this.baseUrl}/crm/v3/objects/contacts?limit=1`;

      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HubSpot connection test failed (${response.status})`,
        };
      }

      return { success: true, providerName: 'HubSpot' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `HubSpot connection test error: ${message}` };
    }
  }
}

// ─── Salesforce Adapter ──────────────────────────────────────────────────────

/**
 * Salesforce CRM adapter implementing OAuth2 and REST API.
 */
export class SalesforceAdapter implements ICRMAdapter {
  private readonly apiVersion = 'v58.0';
  private readonly authUrl = 'https://login.salesforce.com/services/oauth2/token';

  private getInstanceUrl(): string {
    return process.env.SALESFORCE_INSTANCE_URL || 'https://na1.salesforce.com';
  }

  async authenticate(refreshToken: string): Promise<AuthResult> {
    try {
      const response = await fetchWithTimeout(this.authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.SALESFORCE_CLIENT_ID || '',
          client_secret: process.env.SALESFORCE_CLIENT_SECRET || '',
        }).toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `Salesforce token refresh failed (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        accessToken: data.access_token,
        expiresIn: 7200, // Salesforce tokens typically last 2 hours
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Salesforce authentication error: ${message}` };
    }
  }

  async createLead(
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult> {
    try {
      const mappedData = mapLeadFields(lead, fieldMapping);
      const instanceUrl = this.getInstanceUrl();
      const url = `${instanceUrl}/services/data/${this.apiVersion}/sobjects/Lead/`;

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mappedData),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `Salesforce create lead failed (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      return { success: true, crmRecordId: data.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Salesforce create lead error: ${message}` };
    }
  }

  async updateLead(
    crmRecordId: string,
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult> {
    try {
      const mappedData = mapLeadFields(lead, fieldMapping);
      const instanceUrl = this.getInstanceUrl();
      const url = `${instanceUrl}/services/data/${this.apiVersion}/sobjects/Lead/${crmRecordId}`;

      const response = await fetchWithTimeout(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mappedData),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `Salesforce update lead failed (${response.status}): ${errorBody}`,
        };
      }

      return { success: true, crmRecordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Salesforce update lead error: ${message}` };
    }
  }

  async testConnection(accessToken: string): Promise<ConnectionTestResult> {
    try {
      const instanceUrl = this.getInstanceUrl();
      const url = `${instanceUrl}/services/data/${this.apiVersion}/sobjects/Lead/describe`;

      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Salesforce connection test failed (${response.status})`,
        };
      }

      return { success: true, providerName: 'Salesforce' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Salesforce connection test error: ${message}` };
    }
  }
}

// ─── Zoho Adapter ────────────────────────────────────────────────────────────

/**
 * Zoho CRM adapter implementing OAuth2 and CRM v2 API.
 */
export class ZohoAdapter implements ICRMAdapter {
  private readonly baseUrl = 'https://www.zohoapis.com';
  private readonly authUrl = 'https://accounts.zoho.com/oauth/v2/token';

  async authenticate(refreshToken: string): Promise<AuthResult> {
    try {
      const response = await fetchWithTimeout(this.authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.ZOHO_CLIENT_ID || '',
          client_secret: process.env.ZOHO_CLIENT_SECRET || '',
        }).toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `Zoho token refresh failed (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        accessToken: data.access_token,
        expiresIn: data.expires_in || 3600,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Zoho authentication error: ${message}` };
    }
  }

  async createLead(
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult> {
    try {
      const mappedData = mapLeadFields(lead, fieldMapping);
      const url = `${this.baseUrl}/crm/v2/Leads`;

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: [mappedData] }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `Zoho create lead failed (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();
      const recordId = data?.data?.[0]?.details?.id;
      return { success: true, crmRecordId: recordId || `zoho_${lead.id}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Zoho create lead error: ${message}` };
    }
  }

  async updateLead(
    crmRecordId: string,
    lead: Lead,
    fieldMapping: Record<string, string>,
    accessToken: string
  ): Promise<CRMOperationResult> {
    try {
      const mappedData = mapLeadFields(lead, fieldMapping);
      const url = `${this.baseUrl}/crm/v2/Leads/${crmRecordId}`;

      const response = await fetchWithTimeout(url, {
        method: 'PUT',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: [mappedData] }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `Zoho update lead failed (${response.status}): ${errorBody}`,
        };
      }

      return { success: true, crmRecordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Zoho update lead error: ${message}` };
    }
  }

  async testConnection(accessToken: string): Promise<ConnectionTestResult> {
    try {
      const url = `${this.baseUrl}/crm/v2/Leads?per_page=1`;

      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Zoho connection test failed (${response.status})`,
        };
      }

      return { success: true, providerName: 'Zoho CRM' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Zoho connection test error: ${message}` };
    }
  }
}

// ─── CRM Integration Service ────────────────────────────────────────────────

/**
 * Main CRM Integration Service that orchestrates adapter selection, token refresh,
 * lead sync operations, and the Redis-backed retry queue.
 */
export class CRMIntegrationService {
  private adapters: Map<CRMProvider, ICRMAdapter>;

  constructor() {
    this.adapters = new Map<CRMProvider, ICRMAdapter>([
      ['hubspot', new HubSpotAdapter()],
      ['salesforce', new SalesforceAdapter()],
      ['zoho', new ZohoAdapter()],
    ]);
  }

  /**
   * Get the adapter for a given CRM provider.
   */
  getAdapter(provider: CRMProvider): ICRMAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unsupported CRM provider: ${provider}`);
    }
    return adapter;
  }

  /**
   * Refresh the OAuth2 access token for a CRM integration.
   * Returns a new access token or throws on failure.
   */
  async refreshToken(integration: CRMIntegration): Promise<string> {
    const adapter = this.getAdapter(integration.provider);
    const result = await adapter.authenticate(integration.refreshToken);

    if (!result.success || !result.accessToken) {
      throw new Error(
        result.error || `Failed to refresh token for ${integration.provider}`
      );
    }

    return result.accessToken;
  }

  /**
   * Create a lead in the CRM. Automatically refreshes the token if the initial
   * attempt fails with an auth error.
   */
  async createLead(
    lead: Lead,
    integration: CRMIntegration
  ): Promise<CRMOperationResult> {
    if (!integration.isActive) {
      return { success: false, error: 'CRM integration is not active' };
    }

    const adapter = this.getAdapter(integration.provider);
    let accessToken = integration.accessToken;

    // First attempt with current token
    let result = await adapter.createLead(
      lead,
      integration.fieldMapping,
      accessToken
    );

    // If failed, try refreshing the token and retry once
    if (!result.success && this.isAuthError(result.error)) {
      try {
        accessToken = await this.refreshToken(integration);
        result = await adapter.createLead(
          lead,
          integration.fieldMapping,
          accessToken
        );
      } catch {
        // Token refresh failed, queue for retry
        await this.enqueueRetry(lead, integration, 'create');
        return {
          success: false,
          error: result.error || 'Authentication failed after token refresh',
        };
      }
    }

    // If still failed, queue for retry
    if (!result.success) {
      await this.enqueueRetry(lead, integration, 'create');
    }

    return result;
  }

  /**
   * Update an existing lead in the CRM. Automatically refreshes the token if
   * the initial attempt fails with an auth error.
   */
  async updateLead(
    crmRecordId: string,
    lead: Lead,
    integration: CRMIntegration
  ): Promise<CRMOperationResult> {
    if (!integration.isActive) {
      return { success: false, error: 'CRM integration is not active' };
    }

    const adapter = this.getAdapter(integration.provider);
    let accessToken = integration.accessToken;

    // First attempt with current token
    let result = await adapter.updateLead(
      crmRecordId,
      lead,
      integration.fieldMapping,
      accessToken
    );

    // If failed, try refreshing the token and retry once
    if (!result.success && this.isAuthError(result.error)) {
      try {
        accessToken = await this.refreshToken(integration);
        result = await adapter.updateLead(
          crmRecordId,
          lead,
          integration.fieldMapping,
          accessToken
        );
      } catch {
        await this.enqueueRetry(lead, integration, 'update', crmRecordId);
        return {
          success: false,
          error: result.error || 'Authentication failed after token refresh',
        };
      }
    }

    // If still failed, queue for retry
    if (!result.success) {
      await this.enqueueRetry(lead, integration, 'update', crmRecordId);
    }

    return result;
  }

  /**
   * Test the connection to a CRM provider.
   */
  async testConnection(integration: CRMIntegration): Promise<ConnectionTestResult> {
    const adapter = this.getAdapter(integration.provider);
    return adapter.testConnection(integration.accessToken);
  }

  // ─── Retry Queue (Redis-backed) ─────────────────────────────────────────

  /**
   * Add a failed CRM operation to the retry queue in Redis.
   * Operations are retried every 5 minutes for up to 288 attempts (24 hours).
   */
  async enqueueRetry(
    lead: Lead,
    integration: CRMIntegration,
    operation: 'create' | 'update',
    crmRecordId?: string
  ): Promise<void> {
    const now = Date.now();
    const entryId = `${lead.id}_${integration.provider}_${now}`;

    const entry: CRMRetryEntry = {
      id: entryId,
      leadId: lead.id,
      lead,
      integration,
      operation,
      crmRecordId,
      attemptCount: 0,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      nextRetryAt: now + RETRY_INTERVAL_MS,
      createdAt: now,
    };

    try {
      const key = `${RETRY_QUEUE_PREFIX}${entryId}`;
      await redisClient.set(key, JSON.stringify(entry));
      // Add to sorted set for efficient time-based processing
      await redisClient.zadd(
        `${RETRY_QUEUE_PREFIX}pending`,
        entry.nextRetryAt,
        entryId
      );
    } catch (error) {
      console.error('[CRM] Failed to enqueue retry:', error);
    }
  }

  /**
   * Process all due retry entries from the queue.
   * Should be called on a 5-minute interval by the scheduler.
   */
  async processRetryQueue(): Promise<CRMOperationResult[]> {
    const now = Date.now();
    const results: CRMOperationResult[] = [];

    try {
      // Get all entries with nextRetryAt <= now
      const dueEntryIds = await redisClient.zrangebyscore(
        `${RETRY_QUEUE_PREFIX}pending`,
        0,
        now
      );

      for (const entryId of dueEntryIds) {
        const result = await this.processRetryEntry(entryId);
        if (result) {
          results.push(result);
        }
      }
    } catch (error) {
      console.error('[CRM] Failed to process retry queue:', error);
    }

    return results;
  }

  /**
   * Process a single retry entry by its ID.
   */
  private async processRetryEntry(entryId: string): Promise<CRMOperationResult | null> {
    try {
      const key = `${RETRY_QUEUE_PREFIX}${entryId}`;
      const raw = await redisClient.get(key);

      if (!raw) {
        // Entry was already processed or removed
        await redisClient.zrem(`${RETRY_QUEUE_PREFIX}pending`, entryId);
        return null;
      }

      const entry: CRMRetryEntry = JSON.parse(raw);
      const adapter = this.getAdapter(entry.integration.provider);

      // Attempt the operation
      let result: CRMOperationResult;
      if (entry.operation === 'create') {
        result = await adapter.createLead(
          entry.lead,
          entry.integration.fieldMapping,
          entry.integration.accessToken
        );
      } else {
        result = await adapter.updateLead(
          entry.crmRecordId || '',
          entry.lead,
          entry.integration.fieldMapping,
          entry.integration.accessToken
        );
      }

      if (result.success) {
        // Remove from queue on success
        await this.removeRetryEntry(entryId);
        return result;
      }

      // Increment attempt count
      entry.attemptCount += 1;
      entry.lastError = result.error;

      if (entry.attemptCount >= entry.maxAttempts) {
        // Max retries reached — abandon
        await this.removeRetryEntry(entryId);
        return {
          success: false,
          error: `Max retry attempts reached (${MAX_RETRY_ATTEMPTS}). CRM sync abandoned for lead ${entry.leadId}.`,
        };
      }

      // Schedule next retry
      entry.nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
      await redisClient.set(key, JSON.stringify(entry));
      await redisClient.zadd(
        `${RETRY_QUEUE_PREFIX}pending`,
        entry.nextRetryAt,
        entryId
      );

      return { success: false, error: result.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CRM] Error processing retry entry ${entryId}:`, message);
      return { success: false, error: message };
    }
  }

  /**
   * Remove a retry entry from both the hash and sorted set.
   */
  private async removeRetryEntry(entryId: string): Promise<void> {
    const key = `${RETRY_QUEUE_PREFIX}${entryId}`;
    await redisClient.del(key);
    await redisClient.zrem(`${RETRY_QUEUE_PREFIX}pending`, entryId);
  }

  /**
   * Get the count of pending retry entries.
   */
  async getRetryQueueSize(): Promise<number> {
    try {
      return await redisClient.zcard(`${RETRY_QUEUE_PREFIX}pending`);
    } catch {
      return 0;
    }
  }

  /**
   * Get all pending retry entries (for monitoring/dashboard).
   */
  async getPendingRetries(): Promise<CRMRetryEntry[]> {
    try {
      const entryIds = await redisClient.zrange(
        `${RETRY_QUEUE_PREFIX}pending`,
        0,
        -1
      );

      const entries: CRMRetryEntry[] = [];
      for (const entryId of entryIds) {
        const raw = await redisClient.get(`${RETRY_QUEUE_PREFIX}${entryId}`);
        if (raw) {
          entries.push(JSON.parse(raw));
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Determines if an error message indicates an authentication failure
   * that could be resolved by refreshing the token.
   */
  private isAuthError(error?: string): boolean {
    if (!error) return false;
    const authKeywords = ['401', 'unauthorized', 'token', 'expired', 'invalid_grant'];
    const lowerError = error.toLowerCase();
    return authKeywords.some((keyword) => lowerError.includes(keyword));
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Factory function to create a CRM adapter for the given provider.
 * Provides a simple way to get the correct adapter without instantiating the full service.
 */
export function createCRMAdapter(provider: CRMProvider): ICRMAdapter {
  switch (provider) {
    case 'hubspot':
      return new HubSpotAdapter();
    case 'salesforce':
      return new SalesforceAdapter();
    case 'zoho':
      return new ZohoAdapter();
    default:
      throw new Error(`Unsupported CRM provider: ${provider}`);
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

/**
 * Default CRM integration service instance.
 */
export const crmIntegrationService = new CRMIntegrationService();
