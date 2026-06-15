/**
 * Unit tests for Language Detection Service
 *
 * Requirements: 8.1, 8.2, 8.5, 8.6
 */

import { describe, it, expect } from 'vitest';
import { detectLanguage } from './languageDetector';

describe('languageDetector', () => {
  describe('detectLanguage', () => {
    // --- Chinese (zh) detection ---

    it('detects Chinese text with CJK characters', () => {
      expect(detectLanguage('你好，我想预约')).toBe('zh');
    });

    it('detects Chinese even with short input', () => {
      expect(detectLanguage('你好')).toBe('zh');
    });

    it('detects Chinese mixed with some English', () => {
      expect(detectLanguage('我需要一个appointment')).toBe('zh');
    });

    // --- Spanish (es) detection ---

    it('detects Spanish from common words', () => {
      expect(detectLanguage('Hola, necesito reservar una cita por favor')).toBe('es');
    });

    it('detects Spanish from diacritical characters', () => {
      expect(detectLanguage('¿Cómo puedo hacer una reservación?')).toBe('es');
    });

    it('detects Spanish greeting', () => {
      expect(detectLanguage('Buenos días, quiero una cita')).toBe('es');
    });

    // --- French (fr) detection ---

    it('detects French from common words', () => {
      expect(detectLanguage('Bonjour, je voudrais prendre un rendez-vous')).toBe('fr');
    });

    it('detects French from diacritical characters', () => {
      expect(detectLanguage("S'il vous plaît, je suis très intéressé")).toBe('fr');
    });

    it('detects French greeting', () => {
      expect(detectLanguage('Bonsoir monsieur, comment puis-je vous aider?')).toBe('fr');
    });

    // --- English (en) detection ---

    it('detects English text', () => {
      expect(detectLanguage('Hello, I would like to book an appointment')).toBe('en');
    });

    it('detects English for generic text without language markers', () => {
      expect(detectLanguage('I need help with my order')).toBe('en');
    });

    // --- Default behavior ---

    it('defaults to English for empty string', () => {
      expect(detectLanguage('')).toBe('en');
    });

    it('defaults to English for whitespace-only input', () => {
      expect(detectLanguage('   ')).toBe('en');
    });

    it('defaults to English for numbers only', () => {
      expect(detectLanguage('12345')).toBe('en');
    });

    it('defaults to English for unrecognized text', () => {
      expect(detectLanguage('xyz abc def')).toBe('en');
    });

    // --- Language switching (Requirement 8.6) ---

    it('detects language change when given Spanish after English context', () => {
      // Simulates mid-conversation language switch detection
      expect(detectLanguage('Gracias, necesito ayuda por favor')).toBe('es');
    });

    it('detects language change to French', () => {
      expect(detectLanguage('Merci beaucoup, je voudrais un rendez-vous')).toBe('fr');
    });

    it('detects language change to Chinese', () => {
      expect(detectLanguage('谢谢，我想预约一下')).toBe('zh');
    });

    // --- Edge cases ---

    it('handles single character input', () => {
      const result = detectLanguage('a');
      expect(['en', 'es', 'fr', 'zh']).toContain(result);
    });

    it('handles single Chinese character', () => {
      expect(detectLanguage('好')).toBe('zh');
    });

    it('returns a supported Language type', () => {
      const supportedLanguages = ['en', 'es', 'fr', 'zh'];
      expect(supportedLanguages).toContain(detectLanguage('any text'));
    });
  });
});
