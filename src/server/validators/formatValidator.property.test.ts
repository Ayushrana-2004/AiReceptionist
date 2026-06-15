/**
 * Feature: ai-receptionist, Property 10: Phone and email format validation
 *
 * Validates: Requirements 5.2
 *
 * For any string input, the phone validation function SHALL accept only strings
 * matching E.164 format, and the email validation function SHALL accept only strings
 * matching RFC 5322 basic format. All other inputs SHALL be rejected.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validatePhone,
  validateEmail,
  isValidPhone,
  isValidEmail,
} from './formatValidator';

const E164_REGEX = /^\+[1-9]\d{0,14}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

describe('Property 10: Phone and email format validation', () => {
  describe('Phone validation (E.164)', () => {
    it('accepts all valid E.164 phone numbers', () => {
      // Generator for valid E.164 strings: '+' followed by first digit 1-9, then 0-14 more digits
      const validE164 = fc
        .tuple(
          fc.integer({ min: 1, max: 9 }),
          fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 0, maxLength: 14 })
        )
        .map(([first, rest]) => `+${first}${rest.join('')}`);

      fc.assert(
        fc.property(validE164, (phone) => {
          expect(isValidPhone(phone)).toBe(true);
          const result = validatePhone(phone);
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('rejects arbitrary strings that do not match E.164 pattern', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const matchesE164 = E164_REGEX.test(input);
          const result = isValidPhone(input);

          if (matchesE164) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('validatePhone returns structured errors for invalid inputs', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const matchesE164 = E164_REGEX.test(input);
          const result = validatePhone(input);

          if (matchesE164) {
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          } else {
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('phone');
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Email validation (RFC 5322 basic)', () => {
    it('accepts all valid RFC 5322 basic email addresses', () => {
      // Generator for valid email strings: local@domain.tld
      const localPartChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._%+-';
      const domainChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const tldChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

      const localPart = fc
        .array(fc.constantFrom(...localPartChars.split('')), { minLength: 1, maxLength: 20 })
        .map((chars) => chars.join(''));
      const domainPart = fc
        .array(fc.constantFrom(...domainChars.split('')), { minLength: 1, maxLength: 15 })
        .map((chars) => chars.join(''));
      const tldPart = fc
        .array(fc.constantFrom(...tldChars.split('')), { minLength: 2, maxLength: 6 })
        .map((chars) => chars.join(''));

      const validEmail = fc
        .tuple(localPart, domainPart, tldPart)
        .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

      fc.assert(
        fc.property(validEmail, (email) => {
          // Only test emails that actually match the regex (some generated locals
          // may have edge patterns like starting with a dot that still passes the regex)
          if (EMAIL_REGEX.test(email)) {
            expect(isValidEmail(email)).toBe(true);
            const result = validateEmail(email);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('rejects arbitrary strings that do not match email pattern', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const matchesEmail = EMAIL_REGEX.test(input);
          const result = isValidEmail(input);

          if (matchesEmail) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('validateEmail returns structured errors for invalid inputs', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const matchesEmail = EMAIL_REGEX.test(input);
          const result = validateEmail(input);

          if (matchesEmail) {
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          } else {
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('email');
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
