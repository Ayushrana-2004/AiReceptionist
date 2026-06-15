/**
 * Property-Based Test: STT rephrasing prompts are distinct
 *
 * Feature: ai-receptionist, Property 20: STT rephrasing prompts are distinct
 *
 * Validates: Requirements 10.4
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateRephrasingPrompt,
  TRANSFER_OFFER_MESSAGE,
  MAX_REPHRASING_PROMPTS,
} from './conversation';

describe('Property 20: STT rephrasing prompts are distinct', () => {
  it('each prompt (for first 3) is textually distinct from all previous prompts in the sequence', () => {
    fc.assert(
      fc.property(
        // Generate a random STT failure sequence length (1-6)
        fc.integer({ min: 1, max: 6 }),
        (failureCount) => {
          const previousPrompts: string[] = [];

          for (let i = 0; i < failureCount; i++) {
            const prompt = generateRephrasingPrompt(previousPrompts);

            if (previousPrompts.length < MAX_REPHRASING_PROMPTS) {
              // Each prompt within the first 3 must be distinct from all previous
              for (const prev of previousPrompts) {
                expect(prompt).not.toBe(prev);
              }
              previousPrompts.push(prompt);
            } else {
              // After 3 prompts, should return transfer offer
              expect(prompt).toBe(TRANSFER_OFFER_MESSAGE);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after 3 prompts, the function returns the TRANSFER_OFFER_MESSAGE', () => {
    fc.assert(
      fc.property(
        // Generate random STT failure sequences of length 4-6 to ensure we always hit the transfer
        fc.integer({ min: 4, max: 6 }),
        (failureCount) => {
          const previousPrompts: string[] = [];

          // Build up 3 distinct prompts
          for (let i = 0; i < MAX_REPHRASING_PROMPTS; i++) {
            const prompt = generateRephrasingPrompt(previousPrompts);
            previousPrompts.push(prompt);
          }

          // Now any subsequent call should return the transfer offer
          for (let i = MAX_REPHRASING_PROMPTS; i < failureCount; i++) {
            const prompt = generateRephrasingPrompt(previousPrompts);
            expect(prompt).toBe(TRANSFER_OFFER_MESSAGE);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no more than 3 distinct prompts are generated before transfer offer', () => {
    fc.assert(
      fc.property(
        // Generate random STT failure sequences of length 1-6
        fc.integer({ min: 1, max: 6 }),
        (failureCount) => {
          const previousPrompts: string[] = [];
          const distinctPrompts = new Set<string>();

          for (let i = 0; i < failureCount; i++) {
            const prompt = generateRephrasingPrompt(previousPrompts);

            if (prompt === TRANSFER_OFFER_MESSAGE) {
              // Once we get the transfer message, we should already have 3 prompts
              expect(previousPrompts.length).toBe(MAX_REPHRASING_PROMPTS);
            } else {
              distinctPrompts.add(prompt);
              previousPrompts.push(prompt);
            }
          }

          // The number of distinct prompts generated should never exceed MAX_REPHRASING_PROMPTS
          expect(distinctPrompts.size).toBeLessThanOrEqual(MAX_REPHRASING_PROMPTS);
        }
      ),
      { numRuns: 100 }
    );
  });
});
