/**
 * Feature: ai-receptionist, Property 1: Input validation enforces field length constraints
 *
 * Validates: Requirements 1.3, 3.1, 3.6, 5.1, 6.3, 9.1
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateField, FIELD_CONSTRAINTS } from './inputValidator';

describe('Property 1: Input validation enforces field length constraints', () => {
  const fieldTypes = Object.keys(FIELD_CONSTRAINTS);

  for (const fieldType of fieldTypes) {
    const maxLength = FIELD_CONSTRAINTS[fieldType];

    it(`rejects ${fieldType} inputs exceeding max length (${maxLength})`, () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: maxLength + 1, maxLength: 5000 }),
          (input) => {
            const result = validateField(fieldType, input);
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].maxLength).toBe(maxLength);
            expect(result.errors[0].actualLength).toBe(input.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it(`accepts ${fieldType} inputs with length > 0 and <= max length (${maxLength})`, () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: maxLength }),
          (input) => {
            const result = validateField(fieldType, input);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it(`rejects ${fieldType} empty strings as required fields`, () => {
      const result = validateField(fieldType, '');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].maxLength).toBe(maxLength);
      expect(result.errors[0].actualLength).toBe(0);
    });
  }
});
