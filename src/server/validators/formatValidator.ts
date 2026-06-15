/**
 * Format Validation Module
 *
 * Validates phone numbers (E.164 format) and email addresses (RFC 5322 basic format).
 * Returns structured validation results with field name and error message.
 */

export interface FormatValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FormatValidationError[];
}

/**
 * E.164 phone number regex:
 * - Starts with '+'
 * - Followed by 1–15 digits
 * - Total length 2–16 characters (including the '+')
 */
const E164_REGEX = /^\+[1-9]\d{0,14}$/;

/**
 * Basic RFC 5322 email regex:
 * - Local part: alphanumeric + ._%+-
 * - '@' separator
 * - Domain part: alphanumeric + .- with at least one dot
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validates a phone number against E.164 format.
 *
 * E.164 format rules:
 * - Must start with '+'
 * - Followed by 1 to 15 digits (first digit cannot be 0)
 * - Total length including '+' is 2 to 16 characters
 *
 * @param value - The phone number string to validate
 * @returns ValidationResult with valid flag and any errors
 */
export function validatePhone(value: string): ValidationResult {
  const errors: FormatValidationError[] = [];

  if (!E164_REGEX.test(value)) {
    errors.push({
      field: 'phone',
      message:
        'Phone number must be in E.164 format (e.g., +14155551234): starts with +, followed by 1-15 digits',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an email address against basic RFC 5322 format.
 *
 * RFC 5322 basic format rules:
 * - Local part allows: alphanumeric characters, dots, underscores, percent signs, plus signs, hyphens
 * - Must contain exactly one '@' separator
 * - Domain part allows: alphanumeric characters, dots, hyphens
 * - Domain must contain at least one dot
 * - Domain TLD must be at least 2 characters
 *
 * @param value - The email address string to validate
 * @returns ValidationResult with valid flag and any errors
 */
export function validateEmail(value: string): ValidationResult {
  const errors: FormatValidationError[] = [];

  if (!EMAIL_REGEX.test(value)) {
    errors.push({
      field: 'email',
      message:
        'Email must be in valid format (e.g., user@example.com): local part allows alphanumeric and ._%+-, domain must contain at least one dot',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Simple boolean check for E.164 phone number validity.
 *
 * @param value - The phone number string to check
 * @returns true if the phone number is valid E.164 format, false otherwise
 */
export function isValidPhone(value: string): boolean {
  return E164_REGEX.test(value);
}

/**
 * Simple boolean check for RFC 5322 basic email validity.
 *
 * @param value - The email address string to check
 * @returns true if the email is valid RFC 5322 basic format, false otherwise
 */
export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}
