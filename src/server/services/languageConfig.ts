/**
 * Language Configuration Service
 *
 * Manages enabled languages per business. All functions are pure (no side effects).
 * Enforces that at least one language remains enabled at all times.
 *
 * Requirements: 8.3, 8.4
 */

import { Language } from '../../shared/types';

/**
 * Check if removing the given language would leave zero enabled languages.
 *
 * @param currentLanguages - The currently enabled languages
 * @param language - The language to check
 * @returns true if removing the language would leave zero enabled
 */
export function isLastLanguage(currentLanguages: Language[], language: Language): boolean {
  const remaining = currentLanguages.filter((l) => l !== language);
  return remaining.length === 0;
}

/**
 * Enable a language by adding it to the list. No duplicates are added.
 *
 * @param currentLanguages - The currently enabled languages
 * @param language - The language to enable
 * @returns A new array with the language included (no duplicates)
 */
export function enableLanguage(currentLanguages: Language[], language: Language): Language[] {
  if (currentLanguages.includes(language)) {
    return [...currentLanguages];
  }
  return [...currentLanguages, language];
}

/**
 * Disable a language by removing it from the list.
 * Throws an error if removing the language would leave zero enabled languages.
 *
 * @param currentLanguages - The currently enabled languages
 * @param language - The language to disable
 * @returns A new array without the specified language
 * @throws Error if removing the language would leave zero enabled
 */
export function disableLanguage(currentLanguages: Language[], language: Language): Language[] {
  if (isLastLanguage(currentLanguages, language)) {
    throw new Error('Cannot disable the last enabled language. At least one language must remain enabled.');
  }
  return currentLanguages.filter((l) => l !== language);
}

/**
 * Get the list of currently enabled languages.
 *
 * @param currentLanguages - The currently enabled languages
 * @returns A copy of the enabled languages array
 */
export function getEnabledLanguages(currentLanguages: Language[]): Language[] {
  return [...currentLanguages];
}
