import Redis from 'ioredis';

/**
 * Redis connection configuration.
 */
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
}

const DEFAULT_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: 'ai_receptionist:',
  maxRetriesPerRequest: 3,
};

/**
 * Creates a Redis client instance with the given configuration.
 * Supports REDIS_URL for hosted Redis (Render, Railway, etc.)
 */
function createClient(overrides?: Partial<RedisConfig>): Redis {
  const redisUrl = process.env.REDIS_URL;
  
  let client: Redis;
  if (redisUrl) {
    // Use connection URL if available (for hosted Redis)
    client = new Redis(redisUrl, {
      keyPrefix: overrides?.keyPrefix !== undefined ? overrides.keyPrefix : DEFAULT_CONFIG.keyPrefix,
      maxRetriesPerRequest: overrides?.maxRetriesPerRequest ?? DEFAULT_CONFIG.maxRetriesPerRequest,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    });
  } else {
    const config = { ...DEFAULT_CONFIG, ...overrides };
    client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });
  }

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  return client;
}

/**
 * Main Redis client for general caching operations.
 */
export const redisClient = createClient();

/**
 * Dedicated Redis client for pub/sub subscriptions.
 * A separate connection is required because a subscribed client
 * cannot issue other commands.
 */
export const redisSubscriber = createClient({
  keyPrefix: undefined, // Pub/sub channels should not be prefixed
});

/**
 * Dedicated Redis client for publishing events.
 */
export const redisPublisher = createClient({
  keyPrefix: undefined,
});

// ============================================================
// Pub/Sub helpers
// ============================================================

/**
 * Event channels used throughout the application.
 */
export const CHANNELS = {
  CALL_STARTED: 'events:call:started',
  CALL_ENDED: 'events:call:ended',
  LEAD_CAPTURED: 'events:lead:captured',
  SMS_QUEUED: 'events:sms:queued',
  SMS_FAILED: 'events:sms:failed',
  APPOINTMENT_BOOKED: 'events:appointment:booked',
  CRM_SYNC_REQUIRED: 'events:crm:sync',
  CONFIG_UPDATED: 'events:config:updated',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

/**
 * Publish a message to a channel.
 */
export async function publish(channel: Channel, data: unknown): Promise<void> {
  const message = JSON.stringify(data);
  await redisPublisher.publish(channel, message);
}

/**
 * Subscribe to a channel and invoke the handler on each message.
 */
export function subscribe(
  channel: Channel,
  handler: (data: unknown) => void
): void {
  redisSubscriber.subscribe(channel);
  redisSubscriber.on('message', (receivedChannel: string, message: string) => {
    if (receivedChannel === channel) {
      try {
        const parsed = JSON.parse(message);
        handler(parsed);
      } catch (err) {
        console.error(`[Redis] Failed to parse message on ${channel}:`, err);
      }
    }
  });
}

// ============================================================
// Caching helpers
// ============================================================

/**
 * Cache a value with an optional TTL in seconds.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await redisClient.set(key, serialized, 'EX', ttlSeconds);
  } else {
    await redisClient.set(key, serialized);
  }
}

/**
 * Retrieve a cached value by key. Returns null if not found.
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const raw = await redisClient.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDelete(key: string): Promise<void> {
  await redisClient.del(key);
}

/**
 * Invalidate all keys matching a pattern (e.g., `kb:business123:*`).
 * Uses SCAN to avoid blocking.
 */
export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  const prefix = DEFAULT_CONFIG.keyPrefix || '';
  const fullPattern = `${prefix}${pattern}`;
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redisClient.scan(
      cursor,
      'MATCH',
      fullPattern,
      'COUNT',
      100
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      // Strip prefix since del uses keyPrefix automatically
      const strippedKeys = keys.map((k) => k.replace(prefix, ''));
      await redisClient.del(...strippedKeys);
    }
  } while (cursor !== '0');
}

/**
 * Gracefully close all Redis connections.
 */
export async function disconnectAll(): Promise<void> {
  await Promise.all([
    redisClient.quit(),
    redisSubscriber.quit(),
    redisPublisher.quit(),
  ]);
}
