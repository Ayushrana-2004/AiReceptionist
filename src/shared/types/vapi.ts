/**
 * Vapi webhook event: call started.
 */
export interface VapiCallStartEvent {
  callId: string;
  from: string;
  to: string;
  timestamp: string;
  assistantId: string;
}

/**
 * Vapi webhook event: call ended.
 */
export interface VapiCallEndEvent {
  callId: string;
  duration: number;
  transcript: VapiTranscriptSegment[];
  endReason: string;
  timestamp: string;
}

/**
 * Vapi webhook event: tool call requested by the LLM.
 */
export interface VapiToolCallEvent {
  callId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  timestamp: string;
}

/**
 * Individual transcript segment from Vapi.
 */
export interface VapiTranscriptSegment {
  role: 'assistant' | 'user';
  text: string;
  timestamp: number;
}
