/**
 * Knowledge Base API Routes
 *
 * Provides CRUD endpoints for managing Knowledge Base entries:
 * - GET  /api/knowledge-base      — List entries (optional category filter)
 * - POST /api/knowledge-base      — Create a new entry (with validation & capacity checks)
 * - PUT  /api/knowledge-base/:id  — Update an existing entry (with validation)
 * - DELETE /api/knowledge-base/:id — Delete an entry
 *
 * Validates: Requirements 3.1, 3.4, 3.5, 3.6
 */

import { Router, Request, Response } from 'express';
import {
  IKnowledgeBaseService,
  CreateKBEntryDTO,
  UpdateKBEntryDTO,
} from '../services/knowledgeBase';
import {
  validateInput,
  formatValidationErrorResponse,
} from '../validators/inputValidator';
import { KBCategory } from '../../shared/types/enums';

const VALID_CATEGORIES: KBCategory[] = [
  'business_hours',
  'services',
  'pricing',
  'location',
  'custom',
];

/**
 * Creates the knowledge base router with the given service dependency.
 */
export function createKnowledgeBaseRouter(
  service: IKnowledgeBaseService
): Router {
  const router = Router();

  /**
   * GET /api/knowledge-base
   * List KB entries for the authenticated user's business.
   * Optional query param: ?category=services
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const businessId = getBusinessId(req);
      const category = req.query.category as string | undefined;

      // Validate category if provided
      if (category && !VALID_CATEGORIES.includes(category as KBCategory)) {
        res.status(400).json({
          error: 'INVALID_CATEGORY',
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
        return;
      }

      const entries = await service.getEntries(businessId, category);
      res.json({ entries });
    } catch (err) {
      handleError(res, err);
    }
  });

  /**
   * POST /api/knowledge-base
   * Create a new KB entry.
   * Body: { category, question, answer, language?, keywords? }
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const businessId = getBusinessId(req);
      const { category, question, answer, language, keywords } = req.body;

      // Validate required fields presence
      if (!category || !question || !answer) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Fields category, question, and answer are required',
        });
        return;
      }

      // Validate category
      if (!VALID_CATEGORIES.includes(category as KBCategory)) {
        res.status(400).json({
          error: 'INVALID_CATEGORY',
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
        return;
      }

      // Validate input lengths
      const validationResult = validateInput({
        kbQuestion: question,
        kbAnswer: answer,
      });

      if (!validationResult.valid) {
        res.status(400).json(formatValidationErrorResponse(validationResult));
        return;
      }

      const dto: CreateKBEntryDTO = {
        category: category as KBCategory,
        question,
        answer,
        language,
        keywords,
      };

      const entry = await service.createEntry(businessId, dto);
      res.status(201).json({ entry });
    } catch (err) {
      // Capacity errors thrown by the service
      if (err instanceof Error && /cannot exceed/i.test(err.message)) {
        res.status(409).json({
          error: 'CAPACITY_EXCEEDED',
          message: err.message,
        });
        return;
      }
      handleError(res, err);
    }
  });

  /**
   * PUT /api/knowledge-base/:id
   * Update an existing KB entry.
   * Body: { category?, question?, answer?, language?, keywords? }
   */
  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const entryId = req.params.id;
      const { category, question, answer, language, keywords } = req.body;

      // Validate category if provided
      if (category && !VALID_CATEGORIES.includes(category as KBCategory)) {
        res.status(400).json({
          error: 'INVALID_CATEGORY',
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
        return;
      }

      // Validate input lengths for provided fields
      const fieldsToValidate: Record<string, string> = {};
      if (question !== undefined) fieldsToValidate.kbQuestion = question;
      if (answer !== undefined) fieldsToValidate.kbAnswer = answer;

      if (Object.keys(fieldsToValidate).length > 0) {
        const validationResult = validateInput(fieldsToValidate);
        if (!validationResult.valid) {
          res.status(400).json(formatValidationErrorResponse(validationResult));
          return;
        }
      }

      const updates: UpdateKBEntryDTO = {};
      if (category !== undefined) updates.category = category as KBCategory;
      if (question !== undefined) updates.question = question;
      if (answer !== undefined) updates.answer = answer;
      if (language !== undefined) updates.language = language;
      if (keywords !== undefined) updates.keywords = keywords;

      const entry = await service.updateEntry(entryId, updates);
      res.json({ entry });
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: err.message,
        });
        return;
      }
      handleError(res, err);
    }
  });

  /**
   * DELETE /api/knowledge-base/:id
   * Delete a KB entry.
   */
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const entryId = req.params.id;
      await service.deleteEntry(entryId);
      res.status(204).send();
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: err.message,
        });
        return;
      }
      handleError(res, err);
    }
  });

  return router;
}

/**
 * Extract the business ID from the authenticated request.
 * In a real implementation, this would come from the user's JWT claims
 * or a user-to-business mapping. For now, we use a header or default.
 */
function getBusinessId(req: Request): string {
  return (req.headers['x-business-id'] as string) || 'biz_001';
}

/**
 * Generic error handler for route errors.
 */
function handleError(res: Response, err: unknown): void {
  console.error('[KnowledgeBase Route Error]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message,
  });
}
