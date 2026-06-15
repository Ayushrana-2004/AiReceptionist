/**
 * Property-Based Test: Language configuration maintains minimum enabled count
 *
 * Feature: ai-receptionist, Property 16: Language configuration maintains minimum enabled count
 *
 * Validates: Requirements 8.3
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { enableLanguage, disableLanguage } from './languageConfig';
import { Language } from '../../shared/types/enums';

const SUPPORTED_LANGUAGES: Language[] = ['en', 'es', 'fr', 'zh'];

/**
 * Arbitrary that generates a random enable/disable operation sequence.
 * Each operation is either { type: 'enable', language } or { type: 'disable', language }.
 */
const operationArb = fc.record({
  type: fc.oneof(fc.constant('enable' as const), fc.constant('disable' as const)),
  language: fc.oneof(...SUPPORTED_LANGUAGES.map((l) => fc.constant(l))),
});

const operationSequenceArb = fc.array(operationArb, { minLength: 1, maxLength: 50 });

describe('Property 16: Language configuration maintains minimum enabled count', () => {
  it('disableLanguage throws when operation would leave zero enabled languages', () => {
    fc.assert(
      fc.property(
        operationSequenceArb,
        fc.oneof(...SUPPORTED_LANGUAGES.map((l) => fc.constant(l))), // initial language
        (operations, initialLang) => {
          // Start with exactly one language enabled
          let currentLanguages: Language[] = [initialLang];

          for (const op of operations) {
            if (op.type === 'enable') {
              currentLanguages = enableLanguage(currentLanguages, op.language);
            } else {
              // disable
              if (currentLanguages.length === 1 && currentLanguages.includes(op.language)) {
                // This should throw because it would leave zero enabled
                expect(() => disableLanguage(currentLanguages, op.language)).toThrow();
              } else {
                try {
                  currentLanguages = disableLanguage(currentLanguages, op.language);
                } catch {
                  // If it throws, the language must have been the last one
                  expect(currentLanguages.filter((l) => l !== op.language)).toHaveLength(0);
                }
              }
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('after any valid sequence of operations, at least one language remains enabled', () => {
    fc.assert(
      fc.property(
        operationSequenceArb,
        fc.oneof(...SUPPORTED_LANGUAGES.map((l) => fc.constant(l))), // initial language
        (operations, initialLang) => {
          let currentLanguages: Language[] = [initialLang];

          for (const op of operations) {
            if (op.type === 'enable') {
              currentLanguages = enableLanguage(currentLanguages, op.language);
            } else {
              // disable — catch throw gracefully
              try {
                currentLanguages = disableLanguage(currentLanguages, op.language);
              } catch {
                // Expected to throw when would leave zero — just skip
              }
            }
          }

          // Invariant: at least one language remains enabled at all times
          expect(currentLanguages.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('disableLanguage never produces an empty language list', () => {
    fc.assert(
      fc.property(
        // Generate a non-empty subset of languages as the starting state
        fc.subarray(SUPPORTED_LANGUAGES, { minLength: 1 }),
        fc.oneof(...SUPPORTED_LANGUAGES.map((l) => fc.constant(l))),
        (currentLanguages, languageToDisable) => {
          try {
            const result = disableLanguage(currentLanguages as Language[], languageToDisable);
            // If disableLanguage succeeded, result must be non-empty
            expect(result.length).toBeGreaterThanOrEqual(1);
          } catch (error) {
            // If it threw, it means it would have left zero enabled
            // Verify the language was the last one in the list
            expect(
              currentLanguages.filter((l) => l !== languageToDisable)
            ).toHaveLength(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
