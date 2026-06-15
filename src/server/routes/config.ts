import { Router, Request, Response } from 'express';
import { Business } from '../../shared/types/business';

const router = Router();

// ---------------------------------------------------------------------------
// Mock data (placeholder until real service layer is wired)
// ---------------------------------------------------------------------------

const mockConfig: Business = {
  id: 'biz-1',
  name: 'Acme Corp',
  greeting: 'Hello! Thank you for calling Acme Corp. How can I help you today?',
  voiceProfileId: 'voice-en-female-1',
  enabledLanguages: ['en', 'es'],
  operatingHours: {
    timezone: 'America/New_York',
    schedule: {
      monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      tuesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      wednesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      thursday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      friday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      saturday: { isOpen: false, openTime: '00:00', closeTime: '00:00' },
      sunday: { isOpen: false, openTime: '00:00', closeTime: '00:00' },
    },
  },
  maxConcurrentCalls: 50,
  callTimeoutSeconds: 300,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateConfigUpdate(body: Record<string, unknown>): string | null {
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.length === 0) {
      return 'name must be a non-empty string';
    }
    if (body.name.length > 100) {
      return 'name must not exceed 100 characters';
    }
  }

  if (body.greeting !== undefined) {
    if (typeof body.greeting !== 'string' || body.greeting.length === 0) {
      return 'greeting must be a non-empty string';
    }
    if (body.greeting.length > 500) {
      return 'greeting must not exceed 500 characters';
    }
  }

  if (body.enabledLanguages !== undefined) {
    if (!Array.isArray(body.enabledLanguages) || body.enabledLanguages.length === 0) {
      return 'enabledLanguages must be a non-empty array';
    }
    const validLanguages = ['en', 'es', 'fr', 'zh'];
    for (const lang of body.enabledLanguages as string[]) {
      if (!validLanguages.includes(lang)) {
        return `invalid language: ${lang}. Must be one of: ${validLanguages.join(', ')}`;
      }
    }
  }

  if (body.maxConcurrentCalls !== undefined) {
    if (typeof body.maxConcurrentCalls !== 'number' || body.maxConcurrentCalls < 1) {
      return 'maxConcurrentCalls must be a positive number';
    }
  }

  if (body.callTimeoutSeconds !== undefined) {
    if (typeof body.callTimeoutSeconds !== 'number' || body.callTimeoutSeconds < 1) {
      return 'callTimeoutSeconds must be a positive number';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// GET /api/config — get business configuration
// ---------------------------------------------------------------------------

router.get('/', (_req: Request, res: Response) => {
  res.json(mockConfig);
});

// ---------------------------------------------------------------------------
// PUT /api/config — update business configuration
// ---------------------------------------------------------------------------

router.put('/', (req: Request, res: Response) => {
  const error = validateConfigUpdate(req.body);
  if (error) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error });
    return;
  }

  const updated: Business = {
    ...mockConfig,
    name: req.body.name ?? mockConfig.name,
    greeting: req.body.greeting ?? mockConfig.greeting,
    voiceProfileId: req.body.voiceProfileId ?? mockConfig.voiceProfileId,
    enabledLanguages: req.body.enabledLanguages ?? mockConfig.enabledLanguages,
    operatingHours: req.body.operatingHours ?? mockConfig.operatingHours,
    maxConcurrentCalls: req.body.maxConcurrentCalls ?? mockConfig.maxConcurrentCalls,
    callTimeoutSeconds: req.body.callTimeoutSeconds ?? mockConfig.callTimeoutSeconds,
    updatedAt: new Date(),
  };

  res.json(updated);
});

export default router;
