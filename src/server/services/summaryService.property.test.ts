/**
 * Feature: ai-receptionist, Property 13: Post-call artifacts are well-formed
 *
 * Validates: Requirements 7.1, 7.2, 7.4
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateSummary,
  generateTranscript,
  classifyOutcome,
  DEFAULT_OUTCOME_CATEGORIES,
} from './summaryService';
import { VapiTranscriptData } from './summaryService';

/**
 * Generator for random Vapi transcript segments.
 * Produces segments with 'assistant' or 'user' roles and non-empty text.
 */
const vapiSegmentArb = fc.record({
  role: fc.constantFrom('assistant' as const, 'user' as const),
  text: fc.string({ minLength: 1, maxLength: 200, unit: 'grapheme' }),
  timestamp: fc.float({ min: 0, max: 1800, noNaN: true }),
});

/**
 * Generator for VapiTranscriptData with random duration and segments.
 */
const vapiTranscriptDataArb = fc.record({
  segments: fc.array(vapiSegmentArb, { minLength: 1, maxLength: 20 }),
  durationSeconds: fc.integer({ min: 0, max: 1800 }),
});

describe('Property 13: Post-call artifacts are well-formed', () => {
  it('for duration >= 5s, summary is between 50 and 200 characters', () => {
    fc.assert(
      fc.property(
        vapiTranscriptDataArb.filter((d) => d.durationSeconds >= 5),
        (data) => {
          const transcript = generateTranscript(data);
          const result = generateSummary(transcript);

          expect(result.summary).not.toBeNull();
          expect(result.summary!.length).toBeGreaterThanOrEqual(50);
          expect(result.summary!.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for duration < 5s, summary is null', () => {
    fc.assert(
      fc.property(
        vapiTranscriptDataArb.filter((d) => d.durationSeconds < 5),
        (data) => {
          const transcript = generateTranscript(data);
          const result = generateSummary(transcript);

          expect(result.summary).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every transcript segment has speaker label of exactly "AI" or "Caller"', () => {
    fc.assert(
      fc.property(vapiTranscriptDataArb, (data) => {
        const transcript = generateTranscript(data);

        for (const segment of transcript.segments) {
          expect(segment.speaker).toMatch(/^(AI|Caller)$/);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('classifyOutcome returns a member of the configured categories set', () => {
    fc.assert(
      fc.property(vapiTranscriptDataArb, (data) => {
        const transcript = generateTranscript(data);
        const categories = [...DEFAULT_OUTCOME_CATEGORIES] as string[];
        const outcome = classifyOutcome(transcript, categories);

        expect(categories).toContain(outcome);
      }),
      { numRuns: 100 }
    );
  });
});
