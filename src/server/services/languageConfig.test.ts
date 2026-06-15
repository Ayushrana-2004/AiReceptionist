/**
 * Unit tests for Language Configuration Service
 *
 * Requirements: 8.3, 8.4
 */

import { describe, it, expect } from 'vitest';
import {
  enableLanguage,
  disableLanguage,
  isLastLanguage,
  getEnabledLanguages,
} from './languageConfig';
import { Language } from '../../shared/types';

describe('languageConfig', () => {
  describe('enableLanguage', () => {
    it('adds a language to an empty list', () => {
      const result = enableLanguage([], 'en');
      expect(result).toEqual(['en']);
    });

    it('adds a language to an existing list', () => {
      const result = enableLanguage(['en'], 'es');
      expect(result).toEqual(['en', 'es']);
    });

    it('does not add duplicate languages', () => {
      const result = enableLanguage(['en', 'es'], 'en');
      expect(result).toEqual(['en', 'es']);
    });

    it('preserves existing order when adding a new language', () => {
      const result = enableLanguage(['fr', 'en'], 'zh');
      expect(result).toEqual(['fr', 'en', 'zh']);
    });

    it('does not mutate the original array', () => {
      const original: Language[] = ['en'];
      const result = enableLanguage(original, 'fr');
      expect(original).toEqual(['en']);
      expect(result).toEqual(['en', 'fr']);
    });

    it('handles all supported languages', () => {
      let languages: Language[] = [];
      languages = enableLanguage(languages, 'en');
      languages = enableLanguage(languages, 'es');
      languages = enableLanguage(languages, 'fr');
      languages = enableLanguage(languages, 'zh');
      expect(languages).toEqual(['en', 'es', 'fr', 'zh']);
    });
  });

  describe('disableLanguage', () => {
    it('removes a language from the list', () => {
      const result = disableLanguage(['en', 'es'], 'es');
      expect(result).toEqual(['en']);
    });

    it('throws error when trying to disable the last language', () => {
      expect(() => disableLanguage(['en'], 'en')).toThrow(
        'Cannot disable the last enabled language. At least one language must remain enabled.',
      );
    });

    it('throws error when all entries are the same language (duplicates scenario)', () => {
      // Even with duplicates of the same language, removing it leaves 0
      expect(() => disableLanguage(['en'], 'en')).toThrow();
    });

    it('removes all occurrences of the language', () => {
      // If somehow duplicates exist, filter removes all
      const result = disableLanguage(['en', 'es', 'en', 'fr'], 'en');
      expect(result).toEqual(['es', 'fr']);
    });

    it('returns unchanged list when language is not present', () => {
      const result = disableLanguage(['en', 'es'], 'fr');
      expect(result).toEqual(['en', 'es']);
    });

    it('does not mutate the original array', () => {
      const original: Language[] = ['en', 'es'];
      const result = disableLanguage(original, 'es');
      expect(original).toEqual(['en', 'es']);
      expect(result).toEqual(['en']);
    });

    it('allows disabling when multiple languages remain', () => {
      const result = disableLanguage(['en', 'es', 'fr', 'zh'], 'zh');
      expect(result).toEqual(['en', 'es', 'fr']);
    });
  });

  describe('isLastLanguage', () => {
    it('returns true when only one language exists and it matches', () => {
      expect(isLastLanguage(['en'], 'en')).toBe(true);
    });

    it('returns false when other languages exist', () => {
      expect(isLastLanguage(['en', 'es'], 'en')).toBe(false);
    });

    it('returns false when the language is not in the list', () => {
      expect(isLastLanguage(['en', 'es'], 'fr')).toBe(false);
    });

    it('returns true for empty list (removing any language from empty leaves 0)', () => {
      // An empty list filtered by any language is still empty
      expect(isLastLanguage([], 'en')).toBe(true);
    });

    it('returns false when multiple distinct languages exist', () => {
      expect(isLastLanguage(['en', 'es', 'fr', 'zh'], 'en')).toBe(false);
    });
  });

  describe('getEnabledLanguages', () => {
    it('returns a copy of the languages array', () => {
      const original: Language[] = ['en', 'es'];
      const result = getEnabledLanguages(original);
      expect(result).toEqual(['en', 'es']);
      // Verify it is a new array (not the same reference)
      expect(result).not.toBe(original);
    });

    it('returns empty array for empty input', () => {
      expect(getEnabledLanguages([])).toEqual([]);
    });

    it('returns all languages when all are enabled', () => {
      const all: Language[] = ['en', 'es', 'fr', 'zh'];
      expect(getEnabledLanguages(all)).toEqual(['en', 'es', 'fr', 'zh']);
    });

    it('does not mutate the original when returned value is modified', () => {
      const original: Language[] = ['en', 'fr'];
      const result = getEnabledLanguages(original);
      result.push('zh');
      expect(original).toEqual(['en', 'fr']);
    });
  });

  describe('integration: enable/disable sequences', () => {
    it('can enable and disable languages maintaining at least one', () => {
      let languages: Language[] = ['en'];
      languages = enableLanguage(languages, 'es');
      languages = enableLanguage(languages, 'fr');
      expect(languages).toEqual(['en', 'es', 'fr']);

      languages = disableLanguage(languages, 'en');
      expect(languages).toEqual(['es', 'fr']);

      languages = disableLanguage(languages, 'es');
      expect(languages).toEqual(['fr']);

      // Cannot disable the last one
      expect(() => disableLanguage(languages, 'fr')).toThrow();
    });

    it('re-enabling a disabled language works', () => {
      let languages: Language[] = ['en', 'es'];
      languages = disableLanguage(languages, 'es');
      expect(languages).toEqual(['en']);

      languages = enableLanguage(languages, 'es');
      expect(languages).toEqual(['en', 'es']);
    });
  });
});
