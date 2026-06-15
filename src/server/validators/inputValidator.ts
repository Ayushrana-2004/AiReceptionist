/**
 * Input Validation Module
 *
 * Enforces field length constraints for all configurable text fields.
 * Returns structured error responses with field name, message, maxLength, and actualLength.
 */

export interface ValidationError {
  field: string;
  message: string;
  maxLength: number;
  actualLength: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Supported field types and their maximum allowed lengths.
 */
export const FIELD_CONSTRAINTS: Record<string, number> = {
  businessName: 100,
  greeting: 500,
  kbQuestion: 200,
  kbAnswer: 2000,
  leadName: 100,
  leadReason: 500,
  smsTemplateBody: 160,
  contextSummary: 200,
};

/**
 * Human-readable labels for field types used in error messages.
 */
const FIELD_LABELS: Record<string, string> = {
  businessName: 'Business name',
  greeting: 'Greeting',
  kbQuestion: 'Knowledge base question',
  kbAnswer: 'Knowledge base answer',
  leadName: 'Lead name',
  leadReason: 'Lead reason',
  smsTemplateBody: 'SMS template body',
  contextSummary: 'Context summary',
};

/**
 * Validates a single field value against its length constraint.
 * Also checks that the value is not an empty string (required field check).
 */
export function validateField(
  fieldType: string,
  value: string
): ValidationResult {
  const maxLength = FIELD_CONSTRAINTS[fieldType];

  if (maxLength === undefined) {
    return {
      valid: false,
      errors: [
        {
          field: fieldType,
          message: `Unknown field type: ${fieldType}`,
          maxLength: 0,
          actualLength: value.length,
        },
      ],
    };
  }

  const errors: ValidationError[] = [];
  const label = FIELD_LABELS[fieldType] || fieldType;

  if (value.length === 0) {
    errors.push({
      field: fieldType,
      message: `${label} is required and must not be empty`,
      maxLength,
      actualLength: 0,
    });
  } else if (value.length > maxLength) {
    errors.push({
      field: fieldType,
      message: `${label} must not exceed ${maxLength} characters`,
      maxLength,
      actualLength: value.length,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates multiple fields at once.
 * Accepts an object mapping field types to their values.
 * Returns a combined validation result.
 */
export function validateInput(
  fields: Record<string, string>
): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (const [fieldType, value] of Object.entries(fields)) {
    const result = validateField(fieldType, value);
    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Formats validation errors into the structured API error response format.
 */
export function formatValidationErrorResponse(result: ValidationResult): {
  error: string;
  fields: ValidationError[];
} {
  return {
    error: 'VALIDATION_ERROR',
    fields: result.errors,
  };
}
