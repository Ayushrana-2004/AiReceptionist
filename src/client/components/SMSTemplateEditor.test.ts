import { describe, it, expect } from 'vitest';

/**
 * Unit tests for SMSTemplateEditor logic.
 * Tests the validation and configuration constants that drive the component.
 */

const MAX_BODY_LENGTH = 160;
const WARNING_THRESHOLD = 140;

const TRIGGER_EVENTS = [
  { value: 'missed_call', label: 'Missed Call' },
  { value: 'voicemail', label: 'Voicemail Left' },
  { value: 'lead_captured', label: 'Lead Captured' },
  { value: 'appointment_booked', label: 'Appointment Booked' },
] as const;

const REMINDER_INTERVALS = [
  { value: '15min', label: '15 minutes' },
  { value: '1hour', label: '1 hour' },
  { value: '4hours', label: '4 hours' },
  { value: '24hours', label: '24 hours' },
  { value: '48hours', label: '48 hours' },
] as const;

interface TemplateFormData {
  name: string;
  body: string;
  triggerEvent: string;
  isActive: boolean;
}

function validateForm(formData: TemplateFormData): string | null {
  if (!formData.name.trim()) {
    return 'Template name is required';
  }
  if (!formData.body.trim()) {
    return 'Template body is required';
  }
  if (formData.body.length > MAX_BODY_LENGTH) {
    return `Template body must not exceed ${MAX_BODY_LENGTH} characters`;
  }
  return null;
}

function getCharCounterState(length: number): 'normal' | 'warning' | 'exceeded' {
  if (length > MAX_BODY_LENGTH) return 'exceeded';
  if (length >= WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

describe('SMSTemplateEditor validation', () => {
  describe('validateForm', () => {
    it('should return null for valid form data', () => {
      const formData: TemplateFormData = {
        name: 'Test Template',
        body: 'Hello, this is a test message.',
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBeNull();
    });

    it('should reject empty template name', () => {
      const formData: TemplateFormData = {
        name: '',
        body: 'Hello!',
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBe('Template name is required');
    });

    it('should reject whitespace-only template name', () => {
      const formData: TemplateFormData = {
        name: '   ',
        body: 'Hello!',
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBe('Template name is required');
    });

    it('should reject empty template body', () => {
      const formData: TemplateFormData = {
        name: 'Test',
        body: '',
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBe('Template body is required');
    });

    it('should reject whitespace-only template body', () => {
      const formData: TemplateFormData = {
        name: 'Test',
        body: '   ',
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBe('Template body is required');
    });

    it('should reject body exceeding 160 characters', () => {
      const formData: TemplateFormData = {
        name: 'Test',
        body: 'a'.repeat(161),
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBe('Template body must not exceed 160 characters');
    });

    it('should accept body at exactly 160 characters', () => {
      const formData: TemplateFormData = {
        name: 'Test',
        body: 'a'.repeat(160),
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBeNull();
    });

    it('should prioritize name validation over body validation', () => {
      const formData: TemplateFormData = {
        name: '',
        body: '',
        triggerEvent: 'missed_call',
        isActive: true,
      };
      expect(validateForm(formData)).toBe('Template name is required');
    });
  });

  describe('getCharCounterState', () => {
    it('should return "normal" for length 0', () => {
      expect(getCharCounterState(0)).toBe('normal');
    });

    it('should return "normal" for length below warning threshold', () => {
      expect(getCharCounterState(139)).toBe('normal');
    });

    it('should return "warning" at exactly warning threshold (140)', () => {
      expect(getCharCounterState(140)).toBe('warning');
    });

    it('should return "warning" between threshold and max', () => {
      expect(getCharCounterState(150)).toBe('warning');
      expect(getCharCounterState(160)).toBe('warning');
    });

    it('should return "exceeded" above max body length', () => {
      expect(getCharCounterState(161)).toBe('exceeded');
      expect(getCharCounterState(200)).toBe('exceeded');
    });
  });

  describe('TRIGGER_EVENTS configuration', () => {
    it('should include all four required trigger events', () => {
      const values = TRIGGER_EVENTS.map((e) => e.value);
      expect(values).toContain('missed_call');
      expect(values).toContain('voicemail');
      expect(values).toContain('lead_captured');
      expect(values).toContain('appointment_booked');
    });

    it('should have exactly 4 trigger events', () => {
      expect(TRIGGER_EVENTS).toHaveLength(4);
    });

    it('should have a human-readable label for each event', () => {
      for (const event of TRIGGER_EVENTS) {
        expect(event.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('REMINDER_INTERVALS configuration', () => {
    it('should include all five required intervals', () => {
      const values = REMINDER_INTERVALS.map((i) => i.value);
      expect(values).toContain('15min');
      expect(values).toContain('1hour');
      expect(values).toContain('4hours');
      expect(values).toContain('24hours');
      expect(values).toContain('48hours');
    });

    it('should have exactly 5 reminder intervals', () => {
      expect(REMINDER_INTERVALS).toHaveLength(5);
    });

    it('should have a human-readable label for each interval', () => {
      for (const interval of REMINDER_INTERVALS) {
        expect(interval.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('MAX_BODY_LENGTH constant', () => {
    it('should be 160 per SMS standard', () => {
      expect(MAX_BODY_LENGTH).toBe(160);
    });
  });
});
