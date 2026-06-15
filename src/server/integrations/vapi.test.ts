import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VapiClient,
  VapiAssistantConfig,
  VAPI_TOOL_DEFINITIONS,
  setupConfigPropagation,
} from './vapi';
import { Business } from '../../shared/types';
import { subscribe } from '../db/redis';

// Mock Redis subscription
vi.mock('../db/redis', () => ({
  subscribe: vi.fn(),
  CHANNELS: {
    CONFIG_UPDATED: 'events:config:updated',
  },
}));

// Helper to create a mock Business config
function createMockBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz-123',
    name: 'Test Business',
    greeting: 'Hello! Thank you for calling Test Business. How can I help you?',
    voiceProfileId: 'voice-professional-female',
    enabledLanguages: ['en', 'es'],
    operatingHours: {
      timezone: 'America/New_York',
      schedule: {
        monday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        tuesday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        wednesday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        thursday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        friday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        saturday: { openTime: '10:00', closeTime: '14:00', isOpen: true },
        sunday: { openTime: '00:00', closeTime: '00:00', isOpen: false },
      },
    },
    maxConcurrentCalls: 50,
    callTimeoutSeconds: 300,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('VapiClient', () => {
  let client: VapiClient;

  beforeEach(() => {
    process.env.VAPI_API_KEY = 'test-api-key-123';
    client = new VapiClient({ baseUrl: 'https://mock-vapi.test', maxRetries: 0, retryBaseDelayMs: 0 });
  });

  afterEach(() => {
    delete process.env.VAPI_API_KEY;
    vi.restoreAllMocks();
  });

  describe('buildAssistantConfig', () => {
    it('should map business greeting to firstMessage', () => {
      const business = createMockBusiness();
      const config = client.buildAssistantConfig(business);
      expect(config.firstMessage).toBe(business.greeting);
    });

    it('should set assistant name from business name', () => {
      const business = createMockBusiness({ name: 'Acme Corp' });
      const config = client.buildAssistantConfig(business);
      expect(config.name).toBe('Acme Corp AI Receptionist');
    });

    it('should configure Claude as the LLM provider', () => {
      const business = createMockBusiness();
      const config = client.buildAssistantConfig(business);
      expect(config.model.provider).toBe('anthropic');
      expect(config.model.model).toBe('claude-sonnet-4-20250514');
    });

    it('should include all tool definitions', () => {
      const business = createMockBusiness();
      const config = client.buildAssistantConfig(business);
      const toolNames = config.model.tools.map((t) => t.function.name);
      expect(toolNames).toContain('check_availability');
      expect(toolNames).toContain('book_appointment');
      expect(toolNames).toContain('capture_lead');
      expect(toolNames).toContain('transfer_call');
    });

    it('should map voiceProfileId to voice config', () => {
      const business = createMockBusiness({ voiceProfileId: 'voice-friendly-male' });
      const config = client.buildAssistantConfig(business);
      expect(config.voice.provider).toBe('elevenlabs');
      expect(config.voice.voiceId).toBe('ErXwobaYiN019PkySvjV');
    });

    it('should use default voice for unknown voiceProfileId', () => {
      const business = createMockBusiness({ voiceProfileId: 'unknown-voice' });
      const config = client.buildAssistantConfig(business);
      expect(config.voice.provider).toBe('elevenlabs');
      expect(config.voice.voiceId).toBe('21m00Tcm4TlvDq8ikWAM');
    });

    it('should map enabled languages to Vapi language codes', () => {
      const business = createMockBusiness({ enabledLanguages: ['en', 'es', 'fr', 'zh'] });
      const config = client.buildAssistantConfig(business);
      expect(config.supportedLanguages).toEqual(['en-US', 'es-ES', 'fr-FR', 'zh-CN']);
    });

    it('should set primary language from first enabled language', () => {
      const business = createMockBusiness({ enabledLanguages: ['fr', 'en'] });
      const config = client.buildAssistantConfig(business);
      expect(config.language).toBe('fr-FR');
    });

    it('should default to en-US when no languages configured', () => {
      const business = createMockBusiness({ enabledLanguages: [] });
      const config = client.buildAssistantConfig(business);
      expect(config.language).toBe('en-US');
    });

    it('should set maxDurationSeconds to 1800 (30 min)', () => {
      const business = createMockBusiness();
      const config = client.buildAssistantConfig(business);
      expect(config.maxDurationSeconds).toBe(1800);
    });

    it('should include system prompt with business name', () => {
      const business = createMockBusiness({ name: 'My Restaurant' });
      const config = client.buildAssistantConfig(business);
      expect(config.model.systemPrompt).toContain('My Restaurant');
    });
  });

  describe('createAssistant', () => {
    it('should call Vapi API with correct endpoint and body', async () => {
      const mockResponse = { id: 'asst-456', name: 'Test', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 201 })
      );

      const business = createMockBusiness();
      const result = await client.createAssistant(business);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://mock-vapi.test/assistant',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key-123',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.id).toBe('asst-456');
    });

    it('should throw on API error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Unauthorized', { status: 401 })
      );

      const business = createMockBusiness();
      await expect(client.createAssistant(business)).rejects.toThrow(
        'Vapi createAssistant failed (401)'
      );
    });
  });

  describe('updateAssistant', () => {
    it('should call PATCH with assistant ID', async () => {
      const mockResponse = { id: 'asst-456', name: 'Updated', createdAt: '2024-01-01', updatedAt: '2024-01-02' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const business = createMockBusiness();
      const result = await client.updateAssistant('asst-456', business);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://mock-vapi.test/assistant/asst-456',
        expect.objectContaining({ method: 'PATCH' })
      );
      expect(result.id).toBe('asst-456');
    });

    it('should throw on update failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 })
      );

      const business = createMockBusiness();
      await expect(client.updateAssistant('nonexistent', business)).rejects.toThrow(
        'Vapi updateAssistant failed (404)'
      );
    });
  });

  describe('deleteAssistant', () => {
    it('should call DELETE with assistant ID', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 204 })
      );

      await client.deleteAssistant('asst-456');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://mock-vapi.test/assistant/asst-456',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should throw on delete failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Server Error', { status: 500 })
      );

      await expect(client.deleteAssistant('asst-456')).rejects.toThrow(
        'Vapi deleteAssistant failed (500)'
      );
    });
  });

  describe('getAssistant', () => {
    it('should call GET with assistant ID', async () => {
      const mockResponse = { id: 'asst-456', name: 'Test', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const result = await client.getAssistant('asst-456');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://mock-vapi.test/assistant/asst-456',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.id).toBe('asst-456');
    });

    it('should throw on fetch failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 })
      );

      await expect(client.getAssistant('nonexistent')).rejects.toThrow(
        'Vapi getAssistant failed (404)'
      );
    });
  });

  describe('retry logic', () => {
    let retryClient: VapiClient;

    beforeEach(() => {
      retryClient = new VapiClient({ baseUrl: 'https://mock-vapi.test', maxRetries: 2, retryBaseDelayMs: 0 });
    });

    it('should retry on transient 503 and succeed on subsequent attempt', async () => {
      const mockResponse = { id: 'asst-456', name: 'Test', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

      const result = await retryClient.getAssistant('asst-456');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('asst-456');
    });

    it('should not retry on non-transient 401 error', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Unauthorized', { status: 401 })
      );

      await expect(retryClient.createAssistant(createMockBusiness())).rejects.toThrow(
        'Vapi createAssistant failed (401)'
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw on persistent transient error', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Bad Gateway', { status: 502 })
      );

      await expect(retryClient.updateAssistant('asst-456', createMockBusiness())).rejects.toThrow(
        'Vapi updateAssistant failed (502)'
      );

      // 1 initial + 2 retries = 3 total
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors', async () => {
      const mockResponse = { id: 'asst-456', name: 'Test', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

      const result = await retryClient.getAssistant('asst-456');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('asst-456');
    });
  });
});

describe('VAPI_TOOL_DEFINITIONS', () => {
  it('should define check_availability with correct params', () => {
    const tool = VAPI_TOOL_DEFINITIONS.find((t) => t.function.name === 'check_availability');
    expect(tool).toBeDefined();
    expect(tool!.function.parameters.required).toContain('preferredDate');
    expect(tool!.function.parameters.required).toContain('serviceType');
  });

  it('should define book_appointment with correct params', () => {
    const tool = VAPI_TOOL_DEFINITIONS.find((t) => t.function.name === 'book_appointment');
    expect(tool).toBeDefined();
    expect(tool!.function.parameters.required).toContain('callerName');
    expect(tool!.function.parameters.required).toContain('callerPhone');
    expect(tool!.function.parameters.required).toContain('serviceType');
    expect(tool!.function.parameters.required).toContain('scheduledAt');
  });

  it('should define capture_lead with correct params', () => {
    const tool = VAPI_TOOL_DEFINITIONS.find((t) => t.function.name === 'capture_lead');
    expect(tool).toBeDefined();
    expect(tool!.function.parameters.required).toContain('name');
    expect(tool!.function.parameters.required).toContain('phone');
    expect(tool!.function.parameters.required).toContain('reason');
    // email is optional
    expect(tool!.function.parameters.required).not.toContain('email');
  });

  it('should define transfer_call with correct params', () => {
    const tool = VAPI_TOOL_DEFINITIONS.find((t) => t.function.name === 'transfer_call');
    expect(tool).toBeDefined();
    expect(tool!.function.parameters.required).toContain('intent');
    expect(tool!.function.parameters.required).toContain('description');
    expect(tool!.function.parameters.properties.intent.enum).toContain('sales');
    expect(tool!.function.parameters.properties.intent.enum).toContain('support');
    expect(tool!.function.parameters.properties.intent.enum).toContain('billing');
    expect(tool!.function.parameters.properties.intent.enum).toContain('emergency');
  });

  it('should have all tools typed as function', () => {
    for (const tool of VAPI_TOOL_DEFINITIONS) {
      expect(tool.type).toBe('function');
    }
  });
});

describe('setupConfigPropagation', () => {
  it('should subscribe to CONFIG_UPDATED channel', () => {
    const mockClient = new VapiClient({ baseUrl: 'https://mock-vapi.test', maxRetries: 0 });

    setupConfigPropagation(mockClient);

    expect(subscribe).toHaveBeenCalledWith(
      'events:config:updated',
      expect.any(Function)
    );
  });

  it('should return a cleanup function', () => {
    const mockClient = new VapiClient({ baseUrl: 'https://mock-vapi.test', maxRetries: 0 });
    const cleanup = setupConfigPropagation(mockClient);
    expect(typeof cleanup).toBe('function');
    // Should not throw when called
    cleanup();
  });
});
