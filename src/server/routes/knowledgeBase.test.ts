import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createKnowledgeBaseRouter } from './knowledgeBase';
import { IKnowledgeBaseService, CreateKBEntryDTO, UpdateKBEntryDTO } from '../services/knowledgeBase';
import { KBEntry } from '../../shared/types/knowledgeBase';
import { KBCategory, Language } from '../../shared/types/enums';
import { Request, Response, Router } from 'express';

// Mock the inputValidator module to use real implementation
vi.mock('../validators/inputValidator', async () => {
  const actual = await vi.importActual('../validators/inputValidator');
  return actual;
});

function makeEntry(overrides: Partial<KBEntry> = {}): KBEntry {
  return {
    id: 'entry-1',
    businessId: 'biz-1',
    category: 'services' as KBCategory,
    question: 'What services do you offer?',
    answer: 'We offer web development and consulting.',
    language: 'en' as Language,
    keywords: ['services', 'offer'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createMockService(): IKnowledgeBaseService {
  return {
    getEntries: vi.fn().mockResolvedValue([makeEntry()]),
    createEntry: vi.fn().mockResolvedValue(makeEntry()),
    updateEntry: vi.fn().mockResolvedValue(makeEntry({ answer: 'Updated' })),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([makeEntry()]),
  };
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: { 'x-business-id': 'biz-1' },
    query: {},
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(data: unknown) {
      this._body = data;
      return this;
    },
    send() {
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

/**
 * Extracts route handlers from the Express router by method and path.
 */
function getRouteHandler(router: Router, method: string, path: string): Function | null {
  const stack = (router as any).stack;
  for (const layer of stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        // Return the last handler (the actual route handler, not middleware)
        const handlers = layer.route.stack;
        return handlers[handlers.length - 1].handle;
      }
    }
  }
  return null;
}

describe('Knowledge Base API Routes', () => {
  let router: Router;
  let mockService: IKnowledgeBaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    router = createKnowledgeBaseRouter(mockService);
  });

  describe('GET /api/knowledge-base', () => {
    it('returns entries for the business', async () => {
      const handler = getRouteHandler(router, 'get', '/');
      const req = createMockRequest();
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(200);
      expect((res._body as any).entries).toHaveLength(1);
      expect(mockService.getEntries).toHaveBeenCalledWith('biz-1', undefined);
    });

    it('passes category filter to service', async () => {
      const handler = getRouteHandler(router, 'get', '/');
      const req = createMockRequest({ query: { category: 'services' } as any });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(200);
      expect(mockService.getEntries).toHaveBeenCalledWith('biz-1', 'services');
    });

    it('rejects invalid category filter', async () => {
      const handler = getRouteHandler(router, 'get', '/');
      const req = createMockRequest({ query: { category: 'invalid' } as any });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('INVALID_CATEGORY');
    });
  });

  describe('POST /api/knowledge-base', () => {
    it('creates an entry with valid input', async () => {
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: {
          category: 'services',
          question: 'What do you offer?',
          answer: 'Web development services.',
        },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(201);
      expect((res._body as any).entry).toBeDefined();
      expect(mockService.createEntry).toHaveBeenCalledWith('biz-1', {
        category: 'services',
        question: 'What do you offer?',
        answer: 'Web development services.',
        language: undefined,
        keywords: undefined,
      });
    });

    it('returns 400 when required fields are missing', async () => {
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: { category: 'services', question: 'Hello?' },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('VALIDATION_ERROR');
      expect((res._body as any).message).toContain('required');
    });

    it('returns 400 for invalid category', async () => {
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: {
          category: 'invalid_cat',
          question: 'Test?',
          answer: 'Answer',
        },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('INVALID_CATEGORY');
    });

    it('returns 400 when question exceeds max length (200 chars)', async () => {
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: {
          category: 'services',
          question: 'x'.repeat(201),
          answer: 'Valid answer',
        },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('VALIDATION_ERROR');
      expect((res._body as any).fields[0].field).toBe('kbQuestion');
    });

    it('returns 400 when answer exceeds max length (2000 chars)', async () => {
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: {
          category: 'services',
          question: 'Valid question',
          answer: 'x'.repeat(2001),
        },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('VALIDATION_ERROR');
      expect((res._body as any).fields[0].field).toBe('kbAnswer');
    });

    it('returns 400 when question is empty string', async () => {
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: {
          category: 'services',
          question: '',
          answer: 'Valid answer',
        },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('VALIDATION_ERROR');
    });

    it('returns 409 when capacity is exceeded', async () => {
      (mockService.createEntry as any).mockRejectedValue(
        new Error('Knowledge base cannot exceed 500 entries total')
      );

      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: {
          category: 'services',
          question: 'New question?',
          answer: 'New answer',
        },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(409);
      expect((res._body as any).error).toBe('CAPACITY_EXCEEDED');
    });

    it('passes optional language and keywords to service', async () => {
      const handler = getRouteHandler(router, 'post', '/');
      const req = createMockRequest({
        body: {
          category: 'pricing',
          question: '¿Cuánto cuesta?',
          answer: '$50 por hora.',
          language: 'es',
          keywords: ['precio', 'cuesta'],
        },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(201);
      expect(mockService.createEntry).toHaveBeenCalledWith('biz-1', {
        category: 'pricing',
        question: '¿Cuánto cuesta?',
        answer: '$50 por hora.',
        language: 'es',
        keywords: ['precio', 'cuesta'],
      });
    });
  });

  describe('PUT /api/knowledge-base/:id', () => {
    it('updates an entry with valid input', async () => {
      const handler = getRouteHandler(router, 'put', '/:id');
      const req = createMockRequest({
        params: { id: 'entry-1' } as any,
        body: { answer: 'Updated answer content' },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(200);
      expect(mockService.updateEntry).toHaveBeenCalledWith('entry-1', {
        answer: 'Updated answer content',
      });
    });

    it('validates question length on update', async () => {
      const handler = getRouteHandler(router, 'put', '/:id');
      const req = createMockRequest({
        params: { id: 'entry-1' } as any,
        body: { question: 'x'.repeat(201) },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('VALIDATION_ERROR');
      expect((res._body as any).fields[0].field).toBe('kbQuestion');
    });

    it('validates answer length on update', async () => {
      const handler = getRouteHandler(router, 'put', '/:id');
      const req = createMockRequest({
        params: { id: 'entry-1' } as any,
        body: { answer: 'x'.repeat(2001) },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('VALIDATION_ERROR');
      expect((res._body as any).fields[0].field).toBe('kbAnswer');
    });

    it('returns 400 for invalid category on update', async () => {
      const handler = getRouteHandler(router, 'put', '/:id');
      const req = createMockRequest({
        params: { id: 'entry-1' } as any,
        body: { category: 'invalid_cat' },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(400);
      expect((res._body as any).error).toBe('INVALID_CATEGORY');
    });

    it('returns 404 when entry not found', async () => {
      (mockService.updateEntry as any).mockRejectedValue(
        new Error('KB entry not found: nonexistent')
      );

      const handler = getRouteHandler(router, 'put', '/:id');
      const req = createMockRequest({
        params: { id: 'nonexistent' } as any,
        body: { answer: 'Some update' },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(404);
      expect((res._body as any).error).toBe('NOT_FOUND');
    });

    it('only sends provided fields to service', async () => {
      const handler = getRouteHandler(router, 'put', '/:id');
      const req = createMockRequest({
        params: { id: 'entry-1' } as any,
        body: { category: 'pricing', language: 'fr' },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(200);
      expect(mockService.updateEntry).toHaveBeenCalledWith('entry-1', {
        category: 'pricing',
        language: 'fr',
      });
    });
  });

  describe('DELETE /api/knowledge-base/:id', () => {
    it('deletes an entry and returns 204', async () => {
      const handler = getRouteHandler(router, 'delete', '/:id');
      const req = createMockRequest({
        params: { id: 'entry-1' } as any,
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(204);
      expect(mockService.deleteEntry).toHaveBeenCalledWith('entry-1');
    });

    it('returns 404 when entry not found', async () => {
      (mockService.deleteEntry as any).mockRejectedValue(
        new Error('KB entry not found: nonexistent')
      );

      const handler = getRouteHandler(router, 'delete', '/:id');
      const req = createMockRequest({
        params: { id: 'nonexistent' } as any,
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(404);
      expect((res._body as any).error).toBe('NOT_FOUND');
    });
  });

  describe('Error handling', () => {
    it('returns 500 for unexpected errors', async () => {
      (mockService.getEntries as any).mockRejectedValue(new Error('DB connection lost'));

      const handler = getRouteHandler(router, 'get', '/');
      const req = createMockRequest();
      const res = createMockResponse();

      await handler!(req, res);

      expect(res._status).toBe(500);
      expect((res._body as any).error).toBe('INTERNAL_ERROR');
      expect((res._body as any).message).toBe('DB connection lost');
    });
  });
});
