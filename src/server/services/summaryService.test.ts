import { describe, it, expect } from 'vitest';
import {
  generateTranscript,
  generateSummary,
  classifyOutcome,
  DEFAULT_OUTCOME_CATEGORIES,
  Transcript,
  VapiTranscriptData,
} from './summaryService';

describe('SummaryService', () => {
  describe('generateTranscript', () => {
    it('converts assistant role to "AI" speaker label', () => {
      const data: VapiTranscriptData = {
        segments: [
          { role: 'assistant', text: 'Hello, how can I help you?', timestamp: 0 },
        ],
        durationSeconds: 30,
      };

      const transcript = generateTranscript(data);

      expect(transcript.segments[0].speaker).toBe('AI');
      expect(transcript.text).toContain('AI: Hello, how can I help you?');
    });

    it('converts user role to "Caller" speaker label', () => {
      const data: VapiTranscriptData = {
        segments: [
          { role: 'user', text: 'I need to book an appointment', timestamp: 1 },
        ],
        durationSeconds: 30,
      };

      const transcript = generateTranscript(data);

      expect(transcript.segments[0].speaker).toBe('Caller');
      expect(transcript.text).toContain('Caller: I need to book an appointment');
    });

    it('formats multi-segment transcript with correct labels', () => {
      const data: VapiTranscriptData = {
        segments: [
          { role: 'assistant', text: 'Welcome to our service.', timestamp: 0 },
          { role: 'user', text: 'Hi, I have a question about pricing.', timestamp: 2 },
          { role: 'assistant', text: 'Sure, I can help with that.', timestamp: 4 },
        ],
        durationSeconds: 10,
      };

      const transcript = generateTranscript(data);

      expect(transcript.segments).toHaveLength(3);
      expect(transcript.segments[0].speaker).toBe('AI');
      expect(transcript.segments[1].speaker).toBe('Caller');
      expect(transcript.segments[2].speaker).toBe('AI');
      expect(transcript.text).toBe(
        'AI: Welcome to our service.\nCaller: Hi, I have a question about pricing.\nAI: Sure, I can help with that.'
      );
    });

    it('preserves durationSeconds from input data', () => {
      const data: VapiTranscriptData = {
        segments: [{ role: 'assistant', text: 'Hello', timestamp: 0 }],
        durationSeconds: 120,
      };

      const transcript = generateTranscript(data);

      expect(transcript.durationSeconds).toBe(120);
    });

    it('handles empty segments array', () => {
      const data: VapiTranscriptData = {
        segments: [],
        durationSeconds: 0,
      };

      const transcript = generateTranscript(data);

      expect(transcript.segments).toHaveLength(0);
      expect(transcript.text).toBe('');
    });

    it('preserves timestamps in segments', () => {
      const data: VapiTranscriptData = {
        segments: [
          { role: 'assistant', text: 'Hello', timestamp: 1000 },
          { role: 'user', text: 'Hi', timestamp: 2500 },
        ],
        durationSeconds: 5,
      };

      const transcript = generateTranscript(data);

      expect(transcript.segments[0].timestamp).toBe(1000);
      expect(transcript.segments[1].timestamp).toBe(2500);
    });
  });

  describe('generateSummary', () => {
    it('returns null summary when call duration is less than 5 seconds', () => {
      const transcript: Transcript = {
        text: 'AI: Hello\nCaller: Hi',
        durationSeconds: 4,
        segments: [
          { speaker: 'AI', text: 'Hello', timestamp: 0 },
          { speaker: 'Caller', text: 'Hi', timestamp: 1 },
        ],
      };

      const result = generateSummary(transcript);

      expect(result.summary).toBeNull();
    });

    it('returns null summary when call duration is exactly 0 seconds', () => {
      const transcript: Transcript = {
        text: '',
        durationSeconds: 0,
        segments: [],
      };

      const result = generateSummary(transcript);

      expect(result.summary).toBeNull();
    });

    it('generates summary when call duration is exactly 5 seconds', () => {
      const transcript: Transcript = {
        text: 'AI: Hello, how can I help you today?\nCaller: I would like to book an appointment for next week please',
        durationSeconds: 5,
        segments: [
          { speaker: 'AI', text: 'Hello, how can I help you today?', timestamp: 0 },
          { speaker: 'Caller', text: 'I would like to book an appointment for next week please', timestamp: 2 },
        ],
      };

      const result = generateSummary(transcript);

      expect(result.summary).not.toBeNull();
    });

    it('generates summary between 50 and 200 characters', () => {
      const transcript: Transcript = {
        text: 'AI: Welcome to Smith Dental. How can I help you?\nCaller: I need to schedule a cleaning appointment for next Tuesday if possible.\nAI: Let me check availability for next Tuesday.\nCaller: Great, thank you.',
        durationSeconds: 30,
        segments: [
          { speaker: 'AI', text: 'Welcome to Smith Dental. How can I help you?', timestamp: 0 },
          { speaker: 'Caller', text: 'I need to schedule a cleaning appointment for next Tuesday if possible.', timestamp: 3 },
          { speaker: 'AI', text: 'Let me check availability for next Tuesday.', timestamp: 8 },
          { speaker: 'Caller', text: 'Great, thank you.', timestamp: 12 },
        ],
      };

      const result = generateSummary(transcript);

      expect(result.summary).not.toBeNull();
      expect(result.summary!.length).toBeGreaterThanOrEqual(50);
      expect(result.summary!.length).toBeLessThanOrEqual(200);
    });

    it('classifies outcome along with summary generation', () => {
      const transcript: Transcript = {
        text: 'AI: I have booked your appointment for next Tuesday at 2pm.\nCaller: Great, the appointment is confirmed then.',
        durationSeconds: 20,
        segments: [
          { speaker: 'AI', text: 'I have booked your appointment for next Tuesday at 2pm.', timestamp: 0 },
          { speaker: 'Caller', text: 'Great, the appointment is confirmed then.', timestamp: 5 },
        ],
      };

      const result = generateSummary(transcript);

      expect(result.outcome).toBe('appointment_booked');
    });
  });

  describe('classifyOutcome', () => {
    it('classifies appointment-related calls correctly', () => {
      const transcript: Transcript = {
        text: 'AI: Your appointment has been booked for Monday.\nCaller: Thank you for scheduling that.',
        durationSeconds: 15,
        segments: [
          { speaker: 'AI', text: 'Your appointment has been booked for Monday.', timestamp: 0 },
          { speaker: 'Caller', text: 'Thank you for scheduling that.', timestamp: 3 },
        ],
      };

      const result = classifyOutcome(transcript, [...DEFAULT_OUTCOME_CATEGORIES]);

      expect(result).toBe('appointment_booked');
    });

    it('classifies transferred calls correctly', () => {
      const transcript: Transcript = {
        text: 'AI: Let me transfer you to our sales team.\nCaller: Yes please connect me to someone.',
        durationSeconds: 10,
        segments: [
          { speaker: 'AI', text: 'Let me transfer you to our sales team.', timestamp: 0 },
          { speaker: 'Caller', text: 'Yes please connect me to someone.', timestamp: 3 },
        ],
      };

      const result = classifyOutcome(transcript, [...DEFAULT_OUTCOME_CATEGORIES]);

      expect(result).toBe('transferred');
    });

    it('classifies lead captured calls correctly', () => {
      const transcript: Transcript = {
        text: 'AI: Can I get your email for a follow up?\nCaller: Sure, I am interested in your services. My phone number is 555-1234.',
        durationSeconds: 15,
        segments: [
          { speaker: 'AI', text: 'Can I get your email for a follow up?', timestamp: 0 },
          { speaker: 'Caller', text: 'Sure, I am interested in your services. My phone number is 555-1234.', timestamp: 3 },
        ],
      };

      const result = classifyOutcome(transcript, [...DEFAULT_OUTCOME_CATEGORIES]);

      expect(result).toBe('lead_captured');
    });

    it('classifies message taken calls correctly', () => {
      const transcript: Transcript = {
        text: 'AI: Would you like to leave a message?\nCaller: Yes, please relay this note to the doctor.',
        durationSeconds: 10,
        segments: [
          { speaker: 'AI', text: 'Would you like to leave a message?', timestamp: 0 },
          { speaker: 'Caller', text: 'Yes, please relay this note to the doctor.', timestamp: 3 },
        ],
      };

      const result = classifyOutcome(transcript, [...DEFAULT_OUTCOME_CATEGORIES]);

      expect(result).toBe('message_taken');
    });

    it('classifies information provided calls correctly', () => {
      const transcript: Transcript = {
        text: 'AI: Our hours are 9am to 5pm Monday through Friday.\nCaller: What is your address and location?',
        durationSeconds: 10,
        segments: [
          { speaker: 'AI', text: 'Our hours are 9am to 5pm Monday through Friday.', timestamp: 0 },
          { speaker: 'Caller', text: 'What is your address and location?', timestamp: 3 },
        ],
      };

      const result = classifyOutcome(transcript, [...DEFAULT_OUTCOME_CATEGORIES]);

      expect(result).toBe('information_provided');
    });

    it('falls back to first category when no keywords match', () => {
      const transcript: Transcript = {
        text: 'AI: Goodbye.\nCaller: Bye.',
        durationSeconds: 3,
        segments: [
          { speaker: 'AI', text: 'Goodbye.', timestamp: 0 },
          { speaker: 'Caller', text: 'Bye.', timestamp: 1 },
        ],
      };

      const customCategories = ['custom_a', 'custom_b'];
      const result = classifyOutcome(transcript, customCategories);

      expect(result).toBe('custom_a');
    });

    it('returns information_provided for empty categories array', () => {
      const transcript: Transcript = {
        text: 'AI: Hello\nCaller: Hi',
        durationSeconds: 5,
        segments: [
          { speaker: 'AI', text: 'Hello', timestamp: 0 },
          { speaker: 'Caller', text: 'Hi', timestamp: 1 },
        ],
      };

      const result = classifyOutcome(transcript, []);

      expect(result).toBe('information_provided');
    });

    it('returns the category with the most keyword matches', () => {
      // Transcript mentions appointment multiple times + one transfer keyword
      const transcript: Transcript = {
        text: 'AI: I can help you book an appointment. Let me check the calendar for available slots.\nCaller: Yes I would like to schedule an appointment and reserve a slot.',
        durationSeconds: 15,
        segments: [
          { speaker: 'AI', text: 'I can help you book an appointment. Let me check the calendar for available slots.', timestamp: 0 },
          { speaker: 'Caller', text: 'Yes I would like to schedule an appointment and reserve a slot.', timestamp: 5 },
        ],
      };

      const result = classifyOutcome(transcript, [...DEFAULT_OUTCOME_CATEGORIES]);

      expect(result).toBe('appointment_booked');
    });

    it('accepts custom categories', () => {
      const transcript: Transcript = {
        text: 'AI: I can help with booking.\nCaller: I want to book an appointment.',
        durationSeconds: 10,
        segments: [
          { speaker: 'AI', text: 'I can help with booking.', timestamp: 0 },
          { speaker: 'Caller', text: 'I want to book an appointment.', timestamp: 3 },
        ],
      };

      // Only provide appointment_booked from the defaults
      const result = classifyOutcome(transcript, ['appointment_booked', 'other_category']);

      expect(result).toBe('appointment_booked');
    });
  });
});
