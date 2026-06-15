import { Business } from '../../shared/types';
import { Language } from '../../shared/types/enums';
import { subscribe, CHANNELS } from '../db/redis';

// ============================================================
// Vapi API Configuration
// ============================================================

const VAPI_BASE_URL = 'https://api.vapi.ai';

function getApiKey(): string {
  const key = process.env.VAPI_API_KEY;
  if (!key) {
    throw new Error('VAPI_API_KEY environment variable is not set');
  }
  return key;
}

// ============================================================
// Interfaces
// ============================================================

/**
 * Tool definition for Vapi assistant configuration.
 * Defines the tools Claude can call during a conversation.
 */
export interface VapiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

/**
 * Voice configuration for the Vapi assistant.
 */
export interface VapiVoiceConfig {
  provider: string;
  voiceId: string;
}

/**
 * Full Vapi assistant configuration mapped from business config.
 */
export interface VapiAssistantConfig {
  name: string;
  firstMessage: string;
  model: {
    provider: 'anthropic';
    model: string;
    tools: VapiToolDefinition[];
    systemPrompt: string;
  };
  voice: VapiVoiceConfig;
  language: string;
  supportedLanguages: string[];
  silenceTimeoutSeconds: number;
  maxDurationSeconds: number;
  endCallAfterSilenceSeconds: number;
}

/**
 * Response from the Vapi API when creating/updating an assistant.
 */
export interface VapiAssistantResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Config update event payload from Redis pub/sub.
 */
interface ConfigUpdatedEvent {
  businessId: string;
  assistantId?: string;
  config: Business;
}

// ============================================================
// Tool Definitions for Claude
// ============================================================

/**
 * Tool definitions that Claude uses during Vapi calls.
 * These correspond to the tool-call dispatch in the Call Manager.
 */
export const VAPI_TOOL_DEFINITIONS: VapiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description:
        'Check calendar availability for appointment booking. Returns available time slots within a 7-day window from the preferred date.',
      parameters: {
        type: 'object',
        properties: {
          preferredDate: {
            type: 'string',
            description: 'The caller\'s preferred date in ISO 8601 format (YYYY-MM-DD)',
          },
          serviceType: {
            type: 'string',
            description: 'The type of service the caller wants to book',
          },
        },
        required: ['preferredDate', 'serviceType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description:
        'Book an appointment for the caller at the specified time slot. Creates a calendar event and sends SMS confirmation.',
      parameters: {
        type: 'object',
        properties: {
          callerName: {
            type: 'string',
            description: 'The caller\'s full name',
          },
          callerPhone: {
            type: 'string',
            description: 'The caller\'s phone number in E.164 format',
          },
          serviceType: {
            type: 'string',
            description: 'The type of service being booked',
          },
          scheduledAt: {
            type: 'string',
            description: 'The confirmed appointment time in ISO 8601 format',
          },
        },
        required: ['callerName', 'callerPhone', 'serviceType', 'scheduledAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'capture_lead',
      description:
        'Capture caller information as a lead. Collects contact details and reason for calling, then syncs to CRM.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The caller\'s name (max 100 characters)',
          },
          phone: {
            type: 'string',
            description: 'The caller\'s phone number in E.164 format',
          },
          email: {
            type: 'string',
            description: 'The caller\'s email address (optional)',
          },
          reason: {
            type: 'string',
            description: 'The reason for calling (max 500 characters)',
          },
        },
        required: ['name', 'phone', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_call',
      description:
        'Transfer the call to a human agent or department. Used when the AI cannot resolve the request or the caller explicitly asks.',
      parameters: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            description: 'The detected intent category for routing',
            enum: ['sales', 'support', 'billing', 'emergency', 'general'],
          },
          description: {
            type: 'string',
            description: 'Brief description of the caller\'s request (max 200 characters)',
          },
        },
        required: ['intent', 'description'],
      },
    },
  },
];

// ============================================================
// Voice Profile Mapping
// ============================================================

/**
 * Maps internal voice profile IDs to Vapi/ElevenLabs voice configurations.
 */
const VOICE_PROFILE_MAP: Record<string, VapiVoiceConfig> = {
  'voice-professional-female': { provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' },
  'voice-friendly-male': { provider: 'elevenlabs', voiceId: 'ErXwobaYiN019PkySvjV' },
  'voice-calm-neutral': { provider: 'elevenlabs', voiceId: 'MF3mGyEYCl7XYWbV9V6O' },
};

const DEFAULT_VOICE: VapiVoiceConfig = { provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' };

// ============================================================
// Language Mapping
// ============================================================

/**
 * Maps internal language codes to Vapi-compatible language strings.
 */
const LANGUAGE_MAP: Record<Language, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  zh: 'zh-CN',
};

// ============================================================
// VapiClient Class
// ============================================================

// ============================================================
// Retry Configuration
// ============================================================

/** HTTP status codes considered transient (retryable). */
const TRANSIENT_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/** Maximum number of retry attempts for transient failures. */
const MAX_RETRIES = 3;

/** Base delay between retries in milliseconds (exponential backoff). */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Configuration options for the VapiClient.
 */
export interface VapiClientOptions {
  /** Base URL for the Vapi API */
  baseUrl?: string;
  /** Maximum number of retries for transient failures (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryBaseDelayMs?: number;
}

/**
 * Client for managing Vapi assistants.
 *
 * Handles creating, updating, deleting, and fetching Vapi assistant
 * configurations. Maps business config (greeting, voice, languages)
 * to Vapi's API format.
 *
 * Includes retry logic with exponential backoff for transient failures.
 */
export class VapiClient {
  private baseUrl: string;
  private maxRetries: number;
  private retryBaseDelayMs: number;

  constructor(baseUrlOrOptions?: string | VapiClientOptions) {
    if (typeof baseUrlOrOptions === 'string') {
      this.baseUrl = baseUrlOrOptions;
      this.maxRetries = MAX_RETRIES;
      this.retryBaseDelayMs = RETRY_BASE_DELAY_MS;
    } else {
      const opts = baseUrlOrOptions || {};
      this.baseUrl = opts.baseUrl || VAPI_BASE_URL;
      this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
      this.retryBaseDelayMs = opts.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS;
    }
  }

  /**
   * Build headers for Vapi API requests.
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Execute a fetch request with retry logic for transient failures.
   * Uses exponential backoff between retries.
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    operationName: string
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // If response is not a transient error, return it (caller handles non-OK)
        if (response.ok || !TRANSIENT_STATUS_CODES.includes(response.status)) {
          return response;
        }

        // Transient error — retry if we have attempts left
        if (attempt < this.maxRetries) {
          const delay = this.retryBaseDelayMs * Math.pow(2, attempt);
          console.warn(
            `[Vapi] ${operationName} returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`
          );
          await this.sleep(delay);
        } else {
          return response; // Final attempt, return the error response
        }
      } catch (error) {
        // Network-level errors (DNS, timeout, etc.)
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const delay = this.retryBaseDelayMs * Math.pow(2, attempt);
          console.warn(
            `[Vapi] ${operationName} network error, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}): ${lastError.message}`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after ${this.maxRetries} retries`);
  }

  /**
   * Sleep for a given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Map a Business config to a VapiAssistantConfig.
   */
  buildAssistantConfig(business: Business): VapiAssistantConfig {
    const primaryLanguage = business.enabledLanguages[0] || 'en';
    const voice = VOICE_PROFILE_MAP[business.voiceProfileId] || DEFAULT_VOICE;

    const systemPrompt = [
      `You are a professional AI receptionist for ${business.name}.`,
      'You handle inbound calls, answer questions, book appointments, capture leads, and transfer calls when needed.',
      'Always be polite, concise, and helpful.',
      `You can speak the following languages: ${business.enabledLanguages.map((l) => LANGUAGE_MAP[l]).join(', ')}.`,
      'Detect the caller\'s language and respond in the same language.',
      'If you cannot resolve the caller\'s request, offer to transfer them to a human agent.',
    ].join(' ');

    return {
      name: `${business.name} AI Receptionist`,
      firstMessage: business.greeting,
      model: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        tools: VAPI_TOOL_DEFINITIONS,
        systemPrompt,
      },
      voice,
      language: LANGUAGE_MAP[primaryLanguage],
      supportedLanguages: business.enabledLanguages.map((l) => LANGUAGE_MAP[l]),
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 1800, // 30 minutes max call duration
      endCallAfterSilenceSeconds: 30,
    };
  }

  /**
   * Register a new assistant with Vapi.
   * Retries on transient failures with exponential backoff.
   */
  async createAssistant(config: Business): Promise<VapiAssistantResponse> {
    const assistantConfig = this.buildAssistantConfig(config);

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/assistant`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(assistantConfig),
      },
      'createAssistant'
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Vapi createAssistant failed (${response.status}): ${errorBody}`
      );
    }

    return response.json() as Promise<VapiAssistantResponse>;
  }

  /**
   * Update an existing Vapi assistant's configuration.
   * Retries on transient failures with exponential backoff.
   */
  async updateAssistant(
    assistantId: string,
    config: Business
  ): Promise<VapiAssistantResponse> {
    const assistantConfig = this.buildAssistantConfig(config);

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/assistant/${assistantId}`,
      {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(assistantConfig),
      },
      'updateAssistant'
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Vapi updateAssistant failed (${response.status}): ${errorBody}`
      );
    }

    return response.json() as Promise<VapiAssistantResponse>;
  }

  /**
   * Delete a Vapi assistant.
   * Retries on transient failures with exponential backoff.
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/assistant/${assistantId}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      },
      'deleteAssistant'
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Vapi deleteAssistant failed (${response.status}): ${errorBody}`
      );
    }
  }

  /**
   * Fetch the current configuration of a Vapi assistant.
   * Retries on transient failures with exponential backoff.
   */
  async getAssistant(assistantId: string): Promise<VapiAssistantResponse> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/assistant/${assistantId}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      },
      'getAssistant'
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Vapi getAssistant failed (${response.status}): ${errorBody}`
      );
    }

    return response.json() as Promise<VapiAssistantResponse>;
  }
}

// ============================================================
// Config Propagation
// ============================================================

/**
 * Debounce implementation for config propagation.
 * Ensures rapid config changes are batched, preventing Vapi API rate limiting.
 */
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delayMs);
  };
}

/**
 * Set up config propagation from dashboard changes to Vapi.
 *
 * Subscribes to the CONFIG_UPDATED Redis pub/sub channel and
 * updates the Vapi assistant configuration within 30 seconds
 * of any dashboard change. Rapid changes are debounced to avoid
 * hitting API rate limits.
 *
 * @param vapiClient - The VapiClient instance to use for updates
 * @returns A cleanup function to unsubscribe
 */
export function setupConfigPropagation(vapiClient?: VapiClient): () => void {
  const client = vapiClient || new VapiClient();
  let isActive = true;

  // Debounce updates to 5 seconds — ensures we don't spam the Vapi API
  // while still propagating within the 30s requirement
  const debouncedUpdate = debounce(
    async (...args: unknown[]) => {
      const event = args[0] as ConfigUpdatedEvent;
      if (!isActive) return;

      const { assistantId, config } = event;
      if (!assistantId || !config) {
        console.warn('[Vapi] CONFIG_UPDATED event missing assistantId or config, skipping');
        return;
      }

      try {
        await client.updateAssistant(assistantId, config);
        console.log(
          `[Vapi] Assistant ${assistantId} updated for business ${config.name}`
        );
      } catch (error) {
        console.error('[Vapi] Failed to propagate config update:', error);
      }
    },
    5000
  );

  // Subscribe to CONFIG_UPDATED events on Redis pub/sub
  subscribe(CHANNELS.CONFIG_UPDATED, (data: unknown) => {
    if (!isActive) return;
    const event = data as ConfigUpdatedEvent;

    console.log(
      `[Vapi] Received CONFIG_UPDATED for business: ${event.businessId}`
    );

    debouncedUpdate(event);
  });

  // Return cleanup function
  return () => {
    isActive = false;
  };
}

