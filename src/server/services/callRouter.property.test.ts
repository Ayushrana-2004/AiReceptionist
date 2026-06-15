/**
 * Feature: ai-receptionist, Property 8: Context summary never exceeds 200 characters
 *
 * Validates: Requirements 4.3
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateContextSummary } from './callRouter';

describe('Property 8: Context summary never exceeds 200 characters', () => {
  it('output length is always <= 200 characters for random intents and descriptions', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50, unit: 'grapheme' }),
        fc.string({ minLength: 0, maxLength: 1000, unit: 'grapheme' }),
        (intent, description) => {
          const result = generateContextSummary(intent, description);
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('output always contains the intent category string', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9]{1,50}$/),
        fc.string({ minLength: 0, maxLength: 1000 }),
        (intent, description) => {
          const result = generateContextSummary(intent, description);
          expect(result).toContain(intent);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('output contains intent category even with very long descriptions', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9]{1,30}$/),
        fc.string({ minLength: 500, maxLength: 1000 }),
        (intent, description) => {
          const result = generateContextSummary(intent, description);
          expect(result.length).toBeLessThanOrEqual(200);
          expect(result).toContain(intent);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('output contains intent category even with max-length intent strings', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9]{40,50}$/),
        fc.string({ minLength: 0, maxLength: 1000 }),
        (intent, description) => {
          const result = generateContextSummary(intent, description);
          expect(result.length).toBeLessThanOrEqual(200);
          // Intent should be present (possibly truncated if prefix exceeds 200)
          // The function wraps intent in brackets: [intent]
          // If [intent] itself is <=200 chars, it will be fully present
          if (`[${intent}] `.length <= 200) {
            expect(result).toContain(intent);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
