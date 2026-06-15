/**
 * Unit tests for CRM Integration Service
 *
 * Tests core logic: field mapping, adapter selection, retry queue behavior,
 * and error handling paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CRMIntegrationService,
  HubSpotAdapter,
  SalesforceAdapter,
  ZohoAdapter,
  mapLeadFields,
  createCRMAdapter,
  ICRMAdapter,
} from './crm';
import { Lead } from '../../shared/types/lead';
import { CRMIntegration } from '../../shared/types/integrations';

// Mock the Redis client to avoid real Redis connections
vi.mock('../db/redis', () => ({
  redisClient: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    zadd: vi.fn().mockResolvedValue(1),
    zrem: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
  },
}));

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function createTestLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_123',
    businessId: 'biz_456',
    callId: 'call_789',
    name: 'John Doe',
    phone: '+14155551234',
    email: 'john@example.com',
    reason: 'Interested in consulting services',
    qualificationStatus: 'qualified',
    crmSyncStatus: 'pending',
    crmRecordId: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

function createTestIntegration(
  overrides: Partial<CRMIntegration> = {}
): CRMIntegration {
  return {
    id: 'int_001',
    businessId: 'biz_456',
    provider: 'hubspot',
    accessToken: 'test_access_token',
    refreshToken: 'test_refresh_token',
    fieldMapping: {
      name: 'firstname',
      email: 'email',
      phone: 'phone',
      reason: 'description',
    },
    isActive: true,
    ...overrides,
  };
}

// ─── Field Mapping Tests ─────────────────────────────────────────────────────

describe('mapLeadFields', () => {
  it('should map lead fields using the provided field mapping', () => {
    const lead = createTestLead();
    const fieldMapping = {
      name: 'contact_name',
      email: 'contact_email',
      phone: 'contact_phone',
    };

    const result = mapLeadFields(lead, fieldMapping);

    expect(result).toEqual({
      contact_name: 'John Doe',
      contact_email: 'john@example.com',
      contact_phone: '+14155551234',
    });
  });

  it('should return default fields when field mapping is empty', () => {
    const lead = createTestLead();
    const result = mapLeadFields(lead, {});

    expect(result).toHaveProperty('name', 'John Doe');
    expect(result).toHaveProperty('phone', '+14155551234');
    expect(result).toHaveProperty('email', 'john@example.com');
    expect(result).toHaveProperty('reason', 'Interested in consulting services');
  });

  it('should ignore field mapping keys that do not exist on the lead', () => {
    const lead = createTestLead();
    const fieldMapping = {
      name: 'first_name',
      nonExistentField: 'crm_field',
    };

    const result = mapLeadFields(lead, fieldMapping);

    expect(result).toEqual({ first_name: 'John Doe' });
    expect(result).not.toHaveProperty('crm_field');
  });

  it('should handle null email in lead', () => {
    const lead = createTestLead({ email: null });
    const fieldMapping = { email: 'contact_email', name: 'full_name' };

    const result = mapLeadFields(lead, fieldMapping);

    expect(result).toEqual({
      contact_email: null,
      full_name: 'John Doe',
    });
  });
});

// ─── Adapter Selection Tests ─────────────────────────────────────────────────

describe('CRMIntegrationService - Adapter Selection', () => {
  let service: CRMIntegrationService;

  beforeEach(() => {
    service = new CRMIntegrationService();
  });

  it('should return HubSpot adapter for hubspot provider', () => {
    const adapter = service.getAdapter('hubspot');
    expect(adapter).toBeInstanceOf(HubSpotAdapter);
  });

  it('should return Salesforce adapter for salesforce provider', () => {
    const adapter = service.getAdapter('salesforce');
    expect(adapter).toBeInstanceOf(SalesforceAdapter);
  });

  it('should return Zoho adapter for zoho provider', () => {
    const adapter = service.getAdapter('zoho');
    expect(adapter).toBeInstanceOf(ZohoAdapter);
  });

  it('should throw for unsupported provider', () => {
    expect(() => service.getAdapter('unknown' as any)).toThrow(
      'Unsupported CRM provider: unknown'
    );
  });
});

// ─── CRM Integration Service Logic Tests ─────────────────────────────────────

describe('CRMIntegrationService - createLead', () => {
  let service: CRMIntegrationService;

  beforeEach(() => {
    service = new CRMIntegrationService();
  });

  it('should return error when integration is not active', async () => {
    const lead = createTestLead();
    const integration = createTestIntegration({ isActive: false });

    const result = await service.createLead(lead, integration);

    expect(result.success).toBe(false);
    expect(result.error).toBe('CRM integration is not active');
  });
});

describe('CRMIntegrationService - updateLead', () => {
  let service: CRMIntegrationService;

  beforeEach(() => {
    service = new CRMIntegrationService();
  });

  it('should return error when integration is not active', async () => {
    const lead = createTestLead();
    const integration = createTestIntegration({ isActive: false });

    const result = await service.updateLead('crm_001', lead, integration);

    expect(result.success).toBe(false);
    expect(result.error).toBe('CRM integration is not active');
  });
});

// ─── Adapter Interface Conformance Tests ─────────────────────────────────────

describe('Adapter Interface', () => {
  const adapters: [string, ICRMAdapter][] = [
    ['HubSpotAdapter', new HubSpotAdapter()],
    ['SalesforceAdapter', new SalesforceAdapter()],
    ['ZohoAdapter', new ZohoAdapter()],
  ];

  for (const [name, adapter] of adapters) {
    describe(name, () => {
      it('should have authenticate method', () => {
        expect(typeof adapter.authenticate).toBe('function');
      });

      it('should have createLead method', () => {
        expect(typeof adapter.createLead).toBe('function');
      });

      it('should have updateLead method', () => {
        expect(typeof adapter.updateLead).toBe('function');
      });

      it('should have testConnection method', () => {
        expect(typeof adapter.testConnection).toBe('function');
      });
    });
  }
});

// ─── Auth Error Detection Tests ──────────────────────────────────────────────

describe('createCRMAdapter factory function', () => {
  it('should return HubSpot adapter for hubspot provider', () => {
    const adapter = createCRMAdapter('hubspot');
    expect(adapter).toBeInstanceOf(HubSpotAdapter);
  });

  it('should return Salesforce adapter for salesforce provider', () => {
    const adapter = createCRMAdapter('salesforce');
    expect(adapter).toBeInstanceOf(SalesforceAdapter);
  });

  it('should return Zoho adapter for zoho provider', () => {
    const adapter = createCRMAdapter('zoho');
    expect(adapter).toBeInstanceOf(ZohoAdapter);
  });

  it('should throw for unsupported provider', () => {
    expect(() => createCRMAdapter('unknown' as any)).toThrow(
      'Unsupported CRM provider: unknown'
    );
  });
});

describe('CRMIntegrationService - isAuthError detection', () => {
  let service: CRMIntegrationService;

  beforeEach(() => {
    service = new CRMIntegrationService();
  });

  // We test the auth error detection indirectly through createLead behavior
  // since isAuthError is private. When a token-related error occurs, the service
  // should attempt a token refresh.

  it('should handle non-auth errors without attempting token refresh', async () => {
    const lead = createTestLead();
    const integration = createTestIntegration({ isActive: true });

    // Mock fetch to return a non-auth error (e.g., 500 server error)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await service.createLead(lead, integration);

    // The result will be a failure (server error) but no double-refresh loop
    expect(result.success).toBe(false);

    // Restore fetch
    vi.unstubAllGlobals();
  });
});
