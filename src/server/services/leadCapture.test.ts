/**
 * Unit tests for Lead Capture Service
 *
 * Tests cover:
 * - captureLead: validation and record creation
 * - qualifyLead: deterministic scoring logic
 * - syncToCRM: adapter pattern and retry queueing
 * - getLeads: pagination and filtering
 * - validateLeadData: input format validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureLead,
  qualifyLead,
  syncToCRM,
  getLeads,
  validateLeadData,
  getRetryQueue,
  clearRetryQueue,
  LeadCaptureDTO,
  LeadFilters,
  CRMConfig,
} from './leadCapture';
import { Lead } from '../../shared/types/lead';
import { QualificationCriteria } from '../../shared/types/qualification';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_123',
    businessId: 'biz_001',
    callId: 'call_001',
    name: 'John Doe',
    phone: '+14155551234',
    email: 'john@example.com',
    reason: 'Interested in premium service pricing',
    qualificationStatus: 'needs_review',
    crmSyncStatus: 'pending',
    crmRecordId: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeLeadDTO(overrides: Partial<LeadCaptureDTO> = {}): LeadCaptureDTO {
  return {
    callId: 'call_001',
    name: 'Jane Smith',
    phone: '+14155559876',
    email: 'jane@example.com',
    reason: 'Looking for budget consulting services',
    ...overrides,
  };
}

function makeCRMConfig(overrides: Partial<CRMConfig> = {}): CRMConfig {
  return {
    provider: 'hubspot',
    accessToken: 'test-token-123',
    refreshToken: 'test-refresh-456',
    fieldMapping: {
      name: 'firstname',
      phone: 'phone',
      email: 'email',
      reason: 'description',
    },
    isActive: true,
    ...overrides,
  };
}

function makeCriteria(overrides: Partial<QualificationCriteria> = {}): QualificationCriteria {
  return {
    id: 'crit_001',
    businessId: 'biz_001',
    category: 'service_type',
    values: ['premium', 'enterprise'],
    weight: 0.5,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Lead Capture Service', () => {
  beforeEach(() => {
    clearRetryQueue();
  });

  describe('validateLeadData', () => {
    it('should return no errors for valid lead data', () => {
      const dto = makeLeadDTO();
      const errors = validateLeadData(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject empty name', () => {
      const dto = makeLeadDTO({ name: '' });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should reject name exceeding 100 characters', () => {
      const dto = makeLeadDTO({ name: 'a'.repeat(101) });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should accept name at exactly 100 characters', () => {
      const dto = makeLeadDTO({ name: 'a'.repeat(100) });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'name')).toBe(false);
    });

    it('should reject invalid phone number', () => {
      const dto = makeLeadDTO({ phone: '555-1234' });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'phone')).toBe(true);
    });

    it('should accept valid E.164 phone number', () => {
      const dto = makeLeadDTO({ phone: '+14155551234' });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'phone')).toBe(false);
    });

    it('should reject invalid email format', () => {
      const dto = makeLeadDTO({ email: 'not-an-email' });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'email')).toBe(true);
    });

    it('should accept null email (optional field)', () => {
      const dto = makeLeadDTO({ email: null });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'email')).toBe(false);
    });

    it('should accept undefined email (optional field)', () => {
      const dto = makeLeadDTO({ email: undefined });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'email')).toBe(false);
    });

    it('should reject reason exceeding 500 characters', () => {
      const dto = makeLeadDTO({ reason: 'a'.repeat(501) });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'reason')).toBe(true);
    });

    it('should accept reason at exactly 500 characters', () => {
      const dto = makeLeadDTO({ reason: 'a'.repeat(500) });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'reason')).toBe(false);
    });

    it('should reject empty callId', () => {
      const dto = makeLeadDTO({ callId: '' });
      const errors = validateLeadData(dto);
      expect(errors.some((e) => e.field === 'callId')).toBe(true);
    });
  });

  describe('captureLead', () => {
    it('should create a lead record with valid data', async () => {
      const dto = makeLeadDTO();
      const lead = await captureLead('biz_001', dto);

      expect(lead.businessId).toBe('biz_001');
      expect(lead.callId).toBe(dto.callId);
      expect(lead.name).toBe(dto.name);
      expect(lead.phone).toBe(dto.phone);
      expect(lead.email).toBe(dto.email);
      expect(lead.reason).toBe(dto.reason);
      expect(lead.qualificationStatus).toBe('needs_review');
      expect(lead.crmSyncStatus).toBe('pending');
      expect(lead.crmRecordId).toBeNull();
      expect(lead.id).toBeDefined();
      expect(lead.createdAt).toBeInstanceOf(Date);
      expect(lead.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw on invalid lead data', async () => {
      const dto = makeLeadDTO({ name: '', phone: 'invalid' });
      await expect(captureLead('biz_001', dto)).rejects.toThrow('Lead validation failed');
    });

    it('should trim whitespace from fields', async () => {
      const dto = makeLeadDTO({
        name: '  John Doe  ',
        phone: '+14155551234',
        email: '  john@example.com  ',
        reason: '  Need help  ',
      });
      const lead = await captureLead('biz_001', dto);

      expect(lead.name).toBe('John Doe');
      expect(lead.email).toBe('john@example.com');
      expect(lead.reason).toBe('Need help');
    });

    it('should handle null email gracefully', async () => {
      const dto = makeLeadDTO({ email: null });
      const lead = await captureLead('biz_001', dto);
      expect(lead.email).toBeNull();
    });
  });

  describe('qualifyLead', () => {
    it('should return needs_review when no criteria provided', () => {
      const lead = makeLead();
      const status = qualifyLead(lead, []);
      expect(status).toBe('needs_review');
    });

    it('should return qualified when score > 0.7', () => {
      const lead = makeLead({ reason: 'I need premium enterprise solutions' });
      const criteria: QualificationCriteria[] = [
        makeCriteria({ values: ['premium'], weight: 0.5 }),
        makeCriteria({ id: 'crit_002', values: ['enterprise'], weight: 0.5 }),
      ];
      // Both match → score = 1.0/1.0 = 1.0 > 0.7 → qualified
      const status = qualifyLead(lead, criteria);
      expect(status).toBe('qualified');
    });

    it('should return unqualified when score < 0.3', () => {
      const lead = makeLead({ reason: 'Just browsing, no specific needs' });
      const criteria: QualificationCriteria[] = [
        makeCriteria({ values: ['premium'], weight: 0.4 }),
        makeCriteria({ id: 'crit_002', values: ['enterprise'], weight: 0.3 }),
        makeCriteria({ id: 'crit_003', category: 'budget', values: ['high-budget'], weight: 0.3 }),
      ];
      // None match → score = 0.0 < 0.3 → unqualified
      const status = qualifyLead(lead, criteria);
      expect(status).toBe('unqualified');
    });

    it('should return needs_review when score is between thresholds', () => {
      const lead = makeLead({ reason: 'Looking for premium options' });
      const criteria: QualificationCriteria[] = [
        makeCriteria({ values: ['premium'], weight: 0.5 }),
        makeCriteria({ id: 'crit_002', values: ['enterprise'], weight: 0.5 }),
        makeCriteria({ id: 'crit_003', category: 'budget', values: ['high-budget'], weight: 0.5 }),
      ];
      // Only 'premium' matches → score = 0.5/1.5 = 0.333... → needs_review (between 0.3 and 0.7)
      const status = qualifyLead(lead, criteria);
      expect(status).toBe('needs_review');
    });

    it('should be deterministic - same inputs always produce same output', () => {
      const lead = makeLead({ reason: 'premium enterprise consulting' });
      const criteria: QualificationCriteria[] = [
        makeCriteria({ values: ['premium'], weight: 0.6 }),
        makeCriteria({ id: 'crit_002', values: ['enterprise'], weight: 0.4 }),
      ];

      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(qualifyLead(lead, criteria));
      }
      expect(results.size).toBe(1);
    });

    it('should be case-insensitive in matching', () => {
      const lead = makeLead({ reason: 'PREMIUM ENTERPRISE' });
      const criteria: QualificationCriteria[] = [
        makeCriteria({ values: ['premium'], weight: 0.5 }),
        makeCriteria({ id: 'crit_002', values: ['Enterprise'], weight: 0.5 }),
      ];
      const status = qualifyLead(lead, criteria);
      expect(status).toBe('qualified');
    });

    it('should handle criteria with zero total weight', () => {
      const lead = makeLead();
      const criteria: QualificationCriteria[] = [
        makeCriteria({ values: ['premium'], weight: 0 }),
      ];
      const status = qualifyLead(lead, criteria);
      expect(status).toBe('needs_review');
    });

    it('should return exactly one status from the valid set', () => {
      const lead = makeLead({ reason: 'test' });
      const criteria: QualificationCriteria[] = [
        makeCriteria({ values: ['test'], weight: 1 }),
      ];
      const status = qualifyLead(lead, criteria);
      expect(['qualified', 'unqualified', 'needs_review']).toContain(status);
    });
  });

  describe('syncToCRM', () => {
    it('should sync successfully to HubSpot', async () => {
      const lead = makeLead();
      const config = makeCRMConfig({ provider: 'hubspot' });
      const result = await syncToCRM(lead, config);

      expect(result.success).toBe(true);
      expect(result.crmRecordId).toBeDefined();
    });

    it('should sync successfully to Salesforce', async () => {
      const lead = makeLead();
      const config = makeCRMConfig({ provider: 'salesforce' });
      const result = await syncToCRM(lead, config);

      expect(result.success).toBe(true);
      expect(result.crmRecordId).toContain('sf_');
    });

    it('should sync successfully to Zoho', async () => {
      const lead = makeLead();
      const config = makeCRMConfig({ provider: 'zoho' });
      const result = await syncToCRM(lead, config);

      expect(result.success).toBe(true);
      expect(result.crmRecordId).toContain('zoho_');
    });

    it('should return error when CRM integration is inactive', async () => {
      const lead = makeLead();
      const config = makeCRMConfig({ isActive: false });
      const result = await syncToCRM(lead, config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should queue for retry when sync fails (missing token)', async () => {
      const lead = makeLead();
      const config = makeCRMConfig({ accessToken: '' });
      const result = await syncToCRM(lead, config);

      expect(result.success).toBe(false);
      expect(result.retryQueued).toBe(true);
      expect(getRetryQueue().size).toBe(1);
    });

    it('should set correct retry queue parameters', async () => {
      const lead = makeLead();
      const config = makeCRMConfig({ accessToken: '' });
      await syncToCRM(lead, config);

      const entry = getRetryQueue().get(lead.id);
      expect(entry).toBeDefined();
      expect(entry!.maxAttempts).toBe(288);
      expect(entry!.attemptCount).toBe(0);
      expect(entry!.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getLeads', () => {
    const baseLeads: Lead[] = [
      makeLead({ id: '1', qualificationStatus: 'qualified', createdAt: new Date('2024-01-10') }),
      makeLead({ id: '2', qualificationStatus: 'unqualified', createdAt: new Date('2024-01-12') }),
      makeLead({ id: '3', qualificationStatus: 'needs_review', createdAt: new Date('2024-01-14') }),
      makeLead({ id: '4', qualificationStatus: 'qualified', createdAt: new Date('2024-01-16') }),
      makeLead({ id: '5', businessId: 'other_biz', createdAt: new Date('2024-01-18') }),
    ];

    it('should return only leads for the specified business', () => {
      const result = getLeads('biz_001', {}, baseLeads);
      expect(result.items.every((l) => l.businessId === 'biz_001')).toBe(true);
      expect(result.totalItems).toBe(4);
    });

    it('should sort by most recent first', () => {
      const result = getLeads('biz_001', {}, baseLeads);
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          result.items[i].createdAt.getTime()
        );
      }
    });

    it('should filter by qualification status', () => {
      const result = getLeads('biz_001', { qualificationStatus: 'qualified' }, baseLeads);
      expect(result.totalItems).toBe(2);
      expect(result.items.every((l) => l.qualificationStatus === 'qualified')).toBe(true);
    });

    it('should paginate with default page size of 20', () => {
      const result = getLeads('biz_001', {}, baseLeads);
      expect(result.pageSize).toBe(20);
      expect(result.currentPage).toBe(1);
    });

    it('should paginate correctly with custom page size', () => {
      const result = getLeads('biz_001', { pageSize: 2, page: 1 }, baseLeads);
      expect(result.items.length).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('should return correct page 2 items', () => {
      const result = getLeads('biz_001', { pageSize: 2, page: 2 }, baseLeads);
      expect(result.items.length).toBe(2);
      expect(result.currentPage).toBe(2);
    });

    it('should filter by date range', () => {
      const result = getLeads(
        'biz_001',
        { fromDate: new Date('2024-01-11'), toDate: new Date('2024-01-15') },
        baseLeads
      );
      expect(result.totalItems).toBe(2); // Jan 12, Jan 14
    });

    it('should return empty result for business with no leads', () => {
      const result = getLeads('nonexistent', {}, baseLeads);
      expect(result.totalItems).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(result.totalPages).toBe(1);
    });
  });
});
