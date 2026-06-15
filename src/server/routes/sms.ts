import { Router, Request, Response } from 'express';
import { SMSTemplate, SMSMessage } from '../../shared/types/sms';
import { PaginatedResult } from '../../shared/types/common';

const router = Router();

// ---------------------------------------------------------------------------
// Mock data (placeholder until real service layer is wired)
// ---------------------------------------------------------------------------

const mockTemplates: SMSTemplate[] = [
  {
    id: 'tpl-1',
    businessId: 'biz-1',
    name: 'Missed Call Follow-Up',
    body: 'We missed your call! Reply to schedule a callback or visit our website.',
    triggerEvent: 'missed_call',
    isActive: true,
  },
  {
    id: 'tpl-2',
    businessId: 'biz-1',
    name: 'Appointment Confirmation',
    body: 'Your appointment is confirmed for {{date}} at {{time}}. Reply CANCEL to cancel.',
    triggerEvent: 'appointment_booked',
    isActive: true,
  },
];

const mockHistory: SMSMessage[] = [
  {
    id: 'sms-1',
    businessId: 'biz-1',
    recipientPhone: '+15551112222',
    templateId: 'tpl-2',
    body: 'Your appointment is confirmed for Jan 20 at 2:00 PM. Reply CANCEL to cancel.',
    type: 'confirmation',
    status: 'delivered',
    retryCount: 0,
    twilioMessageSid: 'SM123abc',
    sentAt: new Date('2024-01-18T10:00:00Z'),
    deliveredAt: new Date('2024-01-18T10:00:02Z'),
  },
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateTemplate(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== 'string') {
    return 'name is required and must be a string';
  }
  if (!body.body || typeof body.body !== 'string') {
    return 'body is required and must be a string';
  }
  if ((body.body as string).length > 160) {
    return 'body must not exceed 160 characters';
  }
  if (!body.triggerEvent || typeof body.triggerEvent !== 'string') {
    return 'triggerEvent is required and must be a string';
  }
  const validTriggers = ['missed_call', 'voicemail', 'lead_captured', 'appointment_booked'];
  if (!validTriggers.includes(body.triggerEvent as string)) {
    return `triggerEvent must be one of: ${validTriggers.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/sms/templates — list all SMS templates
// ---------------------------------------------------------------------------

router.get('/templates', (_req: Request, res: Response) => {
  res.json({ items: mockTemplates });
});

// ---------------------------------------------------------------------------
// POST /api/sms/templates — create a new SMS template
// ---------------------------------------------------------------------------

router.post('/templates', (req: Request, res: Response) => {
  const error = validateTemplate(req.body);
  if (error) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error });
    return;
  }

  const newTemplate: SMSTemplate = {
    id: `tpl-${Date.now()}`,
    businessId: 'biz-1',
    name: req.body.name,
    body: req.body.body,
    triggerEvent: req.body.triggerEvent,
    isActive: req.body.isActive ?? true,
  };

  res.status(201).json(newTemplate);
});

// ---------------------------------------------------------------------------
// PUT /api/sms/templates/:id — update an SMS template
// ---------------------------------------------------------------------------

router.put('/templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = mockTemplates.find((t) => t.id === id);

  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: `SMS template ${id} not found` });
    return;
  }

  const error = validateTemplate(req.body);
  if (error) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error });
    return;
  }

  const updated: SMSTemplate = {
    ...existing,
    name: req.body.name,
    body: req.body.body,
    triggerEvent: req.body.triggerEvent,
    isActive: req.body.isActive ?? existing.isActive,
  };

  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/sms/templates/:id — delete an SMS template
// ---------------------------------------------------------------------------

router.delete('/templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = mockTemplates.find((t) => t.id === id);

  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: `SMS template ${id} not found` });
    return;
  }

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /api/sms/history — SMS delivery history
// ---------------------------------------------------------------------------

router.get('/history', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

  const totalItems = mockHistory.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const items = mockHistory.slice(startIndex, startIndex + pageSize);

  const result: PaginatedResult<SMSMessage> = {
    items,
    totalItems,
    totalPages,
    currentPage: page,
    pageSize,
  };

  res.json(result);
});

export default router;
