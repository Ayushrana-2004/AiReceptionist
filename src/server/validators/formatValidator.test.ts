import { describe, it, expect } from 'vitest';
import {
  validatePhone,
  validateEmail,
  isValidPhone,
  isValidEmail,
} from './formatValidator';

describe('formatValidator', () => {
  describe('validatePhone', () => {
    it('accepts valid E.164 phone numbers', () => {
      const validNumbers = [
        '+14155551234',
        '+1',
        '+442071234567',
        '+861012345678',
        '+919876543210',
        '+123456789012345', // max 15 digits
      ];

      for (const number of validNumbers) {
        const result = validatePhone(number);
        expect(result.valid, `Expected ${number} to be valid`).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('rejects phone numbers without leading +', () => {
      const result = validatePhone('14155551234');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('phone');
    });

    it('rejects empty string', () => {
      const result = validatePhone('');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('rejects phone numbers with non-digit characters after +', () => {
      const invalidNumbers = ['+1-415-555-1234', '+1 415 555 1234', '+1(415)5551234', '+abc123'];
      for (const number of invalidNumbers) {
        const result = validatePhone(number);
        expect(result.valid, `Expected ${number} to be invalid`).toBe(false);
      }
    });

    it('rejects phone numbers starting with +0', () => {
      const result = validatePhone('+0123456789');
      expect(result.valid).toBe(false);
    });

    it('rejects phone numbers exceeding 15 digits', () => {
      const result = validatePhone('+1234567890123456'); // 16 digits
      expect(result.valid).toBe(false);
    });

    it('rejects just the + sign', () => {
      const result = validatePhone('+');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('accepts valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.user@example.com',
        'user+tag@example.com',
        'user_name@example.co.uk',
        'user-name@sub.domain.com',
        'user%name@example.org',
        'a@b.co',
      ];

      for (const email of validEmails) {
        const result = validateEmail(email);
        expect(result.valid, `Expected ${email} to be valid`).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('rejects emails without @ symbol', () => {
      const result = validateEmail('userexample.com');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('email');
    });

    it('rejects emails without domain dot', () => {
      const result = validateEmail('user@example');
      expect(result.valid).toBe(false);
    });

    it('rejects empty string', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
    });

    it('rejects emails with invalid local part characters', () => {
      const invalidEmails = ['user name@example.com', 'user@!example.com'];
      for (const email of invalidEmails) {
        const result = validateEmail(email);
        expect(result.valid, `Expected ${email} to be invalid`).toBe(false);
      }
    });

    it('rejects emails with TLD less than 2 characters', () => {
      const result = validateEmail('user@example.c');
      expect(result.valid).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('returns true for valid E.164 numbers', () => {
      expect(isValidPhone('+14155551234')).toBe(true);
      expect(isValidPhone('+442071234567')).toBe(true);
    });

    it('returns false for invalid phone numbers', () => {
      expect(isValidPhone('14155551234')).toBe(false);
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone('+0123')).toBe(false);
      expect(isValidPhone('not-a-phone')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('returns true for valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user+tag@domain.co.uk')).toBe(true);
    });

    it('returns false for invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
    });
  });
});
