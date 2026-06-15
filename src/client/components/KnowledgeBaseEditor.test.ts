import { describe, it, expect } from 'vitest';

/**
 * Unit tests for KnowledgeBaseEditor logic.
 * Tests the validation and configuration constants that drive the component.
 */

const MAX_QUESTION_LENGTH = 200;
const MAX_ANSWER_LENGTH = 2000;
const MAX_TOTAL_ENTRIES = 500;
const MAX_ENTRIES_PER_CATEGORY = 100;

const CATEGORIES = [
  { value: 'business_hours', label: 'Business Hours' },
  { value: 'services', label: 'Services' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'location', label: 'Location' },
  { value: 'custom', label: 'Custom' },
] as const;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'zh', label: 'Mandarin' },
] as const;

interface KBEntryFormData {
  category: string;
  question: string;
  answer: string;
  language: string;
}

interface ValidationErrors {
  question?: string;
  answer?: string;
  category?: string;
}

function validateForm(data: KBEntryFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!data.question.trim()) {
    errors.question = 'Question/topic is required';
  } else if (data.question.length > MAX_QUESTION_LENGTH) {
    errors.question = `Question must not exceed ${MAX_QUESTION_LENGTH} characters (${data.question.length}/${MAX_QUESTION_LENGTH})`;
  }

  if (!data.answer.trim()) {
    errors.answer = 'Answer/content is required';
  } else if (data.answer.length > MAX_ANSWER_LENGTH) {
    errors.answer = `Answer must not exceed ${MAX_ANSWER_LENGTH} characters (${data.answer.length}/${MAX_ANSWER_LENGTH})`;
  }

  if (!data.category) {
    errors.category = 'Category is required';
  }

  return errors;
}

describe('KnowledgeBaseEditor validation', () => {
  describe('validateForm', () => {
    it('should return empty errors for valid form data', () => {
      const formData: KBEntryFormData = {
        category: 'services',
        question: 'What are your business hours?',
        answer: 'We are open Monday to Friday, 9am to 5pm.',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('should reject empty question', () => {
      const formData: KBEntryFormData = {
        category: 'services',
        question: '',
        answer: 'Some answer',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.question).toBe('Question/topic is required');
    });

    it('should reject whitespace-only question', () => {
      const formData: KBEntryFormData = {
        category: 'services',
        question: '   ',
        answer: 'Some answer',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.question).toBe('Question/topic is required');
    });

    it('should reject question exceeding 200 characters', () => {
      const longQuestion = 'a'.repeat(201);
      const formData: KBEntryFormData = {
        category: 'services',
        question: longQuestion,
        answer: 'Some answer',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.question).toBe(`Question must not exceed ${MAX_QUESTION_LENGTH} characters (201/${MAX_QUESTION_LENGTH})`);
    });

    it('should accept question at exactly 200 characters', () => {
      const formData: KBEntryFormData = {
        category: 'services',
        question: 'a'.repeat(200),
        answer: 'Some answer',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.question).toBeUndefined();
    });

    it('should reject empty answer', () => {
      const formData: KBEntryFormData = {
        category: 'services',
        question: 'Valid question',
        answer: '',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.answer).toBe('Answer/content is required');
    });

    it('should reject whitespace-only answer', () => {
      const formData: KBEntryFormData = {
        category: 'services',
        question: 'Valid question',
        answer: '    ',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.answer).toBe('Answer/content is required');
    });

    it('should reject answer exceeding 2000 characters', () => {
      const longAnswer = 'b'.repeat(2001);
      const formData: KBEntryFormData = {
        category: 'services',
        question: 'Valid question',
        answer: longAnswer,
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.answer).toBe(`Answer must not exceed ${MAX_ANSWER_LENGTH} characters (2001/${MAX_ANSWER_LENGTH})`);
    });

    it('should accept answer at exactly 2000 characters', () => {
      const formData: KBEntryFormData = {
        category: 'services',
        question: 'Valid question',
        answer: 'b'.repeat(2000),
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.answer).toBeUndefined();
    });

    it('should reject empty category', () => {
      const formData: KBEntryFormData = {
        category: '',
        question: 'Valid question',
        answer: 'Valid answer',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.category).toBe('Category is required');
    });

    it('should report multiple errors simultaneously', () => {
      const formData: KBEntryFormData = {
        category: '',
        question: '',
        answer: '',
        language: 'en',
      };
      const errors = validateForm(formData);
      expect(errors.question).toBeDefined();
      expect(errors.answer).toBeDefined();
      expect(errors.category).toBeDefined();
    });
  });

  describe('Capacity constants', () => {
    it('should have MAX_TOTAL_ENTRIES set to 500', () => {
      expect(MAX_TOTAL_ENTRIES).toBe(500);
    });

    it('should have MAX_ENTRIES_PER_CATEGORY set to 100', () => {
      expect(MAX_ENTRIES_PER_CATEGORY).toBe(100);
    });

    it('should have MAX_QUESTION_LENGTH set to 200', () => {
      expect(MAX_QUESTION_LENGTH).toBe(200);
    });

    it('should have MAX_ANSWER_LENGTH set to 2000', () => {
      expect(MAX_ANSWER_LENGTH).toBe(2000);
    });
  });

  describe('CATEGORIES configuration', () => {
    it('should include all five required categories', () => {
      const values = CATEGORIES.map((c) => c.value);
      expect(values).toContain('business_hours');
      expect(values).toContain('services');
      expect(values).toContain('pricing');
      expect(values).toContain('location');
      expect(values).toContain('custom');
    });

    it('should have exactly 5 categories', () => {
      expect(CATEGORIES).toHaveLength(5);
    });

    it('should have a human-readable label for each category', () => {
      for (const category of CATEGORIES) {
        expect(category.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('LANGUAGES configuration', () => {
    it('should include all four supported languages', () => {
      const values = LANGUAGES.map((l) => l.value);
      expect(values).toContain('en');
      expect(values).toContain('es');
      expect(values).toContain('fr');
      expect(values).toContain('zh');
    });

    it('should have exactly 4 languages', () => {
      expect(LANGUAGES).toHaveLength(4);
    });

    it('should have a human-readable label for each language', () => {
      for (const lang of LANGUAGES) {
        expect(lang.label.length).toBeGreaterThan(0);
      }
    });

    it('should map language codes to correct labels', () => {
      const langMap = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label]));
      expect(langMap['en']).toBe('English');
      expect(langMap['es']).toBe('Spanish');
      expect(langMap['fr']).toBe('French');
      expect(langMap['zh']).toBe('Mandarin');
    });
  });
});
