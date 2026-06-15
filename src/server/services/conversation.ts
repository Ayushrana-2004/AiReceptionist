/**
 * Conversation Service
 *
 * Handles conversation-level logic for the AI Receptionist:
 * - STT rephrasing: generates distinct prompts on STT failure (up to 3), then offers transfer
 * - Context retention: maintains conversation state for calls ≤30 minutes
 * - Intent classification: dispatches caller intent to tool calls (booking, routing, lead capture)
 *
 * Requirements: 10.3, 10.4, 10.5, 10.6
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single message within the conversation */
export interface ConversationMessage {
  speaker: 'AI' | 'Caller';
  text: string;
  timestamp: Date;
}

/** Intent categories that drive tool call dispatching */
export type IntentCategory = 'booking' | 'routing' | 'lead_capture' | 'faq' | 'general';

/** Result of intent classification */
export interface IntentClassification {
  /** Primary detected intent category */
  category: IntentCategory;
  /** Confidence score (0–1) */
  confidence: number;
  /** Extracted entities from the utterance */
  entities: Record<string, string>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_REPHRASING_PROMPTS = 3;
const MAX_CONVERSATION_DURATION_MINUTES = 30;

/**
 * Pool of rephrasing templates used to generate distinct prompts
 * when the STT engine cannot understand the caller.
 */
const REPHRASING_TEMPLATES: string[] = [
  "I'm sorry, I didn't quite catch that. Could you please repeat what you said?",
  "I apologize, but I'm having trouble understanding. Could you say that again, perhaps a bit more slowly?",
  "Sorry about that — I wasn't able to understand your last response. Could you try rephrasing it for me?",
  "I'm having difficulty hearing you clearly. Would you mind repeating that in a different way?",
  "Apologies, I couldn't make out what you said. Could you please say it one more time?",
  "I didn't catch that, sorry. Could you try stating it differently?",
  "I'm sorry, I'm unable to understand. Could you speak a little louder or rephrase your request?",
  "Pardon me, I missed that. Could you please repeat yourself using different words?",
];

/** Message offered after 3 failed STT attempts */
const TRANSFER_OFFER_MESSAGE =
  "I'm sorry, but I'm unable to understand your request after several attempts. Let me transfer you to a human operator who can assist you directly.";

// ─── Intent Classification Keywords ─────────────────────────────────────────

const INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  booking: [
    'appointment', 'book', 'schedule', 'reserve', 'slot',
    'availability', 'available', 'calendar', 'reschedule',
    'cancel appointment', 'meeting', 'consultation',
  ],
  routing: [
    'transfer', 'speak to', 'talk to', 'connect me',
    'representative', 'agent', 'human', 'operator',
    'department', 'manager', 'supervisor',
  ],
  lead_capture: [
    'interested', 'pricing', 'quote', 'cost', 'how much',
    'service', 'information', 'learn more', 'callback',
    'contact', 'follow up', 'email me',
  ],
  faq: [
    'hours', 'open', 'close', 'location', 'address',
    'where', 'when', 'directions', 'parking', 'policy',
    'return', 'refund',
  ],
  general: [
    'hello', 'hi', 'hey', 'thanks', 'thank you',
    'goodbye', 'bye', 'yes', 'no', 'okay',
  ],
};

// ─── STT Rephrasing ──────────────────────────────────────────────────────────

/**
 * Generates a distinct rephrasing prompt different from all previous ones.
 * After MAX_REPHRASING_PROMPTS (3) prompts, returns a transfer offer message.
 *
 * Each generated prompt is guaranteed to be textually distinct from all
 * prompts in the previousPrompts array.
 *
 * @param previousPrompts - Array of prompts already used in the current call
 * @returns A new distinct prompt, or transfer offer message after 3 prompts
 */
export function generateRephrasingPrompt(previousPrompts: string[]): string {
  // After 3 prompts have been generated, offer transfer
  if (previousPrompts.length >= MAX_REPHRASING_PROMPTS) {
    return TRANSFER_OFFER_MESSAGE;
  }

  // Find a template that hasn't been used yet
  for (const template of REPHRASING_TEMPLATES) {
    if (!previousPrompts.includes(template)) {
      return template;
    }
  }

  // Fallback: generate a numbered variant if all templates exhausted
  // (defensive — should not happen with 8 templates and max 3 prompts)
  const index = previousPrompts.length + 1;
  return `I'm sorry, I didn't understand (attempt ${index}). Could you please try again?`;
}

// ─── Conversation Context ────────────────────────────────────────────────────

/**
 * Maintains conversation state for a single call.
 * Tracks messages, caller info, and duration.
 * Retains all caller-stated information accessible in subsequent turns.
 */
export class ConversationContext {
  private messages: ConversationMessage[] = [];
  private callerInfo: Record<string, string> = {};
  private readonly startTime: Date;

  constructor(startTime?: Date) {
    this.startTime = startTime ?? new Date();
  }

  /**
   * Add a message to the conversation history.
   */
  addMessage(speaker: 'AI' | 'Caller', text: string, timestamp: Date): void {
    this.messages.push({ speaker, text, timestamp });

    // Extract caller info from caller messages
    if (speaker === 'Caller') {
      this.extractCallerInfo(text);
    }
  }

  /**
   * Returns all messages in chronological order.
   */
  getContext(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Returns extracted caller information (names, dates, requests, etc.)
   * accumulated from all caller messages.
   */
  getCallerInfo(): Record<string, string> {
    return { ...this.callerInfo };
  }

  /**
   * Returns the conversation duration in minutes from start to now.
   */
  getDurationMinutes(): number {
    const now = new Date();
    const elapsedMs = now.getTime() - this.startTime.getTime();
    return elapsedMs / (1000 * 60);
  }

  /**
   * Returns true if the conversation has exceeded the 30-minute maximum.
   */
  isExpired(): boolean {
    return this.getDurationMinutes() > MAX_CONVERSATION_DURATION_MINUTES;
  }

  /**
   * Returns the start time of the conversation.
   */
  getStartTime(): Date {
    return this.startTime;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Extracts structured caller information from a message.
   * Looks for patterns like names, dates, phone numbers, emails, and requests.
   */
  private extractCallerInfo(text: string): void {
    // Extract name patterns ("my name is X", "I'm X", "this is X")
    const namePatterns = [
      /my name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:I'm|I am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /this is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    ];
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        this.callerInfo['name'] = match[1].trim();
        break;
      }
    }

    // Extract date patterns (e.g., "January 15", "next Monday", "01/15/2024")
    const datePatterns = [
      /(?:on|for|at)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?)/i,
      /(?:on|for|at)\s+(next\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))/i,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    ];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        this.callerInfo['date'] = match[1].trim();
        break;
      }
    }

    // Extract email
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (emailMatch) {
      this.callerInfo['email'] = emailMatch[0];
    }

    // Extract phone numbers (basic E.164 or common formats)
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) {
      this.callerInfo['phone'] = phoneMatch[0];
    }

    // Extract service requests ("I need X", "I want X", "I'd like X")
    const requestPatterns = [
      /I(?:'d like| want| need)\s+(.+?)(?:\.|$)/i,
      /looking for\s+(.+?)(?:\.|$)/i,
      /interested in\s+(.+?)(?:\.|$)/i,
    ];
    for (const pattern of requestPatterns) {
      const match = text.match(pattern);
      if (match) {
        this.callerInfo['request'] = match[1].trim();
        break;
      }
    }
  }
}

// ─── Intent Classification ───────────────────────────────────────────────────

/**
 * Classifies caller intent into categories based on keyword matching.
 * Returns the category with the highest keyword match score.
 *
 * Categories: booking, routing, lead_capture, faq, general
 *
 * @param text - The caller's utterance to classify
 * @returns IntentClassification with category, confidence, and extracted entities
 */
export function classifyIntent(text: string): IntentClassification {
  const textLower = text.toLowerCase();
  const entities: Record<string, string> = {};

  let bestCategory: IntentCategory = 'general';
  let bestScore = 0;
  let totalMatches = 0;

  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        score++;
        totalMatches++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as IntentCategory;
    }
  }

  // Calculate confidence based on match density
  const maxPossibleScore = INTENT_KEYWORDS[bestCategory].length;
  const confidence = maxPossibleScore > 0
    ? Math.min(bestScore / Math.max(maxPossibleScore * 0.3, 1), 1)
    : 0;

  // Extract entities based on the classified intent
  extractEntitiesForIntent(textLower, bestCategory, entities);

  return {
    category: bestCategory,
    confidence: totalMatches === 0 ? 0 : confidence,
    entities,
  };
}

/**
 * Extracts relevant entities based on detected intent category.
 */
function extractEntitiesForIntent(
  text: string,
  category: IntentCategory,
  entities: Record<string, string>,
): void {
  switch (category) {
    case 'booking': {
      // Try to extract service type
      const serviceMatch = text.match(/(?:book|schedule|appointment for)\s+(?:a\s+)?(.+?)(?:\s+on|\s+at|\s+for|\.|$)/i);
      if (serviceMatch) {
        entities['service'] = serviceMatch[1].trim();
      }
      break;
    }
    case 'routing': {
      // Try to extract department/person
      const deptMatch = text.match(/(?:speak to|talk to|connect me (?:to|with))\s+(.+?)(?:\.|$)/i);
      if (deptMatch) {
        entities['department'] = deptMatch[1].trim();
      }
      break;
    }
    case 'lead_capture': {
      // Try to extract what they're interested in
      const interestMatch = text.match(/(?:interested in|learn more about|pricing for)\s+(.+?)(?:\.|$)/i);
      if (interestMatch) {
        entities['interest'] = interestMatch[1].trim();
      }
      break;
    }
    case 'faq': {
      // Try to extract the question topic
      const topicMatch = text.match(/(?:what are|what is|when do|where is|how do)\s+(.+?)(?:\?|\.|$)/i);
      if (topicMatch) {
        entities['topic'] = topicMatch[1].trim();
      }
      break;
    }
    default:
      break;
  }
}

// ─── Exports for testing ─────────────────────────────────────────────────────

export {
  MAX_REPHRASING_PROMPTS,
  MAX_CONVERSATION_DURATION_MINUTES,
  REPHRASING_TEMPLATES,
  TRANSFER_OFFER_MESSAGE,
  INTENT_KEYWORDS,
};
