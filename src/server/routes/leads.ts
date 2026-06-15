import { Router, Request, Response } from 'express';
import { Lead } from '../../shared/types/lead';
import { PaginatedResult } from '../../shared/types/common';

const router = Router();

// ---------------------------------------------------------------------------
// Mock data (placeholder until real service layer is wired)
// ---------------------------------------------------------------------------

const mockLeads: Lead[] = [
  {
    id: 'lead-1',
    businessId: 'biz-1',
    callId: 'call-101',
    name: 'Jane Smith',
    phone: '+15551112222',
    email: 'jane@example.com',
    reason: 'Interested in premium plan',
    qualificationStatus: 'qualified',
    crmSyncStatus: 'synced',
    crmRecordId: 'crm-001',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'lead-2',
    businessId: 'biz-1',
    callId: 'call-102',
    name: 'John Doe',
    phone: '+15553334444',
    email: null,
    reason: 'Pricing inquiry for enterprise',
    qualificationStatus: 'needs_review',
    crmSyncStatus: 'pending',
    crmRecordId: null,
    createdAt: new Date('2024-01-16T14:30:00Z'),
    updatedAt: new Date('2024-01-16T14:30:00Z'),
  },
];

// ---------------------------------------------------------------------------
// GET /api/leads — paginated lead list
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

  const totalItems = mockLeads.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const items = mockLeads.slice(startIndex, startIndex + pageSize);

  const result: PaginatedResult<Lead> = {
    items,
    totalItems,
    totalPages,
    currentPage: page,
    pageSize,
  };

  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/leads/:id — lead detail
// ---------------------------------------------------------------------------

router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const lead = mockLeads.find((l) => l.id === id);

  if (!lead) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Lead ${id} not found` });
    return;
  }

  res.json(lead);
});

// ---------------------------------------------------------------------------
// PUT /api/leads/:id — update lead (e.g., qualification status)
// ---------------------------------------------------------------------------

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const lead = mockLeads.find((l) => l.id === id);

  if (!lead) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Lead ${id} not found` });
    return;
  }

  // Validate qualification status if provided
  const validStatuses = ['qualified', 'unqualified', 'needs_review'];
  if (req.body.qualificationStatus && !validStatuses.includes(req.body.qualificationStatus)) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `qualificationStatus must be one of: ${validStatuses.join(', ')}`,
    });
    return;
  }

  // Validate name length if provided
  if (req.body.name && req.body.name.length > 100) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'name must not exceed 100 characters',
    });
    return;
  }

  // Validate reason length if provided
  if (req.body.reason && req.body.reason.length > 500) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'reason must not exceed 500 characters',
    });
    return;
  }

  const updated: Lead = {
    ...lead,
    name: req.body.name ?? lead.name,
    phone: req.body.phone ?? lead.phone,
    email: req.body.email !== undefined ? req.body.email : lead.email,
    reason: req.body.reason ?? lead.reason,
    qualificationStatus: req.body.qualificationStatus ?? lead.qualificationStatus,
    updatedAt: new Date(),
  };

  res.json(updated);
});

export default router;
