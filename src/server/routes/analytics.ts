import { Router, Request, Response } from 'express';
import { AnalyticsSnapshot } from '../../shared/types/analytics';

const router = Router();

// ---------------------------------------------------------------------------
// Mock data (placeholder until real service layer is wired)
// ---------------------------------------------------------------------------

const mockAnalytics: AnalyticsSnapshot = {
  businessId: 'biz-1',
  period: 'weekly',
  date: new Date('2024-01-15T00:00:00Z'),
  totalCalls: 142,
  avgDurationSeconds: 185,
  appointmentConversionRate: 23.5,
  leadCaptureRate: 34.2,
  transfersByCategory: {
    sales: 28,
    support: 45,
    billing: 12,
  },
  callsByOutcome: {
    appointment_booked: 34,
    lead_captured: 49,
    transferred: 85,
    voicemail: 8,
    dropped: 3,
  },
};

// ---------------------------------------------------------------------------
// GET /api/analytics — get aggregated analytics data
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const period = req.query.period as string | undefined;
  const validPeriods = ['daily', 'weekly', 'monthly'];

  if (period && !validPeriods.includes(period)) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `period must be one of: ${validPeriods.join(', ')}`,
    });
    return;
  }

  // Placeholder: in production, query analytics service with period and date range
  const result: AnalyticsSnapshot = {
    ...mockAnalytics,
    period: (period as AnalyticsSnapshot['period']) ?? 'weekly',
  };

  res.json(result);
});

export default router;
