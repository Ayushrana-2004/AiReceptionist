/**
 * Language Detection Service
 *
 * Detects the language of text input using heuristic analysis
 * (character ranges, common words, diacritical patterns).
 * Supports: English (en), Spanish (es), French (fr), Mandarin Chinese (zh).
 * Defaults to English on detection failure or unsupported language.
 *
 * Requirements: 8.1, 8.2, 8.5, 8.6
 */

import { Language } from '../../shared/types';

// --- Common Word Lists ---

const SPANISH_WORDS: Set<string> = new Set([
  'hola', 'cómo', 'como', 'qué', 'que', 'por', 'favor', 'gracias',
  'buenos', 'buenas', 'días', 'dias', 'tardes', 'noches',
  'necesito', 'quiero', 'tengo', 'puede', 'puedo',
  'bien', 'está', 'esta', 'usted', 'señor', 'señora',
  'también', 'aquí', 'ahora', 'dónde', 'donde',
  'cuándo', 'cuando', 'cuánto', 'cuanto', 'para',
  'con', 'una', 'uno', 'del', 'los', 'las',
  'más', 'muy', 'pero', 'porque', 'cita', 'reservar',
]);

const FRENCH_WORDS: Set<string> = new Set([
  'bonjour', 'merci', 'oui', 'non', 'comment', 'est',
  "s'il", 'vous', 'plaît', 'plait', 'bonsoir',
  'je', 'suis', 'voudrais', 'besoin', 'rendez',
  'avec', 'pour', 'une', 'des', 'les', 'dans',
  'très', 'bien', 'aussi', 'mais', 'parce',
  'ici', 'maintenant', 'quand', 'combien',
  'monsieur', 'madame', 'mademoiselle',
  'aujourd', "aujourd'hui", 'demain', 'hier',
  'puis', 'donc', 'quel', 'quelle', 'cette',
]);

// --- Character Detection Patterns ---

/**
 * CJK Unified Ideographs range (U+4E00–U+9FFF).
 * Also includes CJK Extension A (U+3400–U+4DBF) and
 * common CJK punctuation.
 */
const CJK_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF]/;

/**
 * Spanish-specific diacritical characters.
 */
const SPANISH_CHARS = /[ñ¿¡áéíóú]/i;

/**
 * French-specific diacritical characters and patterns.
 */
const FRENCH_CHARS = /[çàâæéèêëîïôœùûüÿ]/i;

// --- Scoring Logic ---

interface LanguageScore {
  language: Language;
  score: number;
}

/**
 * Compute a Chinese score based on CJK character density.
 * Returns a score between 0 and 1.
 */
function scoreChineseChars(text: string): number {
  if (text.length === 0) return 0;

  let cjkCount = 0;
  for (const char of text) {
    if (CJK_REGEX.test(char)) {
      cjkCount++;
    }
  }

  // CJK character ratio — even a small percentage indicates Chinese
  const ratio = cjkCount / text.length;
  // If any CJK characters found, boost significantly
  if (cjkCount > 0) {
    return Math.min(1, ratio * 3 + 0.4);
  }
  return 0;
}

/**
 * Compute a score for a given language based on word matches and character patterns.
 */
function scoreLanguageWords(
  words: string[],
  wordSet: Set<string>,
  charPattern: RegExp,
  text: string,
): number {
  if (words.length === 0) return 0;

  let wordMatches = 0;
  for (const word of words) {
    if (wordSet.has(word.toLowerCase())) {
      wordMatches++;
    }
  }

  // Score from word matches (ratio of matching words)
  const wordScore = wordMatches / words.length;

  // Score from character patterns (presence of diacriticals)
  let charScore = 0;
  const charMatches = text.match(new RegExp(charPattern.source, 'gi'));
  if (charMatches) {
    charScore = Math.min(1, charMatches.length / text.length * 5 + 0.2);
  }

  // Combined score: weight words more heavily than characters
  return wordScore * 0.7 + charScore * 0.3;
}

/**
 * Tokenize text into words (lowercased), splitting on whitespace and punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:'"()\[\]{}\-—–/\\]+/)
    .filter((w) => w.length > 0);
}

// --- Public API ---

/**
 * Detect the language of the given text input.
 *
 * Uses character-based and word-frequency heuristics to identify
 * supported languages (en, es, fr, zh). Defaults to 'en' on
 * detection failure, empty input, or unsupported language.
 *
 * @param text - The text to analyze
 * @returns The detected Language ('en' | 'es' | 'fr' | 'zh')
 */
export function detectLanguage(text: string): Language {
  // Default to English for empty or whitespace-only input
  if (!text || text.trim().length === 0) {
    return 'en';
  }

  const trimmedText = text.trim();
  const words = tokenize(trimmedText);

  // Compute scores for each language
  const scores: LanguageScore[] = [
    {
      language: 'zh',
      score: scoreChineseChars(trimmedText),
    },
    {
      language: 'es',
      score: scoreLanguageWords(words, SPANISH_WORDS, SPANISH_CHARS, trimmedText),
    },
    {
      language: 'fr',
      score: scoreLanguageWords(words, FRENCH_WORDS, FRENCH_CHARS, trimmedText),
    },
  ];

  // Find the highest-scoring non-English language
  const bestMatch = scores.reduce(
    (best, current) => (current.score > best.score ? current : best),
    { language: 'en' as Language, score: 0 },
  );

  // Require a minimum confidence threshold to avoid false positives
  const MIN_THRESHOLD = 0.15;
  if (bestMatch.score >= MIN_THRESHOLD) {
    return bestMatch.language;
  }

  // Default to English
  return 'en';
}
