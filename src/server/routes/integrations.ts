import { Router, Request, Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateCalendarConnect(body: Record<string, unknown>): string | null {
  if (!body.provider || typeof body.provider !== 'string') {
    return 'provider is required and must be a string';
  }
  const validProviders = ['google', 'outlook', 'calendly'];
  if (!validProviders.includes(body.provider as string)) {
    return `provider must be one of: ${validProviders.join(', ')}`;
  }
  if (!body.accessToken || typeof body.accessToken !== 'string') {
    return 'accessToken is required';
  }
  if (!body.refreshToken || typeof body.refreshToken !== 'string') {
    return 'refreshToken is required';
  }
  if (!body.calendarId || typeof body.calendarId !== 'string') {
    return 'calendarId is required';
  }
  return null;
}

function validateCRMConnect(body: Record<string, unknown>): string | null {
  if (!body.provider || typeof body.provider !== 'string') {
    return 'provider is required and must be a string';
  }
  const validProviders = ['hubspot', 'salesforce', 'zoho'];
  if (!validProviders.includes(body.provider as string)) {
    return `provider must be one of: ${validProviders.join(', ')}`;
  }
  if (!body.accessToken || typeof body.accessToken !== 'string') {
    return 'accessToken is required';
  }
  if (!body.refreshToken || typeof body.refreshToken !== 'string') {
    return 'refreshToken is required';
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/integrations/calendar — connect calendar integration
// ---------------------------------------------------------------------------

router.post('/calendar', (req: Request, res: Response) => {
  const error = validateCalendarConnect(req.body);
  if (error) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error });
    return;
  }

  // Placeholder: in production, store encrypted tokens and verify connectivity
  const integration = {
    id: `cal-${Date.now()}`,
    businessId: 'biz-1',
    provider: req.body.provider,
    calendarId: req.body.calendarId,
    isActive: true,
    connectedAt: new Date().toISOString(),
  };

  res.status(201).json(integration);
});

// ---------------------------------------------------------------------------
// DELETE /api/integrations/calendar — disconnect calendar integration
// ---------------------------------------------------------------------------

router.delete('/calendar', (_req: Request, res: Response) => {
  // Placeholder: in production, revoke tokens and remove integration record
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /api/integrations/crm — connect CRM integration
// ---------------------------------------------------------------------------

router.post('/crm', (req: Request, res: Response) => {
  const error = validateCRMConnect(req.body);
  if (error) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error });
    return;
  }

  // Placeholder: in production, store encrypted tokens and verify connectivity
  const integration = {
    id: `crm-${Date.now()}`,
    businessId: 'biz-1',
    provider: req.body.provider,
    fieldMapping: req.body.fieldMapping ?? {},
    isActive: true,
    connectedAt: new Date().toISOString(),
  };

  res.status(201).json(integration);
});

// ---------------------------------------------------------------------------
// DELETE /api/integrations/crm — disconnect CRM integration
// ---------------------------------------------------------------------------

router.delete('/crm', (_req: Request, res: Response) => {
  // Placeholder: in production, revoke tokens and remove integration record
  res.status(204).send();
});

export default router;
