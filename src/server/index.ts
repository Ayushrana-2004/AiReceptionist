import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import { createAuthRouter } from './routes/auth';
import { redisSubscriber, redisPublisher, redisClient, CHANNELS } from './db/redis';
import routingRulesRouter from './routes/routingRules';
import leadsRouter from './routes/leads';
import configRouter from './routes/config';
import smsRouter from './routes/sms';
import analyticsRouter from './routes/analytics';
import integrationsRouter from './routes/integrations';
import { createKnowledgeBaseRouter } from './routes/knowledgeBase';
import { KnowledgeBaseService, IKBEntryRepository } from './services/knowledgeBase';
import { KBEntry } from '../shared/types/knowledgeBase';
import { KBCategory, Language } from '../shared/types/enums';

/**
 * Express application for the AI Receptionist backend.
 *
 * Configured with:
 * - CORS (allow all origins in development)
 * - JSON body parsing (10MB limit)
 * - URL-encoded body parsing
 * - JWT authentication middleware (skips webhook routes)
 * - Structured error handling
 * - Redis pub/sub event bus initialization
 */
const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS — allow all origins in development
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// JWT authentication (skips /api/webhooks/* and /api/auth/* routes)
app.use('/api', authMiddleware);

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// Auth routes (login, refresh) — these skip JWT auth via middleware
import { IUserRepository } from './services/auth';

/**
 * Register auth routes with the given user repository.
 * Call this during server startup with the actual repository implementation.
 */
export function registerAuthRoutes(repository: IUserRepository): void {
  app.use('/api/auth', createAuthRouter(repository));
}

// Feature routes
app.use('/api/routing-rules', routingRulesRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/config', configRouter);
app.use('/api/sms', smsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/integrations', integrationsRouter);

// Webhook routes (Vapi tool calls)
import { createWebhookRouter } from './routes/webhooks';
import { CalendlyAdapter } from './integrations/calendar';
import { computeDateRange } from './services/scheduler';

const calendlyAdapter = new CalendlyAdapter({
  accessToken: process.env.CALENDLY_ACCESS_TOKEN || '',
});
const calendlyEventTypeUri = process.env.CALENDLY_EVENT_TYPE_URI || '';

const webhookCallManager = {
  async handleCallStart() { return { callId: '', businessId: '', startedAt: new Date() }; },
  async handleCallEnd() {},
  async handleToolCall(event: any) {
    const { toolName, parameters } = event;
    try {
      switch (toolName) {
        case 'check_availability': {
          const preferredDate = new Date(parameters.preferredDate || Date.now());
          // Generate available slots for the next few days (business hours 9-5)
          const slots = [];
          for (let day = 0; day < 3; day++) {
            for (let hour = 9; hour < 17; hour += 2) {
              const start = new Date(preferredDate);
              start.setDate(start.getDate() + day);
              start.setHours(hour, 0, 0, 0);
              const end = new Date(start);
              end.setHours(hour + 1);
              slots.push({ start: start.toISOString(), end: end.toISOString() });
            }
          }
          return {
            success: true,
            toolName,
            data: { slots: slots.slice(0, 5) },
          };
        }
        case 'book_appointment': {
          const eventId = `appt_${Date.now()}`;
          // Send booking details to business owner via SMS
          const ownerPhone = process.env.OWNER_PHONE || process.env.TWILIO_PHONE_NUMBER || '';
          const twilioSid = process.env.TWILIO_ACCOUNT_SID || '';
          const twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
          const twilioFrom = process.env.TWILIO_PHONE_NUMBER || '';
          
          if (ownerPhone && twilioSid && twilioToken && twilioFrom) {
            const bookingMsg = `📅 New Booking!\nName: ${parameters.callerName}\nPhone: ${parameters.callerPhone}\nService: ${parameters.serviceType}\nTime: ${parameters.scheduledAt}\nRef: ${eventId}`;
            try {
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
              await fetch(twilioUrl, {
                method: 'POST',
                headers: {
                  'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64'),
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  To: ownerPhone,
                  From: twilioFrom,
                  Body: bookingMsg,
                }).toString(),
              });
              console.log(`[Booking] SMS sent to owner: ${ownerPhone}`);
            } catch (smsErr: any) {
              console.error('[Booking] Failed to send SMS to owner:', smsErr.message);
            }
          }
          return { success: true, toolName, data: { eventId, confirmed: true, scheduledAt: parameters.scheduledAt } };
        }
        case 'capture_lead': {
          return { success: true, toolName, data: { captured: true, ...parameters } };
        }
        case 'transfer_call': {
          return { success: true, toolName, data: { transferred: true, intent: parameters.intent } };
        }
        default:
          return { success: false, toolName, data: {}, error: `Unknown tool: ${toolName}` };
      }
    } catch (error: any) {
      return { success: false, toolName, data: {}, error: error.message || 'Tool call failed' };
    }
  },
  async getActiveCalls() { return []; },
  async getCallHistory() { return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }; },
} as any;

app.use('/api/webhooks', createWebhookRouter(webhookCallManager));

// Knowledge Base route (with Redis-backed repository)
const kbRepository: IKBEntryRepository = {
  entries: [] as KBEntry[],
  async findByBusinessId(businessId: string, category?: string) {
    const raw = await redisClient.get(`kb:${businessId}`);
    const all: KBEntry[] = raw ? JSON.parse(raw) : [];
    if (category) return all.filter(e => e.category === category);
    return all;
  },
  async findById(entryId: string) {
    // Search across all businesses (simplified for MVP)
    const keys = await redisClient.keys('kb:*');
    for (const key of keys) {
      const raw = await redisClient.get(key);
      const entries: KBEntry[] = raw ? JSON.parse(raw) : [];
      const found = entries.find(e => e.id === entryId);
      if (found) return found;
    }
    return null;
  },
  async countByBusinessId(businessId: string) {
    const raw = await redisClient.get(`kb:${businessId}`);
    const all: KBEntry[] = raw ? JSON.parse(raw) : [];
    return all.length;
  },
  async countByBusinessIdAndCategory(businessId: string, category: string) {
    const raw = await redisClient.get(`kb:${businessId}`);
    const all: KBEntry[] = raw ? JSON.parse(raw) : [];
    return all.filter(e => e.category === category).length;
  },
  async create(entry: KBEntry) {
    const raw = await redisClient.get(`kb:${entry.businessId}`);
    const all: KBEntry[] = raw ? JSON.parse(raw) : [];
    all.push(entry);
    await redisClient.set(`kb:${entry.businessId}`, JSON.stringify(all));
    return entry;
  },
  async update(entryId: string, updates: Partial<KBEntry>) {
    const keys = await redisClient.keys('kb:*');
    for (const key of keys) {
      const raw = await redisClient.get(key);
      const entries: KBEntry[] = raw ? JSON.parse(raw) : [];
      const idx = entries.findIndex(e => e.id === entryId);
      if (idx >= 0) {
        entries[idx] = { ...entries[idx], ...updates, updatedAt: new Date() };
        await redisClient.set(key, JSON.stringify(entries));
        return entries[idx];
      }
    }
    return null;
  },
  async delete(entryId: string) {
    const keys = await redisClient.keys('kb:*');
    for (const key of keys) {
      const raw = await redisClient.get(key);
      const entries: KBEntry[] = raw ? JSON.parse(raw) : [];
      const filtered = entries.filter(e => e.id !== entryId);
      if (filtered.length !== entries.length) {
        await redisClient.set(key, JSON.stringify(filtered));
        return;
      }
    }
  },
  async searchByBusinessId(businessId: string) {
    const raw = await redisClient.get(`kb:${businessId}`);
    return raw ? JSON.parse(raw) : [];
  },
} as IKBEntryRepository;

const kbService = new KnowledgeBaseService(kbRepository);
app.use('/api/knowledge-base', createKnowledgeBaseRouter(kbService));

// ---------------------------------------------------------------------------
// Health check endpoint
// ---------------------------------------------------------------------------

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// Redis Pub/Sub Event Bus initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the Redis pub/sub event bus.
 * Subscribes to all application event channels for async processing.
 */
export function initializeEventBus(): void {
  const channels = Object.values(CHANNELS);

  for (const channel of channels) {
    redisSubscriber.subscribe(channel);
  }

  redisSubscriber.on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      console.log(`[EventBus] Received event on ${channel}:`, data);
      // Event handlers will be registered by specific services
    } catch (err) {
      console.error(`[EventBus] Failed to parse message on ${channel}:`, err);
    }
  });

  console.log('[EventBus] Initialized — subscribed to all channels');
}

/**
 * Publish an event to the event bus.
 */
export async function publishEvent(channel: string, data: unknown): Promise<void> {
  const message = JSON.stringify(data);
  await redisPublisher.publish(channel, message);
}

// ---------------------------------------------------------------------------
// Error handling middleware
// ---------------------------------------------------------------------------

/**
 * Structured error response interface.
 */
interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
}

/**
 * Global error handling middleware.
 * Catches unhandled errors and returns structured error responses.
 */
app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  // Log the error
  console.error(`[Error] ${statusCode} - ${err.message}`, {
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  const errorResponse: ErrorResponse = {
    error: err.name || 'InternalServerError',
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(errorResponse);
});

export default app;

// ---------------------------------------------------------------------------
// Redis-backed User Repository
// ---------------------------------------------------------------------------

import type { User } from '../shared/types';

const redisUserRepository: IUserRepository = {
  async findByEmail(email: string): Promise<User | null> {
    const userId = await redisClient.get(`user:email:${email}`);
    if (!userId) return null;
    const raw = await redisClient.get(`user:${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  },

  async findByRefreshToken(_token: string): Promise<User | null> {
    // For MVP, refresh token lookup is not implemented
    return null;
  },

  async update(user: User): Promise<User> {
    await redisClient.set(`user:${user.id}`, JSON.stringify(user));
    return user;
  },
};

// ---------------------------------------------------------------------------
// Start server (when run directly)
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);

// Register auth routes with Redis-backed repository
registerAuthRoutes(redisUserRepository);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initializeEventBus();
});
