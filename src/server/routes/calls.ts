import { Router, Request, Response } from 'express';
import { CallFilters, CallRecord, ActiveCall, PaginatedResult } from '../../shared/types';

/**
 * Calls API Router
 *
 * Provides endpoints for call history, call details, and active call monitoring.
 *
 * Routes:
 *   GET /api/calls         — List call history with filters and pagination
 *   GET /api/calls/active  — Get currently active/queued calls
 *   GET /api/calls/:id     — Get single call detail with summary and transcript
 *
 * Requirements: 1.6, 7.3, 7.5
 */

// ---------------------------------------------------------------------------
// Dependencies interface for dependency injection (testability)
// ---------------------------------------------------------------------------

export interface CallsRouteDependencies {
  getCallHistory: (
    businessId: string,
    filters: CallFilters
  ) => Promise<PaginatedResult<CallRecord>>;
  getCallById: (
    callId: string,
    businessId: string
  ) => Promise<CallRecord | null>;
  getActiveCalls: (businessId: string) => Promise<ActiveCall[]>;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the calls router with injected dependencies.
 */
export function createCallsRouter(deps: CallsRouteDependencies): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /api/calls/active — Get currently active/queued calls
  // Must be defined before /api/calls/:id to avoid route collision
  // Requirement 1.6: Dashboard displays call status (active, queued, completed)
  // -------------------------------------------------------------------------
  router.get('/active', async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Missing businessId',
        });
        return;
      }

      const activeCalls = await deps.getActiveCalls(businessId);

      res.json({
        calls: activeCalls,
        count: activeCalls.length,
      });
    } catch (error) {
      handleRouteError(res, error, 'Failed to retrieve active calls');
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/calls — List call history with filters and pagination
  // Requirements 7.3, 7.5: Searchable/filterable call logs with summaries
  // -------------------------------------------------------------------------
  router.get('/', async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Missing businessId',
        });
        return;
      }

      const filters = parseCallFilters(req);
      const result = await deps.getCallHistory(businessId, filters);

      res.json(result);
    } catch (error) {
      handleRouteError(res, error, 'Failed to retrieve call history');
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/calls/:id — Get single call detail with summary and transcript
  // Requirements 7.3, 7.5: Call detail view with summary and transcript
  // -------------------------------------------------------------------------
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Missing businessId',
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Missing call ID',
        });
        return;
      }

      const callRecord = await deps.getCallById(id, businessId);

      if (!callRecord) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Call record with id '${id}' not found`,
        });
        return;
      }

      res.json(callRecord);
    } catch (error) {
      handleRouteError(res, error, 'Failed to retrieve call details');
    }
  });

  // -------------------------------------------------------------------------
  // WebSocket upgrade placeholder
  // Full WebSocket implementation for real-time call status updates
  // is handled in task 16.5 (src/client/hooks/useCallStatus.ts + server WS).
  // The /api/calls/active endpoint above serves as the REST fallback.
  //
  // When WebSocket is implemented:
  // - Server will emit call status changes (active/queued/completed) within 2s
  // - Clients connect to ws://host/api/calls/ws for real-time updates
  // - Falls back to polling GET /api/calls/active if WS unavailable
  // Requirement 1.6: Updated within 2 seconds of any call state change
  // -------------------------------------------------------------------------

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the business ID from the authenticated request.
 * In a full implementation, this would come from the JWT payload.
 * For now, accepts it as a query parameter or header.
 */
function getBusinessId(req: Request): string | null {
  // Prefer business ID from auth token (would be set by auth middleware in production)
  if (req.user && (req.user as Record<string, unknown>).businessId) {
    return (req.user as Record<string, unknown>).businessId as string;
  }
  // Fallback to query parameter for development/testing
  const fromQuery = req.query.businessId;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    return fromQuery;
  }
  // Fallback to header
  const fromHeader = req.headers['x-business-id'];
  if (typeof fromHeader === 'string' && fromHeader.length > 0) {
    return fromHeader;
  }
  return null;
}

/**
 * Parses call filter parameters from the request query string.
 */
function parseCallFilters(req: Request): CallFilters {
  const filters: CallFilters = {};

  const { outcomeCategory, dateFrom, dateTo, callerNumber, keyword, page, pageSize } =
    req.query;

  if (typeof outcomeCategory === 'string' && outcomeCategory.length > 0) {
    filters.outcomeCategory = outcomeCategory;
  }

  if (typeof dateFrom === 'string' && dateFrom.length > 0) {
    const parsed = new Date(dateFrom);
    if (!isNaN(parsed.getTime())) {
      filters.dateFrom = parsed;
    }
  }

  if (typeof dateTo === 'string' && dateTo.length > 0) {
    const parsed = new Date(dateTo);
    if (!isNaN(parsed.getTime())) {
      filters.dateTo = parsed;
    }
  }

  if (typeof callerNumber === 'string' && callerNumber.length > 0) {
    filters.callerNumber = callerNumber;
  }

  if (typeof keyword === 'string' && keyword.length > 0) {
    filters.keyword = keyword;
  }

  if (typeof page === 'string') {
    const parsed = parseInt(page, 10);
    if (!isNaN(parsed) && parsed > 0) {
      filters.page = parsed;
    }
  }

  if (typeof pageSize === 'string') {
    const parsed = parseInt(pageSize, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      filters.pageSize = parsed;
    }
  }

  return filters;
}

/**
 * Handles errors in route handlers with consistent error response format.
 */
function handleRouteError(res: Response, error: unknown, defaultMessage: string): void {
  console.error(`[CallsRoute] ${defaultMessage}:`, error);

  const statusCode = (error as { statusCode?: number }).statusCode || 500;
  const message =
    statusCode === 500
      ? defaultMessage
      : (error as Error).message || defaultMessage;

  res.status(statusCode).json({
    error: 'INTERNAL_ERROR',
    message,
    timestamp: new Date().toISOString(),
  });
}
