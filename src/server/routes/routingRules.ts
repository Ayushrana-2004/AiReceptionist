import { Router, Request, Response } from 'express';
import { RoutingRule, TransferDestination } from '../../shared/types/routing';

const router = Router();

// ---------------------------------------------------------------------------
// Mock data (placeholder until real service layer is wired)
// ---------------------------------------------------------------------------

const mockRules: RoutingRule[] = [
  {
    id: 'rule-1',
    businessId: 'biz-1',
    intentCategory: 'sales',
    priority: 1,
    destinations: [
      { type: 'phone', target: '+15551234567', label: 'Sales Team', timeoutSeconds: 15 },
    ],
    isActive: true,
  },
  {
    id: 'rule-2',
    businessId: 'biz-1',
    intentCategory: 'support',
    priority: 2,
    destinations: [
      { type: 'phone', target: '+15559876543', label: 'Support Line', timeoutSeconds: 15 },
    ],
    isActive: true,
  },
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateRoutingRule(body: Record<string, unknown>): string | null {
  if (!body.intentCategory || typeof body.intentCategory !== 'string') {
    return 'intentCategory is required and must be a string';
  }
  if (body.priority == null || typeof body.priority !== 'number') {
    return 'priority is required and must be a number';
  }
  if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
    return 'destinations must be a non-empty array';
  }
  if (body.destinations.length > 3) {
    return 'destinations cannot exceed 3 entries';
  }
  for (const dest of body.destinations as TransferDestination[]) {
    if (!['phone', 'sip', 'queue'].includes(dest.type)) {
      return 'each destination must have a type of phone, sip, or queue';
    }
    if (!dest.target || typeof dest.target !== 'string') {
      return 'each destination must have a target string';
    }
    if (!dest.label || typeof dest.label !== 'string') {
      return 'each destination must have a label string';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/routing-rules — list all routing rules
// ---------------------------------------------------------------------------

router.get('/', (_req: Request, res: Response) => {
  res.json({ items: mockRules });
});

// ---------------------------------------------------------------------------
// POST /api/routing-rules — create a new routing rule
// ---------------------------------------------------------------------------

router.post('/', (req: Request, res: Response) => {
  const error = validateRoutingRule(req.body);
  if (error) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error });
    return;
  }

  const newRule: RoutingRule = {
    id: `rule-${Date.now()}`,
    businessId: 'biz-1', // placeholder: derived from auth context
    intentCategory: req.body.intentCategory,
    priority: req.body.priority,
    destinations: req.body.destinations,
    isActive: req.body.isActive ?? true,
  };

  res.status(201).json(newRule);
});

// ---------------------------------------------------------------------------
// PUT /api/routing-rules/:id — update a routing rule
// ---------------------------------------------------------------------------

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = mockRules.find((r) => r.id === id);

  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Routing rule ${id} not found` });
    return;
  }

  const error = validateRoutingRule(req.body);
  if (error) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error });
    return;
  }

  const updated: RoutingRule = {
    ...existing,
    intentCategory: req.body.intentCategory,
    priority: req.body.priority,
    destinations: req.body.destinations,
    isActive: req.body.isActive ?? existing.isActive,
  };

  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/routing-rules/:id — delete a routing rule
// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = mockRules.find((r) => r.id === id);

  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Routing rule ${id} not found` });
    return;
  }

  res.status(204).send();
});

export default router;
