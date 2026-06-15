/**
 * Summary Service
 *
 * Handles post-call artifact generation:
 * - generateSummary: produces a 50–200 char summary from transcript text (skips if call <5s)
 * - generateTranscript: formats Vapi transcript data with "AI"/"Caller" speaker labels
 * - classifyOutcome: assigns an outcome category from configured categories via keyword matching
 *
 * Requirements: 7.1, 7.2, 7.4, 7.5, 7.6
 */

import { VapiTranscriptSegment } from '../../shared/types/vapi';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Formatted transcript with speaker labels and metadata */
export interface Transcript {
  /** Full formatted text with speaker labels (e.g. "AI: Hello\nCaller: Hi") */
  text: string;
  /** Duration of the call in seconds */
  durationSeconds: number;
  /** Individual segments with normalized speaker labels */
  segments: TranscriptSegment[];
}

/** A single segment within the transcript */
export interface TranscriptSegment {
  speaker: 'AI' | 'Caller';
  text: string;
  timestamp: number;
}

/** Result of summary generation */
export interface CallSummary {
  /** Summary text between 50–200 characters, or null if call was too short */
  summary: string | null;
  /** Classified outcome category */
  outcome: string;
}

/** Raw Vapi transcript data passed to generateTranscript */
export interface VapiTranscriptData {
  segments: VapiTranscriptSegment[];
  durationSeconds: number;
}

// ─── Default outcome categories ─────────────────────────────────────────────

export const DEFAULT_OUTCOME_CATEGORIES = [
  'appointment_booked',
  'information_provided',
  'transferred',
  'message_taken',
  'lead_captured',
] as const;

// ─── Keyword maps for outcome classification ────────────────────────────────

const OUTCOME_KEYWORDS: Record<string, string[]> = {
  appointment_booked: [
    'appointment', 'booked', 'scheduled', 'booking', 'calendar',
    'slot', 'reserve', 'confirmed', 'schedule',
  ],
  transferred: [
    'transfer', 'transferred', 'connect', 'connected', 'routing',
    'forwarded', 'forward', 'speak to', 'talk to',
  ],
  lead_captured: [
    'lead', 'contact', 'email', 'phone number', 'callback',
    'follow up', 'follow-up', 'interested', 'inquiry',
  ],
  message_taken: [
    'message', 'voicemail', 'leave a message', 'note', 'relay',
    'pass along', 'let them know',
  ],
  information_provided: [
    'hours', 'pricing', 'location', 'services', 'information',
    'question', 'answer', 'help', 'details', 'address',
  ],
};

// ─── Service Implementation ─────────────────────────────────────────────────

/**
 * Generates a formatted transcript from raw Vapi transcript data.
 * Converts 'assistant' role to "AI" and 'user' role to "Caller" labels.
 */
export function generateTranscript(data: VapiTranscriptData): Transcript {
  const segments: TranscriptSegment[] = data.segments.map((seg) => ({
    speaker: seg.role === 'assistant' ? 'AI' : 'Caller',
    text: seg.text,
    timestamp: seg.timestamp,
  }));

  const text = segments
    .map((seg) => `${seg.speaker}: ${seg.text}`)
    .join('\n');

  return {
    text,
    durationSeconds: data.durationSeconds,
    segments,
  };
}

/**
 * Generates a 50–200 character summary from transcript text.
 * Returns null summary if the call duration is less than 5 seconds.
 *
 * Uses a simple extractive approach:
 * 1. Extract caller utterances (most relevant for summary)
 * 2. Pick key sentences, combine and truncate to fit 50–200 chars
 */
export function generateSummary(transcript: Transcript): CallSummary {
  // Skip if call < 5 seconds
  if (transcript.durationSeconds < 5) {
    return {
      summary: null,
      outcome: 'information_provided',
    };
  }

  const outcome = classifyOutcome(
    transcript,
    [...DEFAULT_OUTCOME_CATEGORIES]
  );

  const summary = extractSummaryText(transcript);

  return {
    summary,
    outcome,
  };
}

/**
 * Classifies the call outcome by matching transcript content against
 * keyword lists for each configured category.
 *
 * Returns the category with the most keyword matches.
 * Falls back to the first category if no keywords match.
 */
export function classifyOutcome(
  transcript: Transcript,
  categories: string[]
): string {
  if (categories.length === 0) {
    return 'information_provided';
  }

  const transcriptLower = transcript.text.toLowerCase();
  let bestCategory = categories[0];
  let bestScore = 0;

  for (const category of categories) {
    const keywords = OUTCOME_KEYWORDS[category];
    if (!keywords) continue;

    let score = 0;
    for (const keyword of keywords) {
      if (transcriptLower.includes(keyword)) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Extracts a summary text between 50–200 characters from the transcript.
 * Prioritizes caller utterances to capture the caller's intent.
 */
function extractSummaryText(transcript: Transcript): string {
  // Collect caller utterances first, then AI utterances
  const callerTexts = transcript.segments
    .filter((s) => s.speaker === 'Caller')
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0);

  const aiTexts = transcript.segments
    .filter((s) => s.speaker === 'AI')
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0);

  // Build candidate summary from caller utterances
  let candidate = callerTexts.join('. ');

  // If caller text is too short, supplement with AI text
  if (candidate.length < 50) {
    const supplement = aiTexts.join('. ');
    candidate = candidate
      ? `${candidate}. ${supplement}`
      : supplement;
  }

  // If still too short after combining, pad with context
  if (candidate.length < 50) {
    candidate = padToMinLength(candidate, transcript);
  }

  // Truncate to 200 characters if needed
  if (candidate.length > 200) {
    candidate = truncateToLimit(candidate, 200);
  }

  // Final safety: ensure minimum 50 chars
  if (candidate.length < 50) {
    candidate = candidate.padEnd(50, '.');
  }

  return candidate;
}

/**
 * Pads a short summary with transcript context to reach minimum length.
 */
function padToMinLength(text: string, transcript: Transcript): string {
  const allText = transcript.segments
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0)
    .join('. ');

  if (allText.length >= 50) {
    return allText;
  }

  // If even all text together is too short, repeat it
  let padded = allText || text || 'Call completed';
  while (padded.length < 50) {
    padded += '. Call continued';
  }
  return padded;
}

/**
 * Truncates text to a maximum length, preferring to break at sentence/word boundaries.
 */
function truncateToLimit(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Try to break at a sentence boundary
  const truncated = text.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod >= 50) {
    return truncated.slice(0, lastPeriod + 1);
  }

  // Break at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace >= 50) {
    return truncated.slice(0, lastSpace);
  }

  // Hard truncate
  return truncated;
}
