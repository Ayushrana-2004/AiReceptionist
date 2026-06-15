import { describe, it, expect } from 'vitest';
import {
  validateField,
  validateInput,
  formatValidationErrorResponse,
  FIELD_CONSTRAINTS,
} from './inputValidator';

describe('inputValidator', () => {
  describe('validateField', () => {
    it('accepts a value at exactly the max length', () => {
      const value = 'a'.repeat(100);
      const result = validateField('businessName', value);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts a value below the max length', () => {
      const result = validateField('greeting', 'Hello, welcome!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a value exceeding the max length', () => {
      const value = 'x'.repeat(501);
      const result = validateField('greeting', value);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        field: 'greeting',
        message: 'Greeting must not exceed 500 characters',
        maxLength: 500,
        actualLength: 501,
      });
    });

    it('rejects an empty string as required field', () => {
      const result = validateField('businessName', '');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        field: 'businessName',
        message: 'Business name is required and must not be empty',
        maxLength: 100,
        actualLength: 0,
      });
    });

    it('returns error for unknown field type', () => {
      const result = validateField('unknownField', 'test');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Unknown field type');
    });

    it('validates kbQuestion with max 200 characters', () => {
      const valid = validateField('kbQuestion', 'a'.repeat(200));
      expect(valid.valid).toBe(true);

      const invalid = validateField('kbQuestion', 'a'.repeat(201));
      expect(invalid.valid).toBe(false);
      expect(invalid.errors[0].maxLength).toBe(200);
      expect(invalid.errors[0].actualLength).toBe(201);
    });

    it('validates kbAnswer with max 2000 characters', () => {
      const valid = validateField('kbAnswer', 'a'.repeat(2000));
      expect(valid.valid).toBe(true);

      const invalid = validateField('kbAnswer', 'a'.repeat(2001));
      expect(invalid.valid).toBe(false);
      expect(invalid.errors[0].maxLength).toBe(2000);
    });

    it('validates leadName with max 100 characters', () => {
      const valid = validateField('leadName', 'John Doe');
      expect(valid.valid).toBe(true);

      const invalid = validateField('leadName', 'a'.repeat(101));
      expect(invalid.valid).toBe(false);
    });

    it('validates leadReason with max 500 characters', () => {
      const valid = validateField('leadReason', 'Interested in services');
      expect(valid.valid).toBe(true);

      const invalid = validateField('leadReason', 'a'.repeat(501));
      expect(invalid.valid).toBe(false);
    });

    it('validates smsTemplateBody with max 160 characters', () => {
      const valid = validateField('smsTemplateBody', 'a'.repeat(160));
      expect(valid.valid).toBe(true);

      const invalid = validateField('smsTemplateBody', 'a'.repeat(161));
      expect(invalid.valid).toBe(false);
      expect(invalid.errors[0].maxLength).toBe(160);
    });

    it('validates contextSummary with max 200 characters', () => {
      const valid = validateField('contextSummary', 'a'.repeat(200));
      expect(valid.valid).toBe(true);

      const invalid = validateField('contextSummary', 'a'.repeat(201));
      expect(invalid.valid).toBe(false);
    });

    it('accepts a single character string', () => {
      const result = validateField('businessName', 'A');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateInput', () => {
    it('validates multiple fields and returns combined errors', () => {
      const result = validateInput({
        businessName: 'a'.repeat(101),
        greeting: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('returns valid when all fields pass', () => {
      const result = validateInput({
        businessName: 'My Business',
        greeting: 'Welcome!',
        kbQuestion: 'What are your hours?',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for an empty fields object', () => {
      const result = validateInput({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('collects errors from multiple invalid fields', () => {
      const result = validateInput({
        businessName: 'a'.repeat(101),
        kbAnswer: 'b'.repeat(2001),
        smsTemplateBody: 'c'.repeat(161),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors.map((e) => e.field)).toEqual([
        'businessName',
        'kbAnswer',
        'smsTemplateBody',
      ]);
    });
  });

  describe('formatValidationErrorResponse', () => {
    it('formats errors into API response structure', () => {
      const result = validateField('greeting', 'x'.repeat(523));
      const response = formatValidationErrorResponse(result);

      expect(response).toEqual({
        error: 'VALIDATION_ERROR',
        fields: [
          {
            field: 'greeting',
            message: 'Greeting must not exceed 500 characters',
            maxLength: 500,
            actualLength: 523,
          },
        ],
      });
    });

    it('returns empty fields array for valid input', () => {
      const result = validateField('businessName', 'Valid');
      const response = formatValidationErrorResponse(result);

      expect(response).toEqual({
        error: 'VALIDATION_ERROR',
        fields: [],
      });
    });
  });

  describe('FIELD_CONSTRAINTS', () => {
    it('has correct constraint values for all field types', () => {
      expect(FIELD_CONSTRAINTS.businessName).toBe(100);
      expect(FIELD_CONSTRAINTS.greeting).toBe(500);
      expect(FIELD_CONSTRAINTS.kbQuestion).toBe(200);
      expect(FIELD_CONSTRAINTS.kbAnswer).toBe(2000);
      expect(FIELD_CONSTRAINTS.leadName).toBe(100);
      expect(FIELD_CONSTRAINTS.leadReason).toBe(500);
      expect(FIELD_CONSTRAINTS.smsTemplateBody).toBe(160);
      expect(FIELD_CONSTRAINTS.contextSummary).toBe(200);
    });
  });
});
