/**
 * Property-Based Test: Conversation context retention
 *
 * Feature: ai-receptionist, Property 21: Conversation context retention
 *
 * Validates: Requirements 10.6
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ConversationContext, ConversationMessage } from './conversation';

/**
 * Generator for a conversation message with speaker and text.
 * Timestamps are generated in ascending order based on index.
 */
function messageArbitrary(baseTime: Date, index: number) {
  return fc.record({
    speaker: fc.constantFrom<'AI' | 'Caller'>('AI', 'Caller'),
    text: fc.string({ minLength: 1, maxLength: 200 }),
  }).map(({ speaker, text }) => ({
    speaker,
    text,
    timestamp: new Date(baseTime.getTime() + index * 1000), // 1 second apart
  }));
}

/**
 * Generator for a sequence of conversation messages (1–50 messages)
 * within a 30-minute window.
 */
function conversationHistoryArbitrary() {
  return fc.integer({ min: 1, max: 50 }).chain((length) => {
    const baseTime = new Date('2024-06-01T10:00:00Z');
    const arbs = Array.from({ length }, (_, i) => messageArbitrary(baseTime, i));
    return fc.tuple(...(arbs as [ReturnType<typeof messageArbitrary>, ...ReturnType<typeof messageArbitrary>[]]));
  });
}

describe('Property 21: Conversation context retention', () => {
  it('getContext() returns all messages in order after adding N messages (length matches input)', () => {
    fc.assert(
      fc.property(
        conversationHistoryArbitrary(),
        (messages) => {
          const context = new ConversationContext(new Date('2024-06-01T09:59:00Z'));

          for (const msg of messages) {
            context.addMessage(msg.speaker, msg.text, msg.timestamp);
          }

          const result = context.getContext();

          // Length must match
          expect(result).toHaveLength(messages.length);

          // Every message must match in order
          for (let i = 0; i < messages.length; i++) {
            expect(result[i].speaker).toBe(messages[i].speaker);
            expect(result[i].text).toBe(messages[i].text);
            expect(result[i].timestamp.getTime()).toBe(messages[i].timestamp.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every message added is present and accessible in later getContext() calls', () => {
    fc.assert(
      fc.property(
        conversationHistoryArbitrary(),
        (messages) => {
          const context = new ConversationContext(new Date('2024-06-01T09:59:00Z'));

          // Add messages one at a time and verify each is accessible after adding
          for (let i = 0; i < messages.length; i++) {
            context.addMessage(messages[i].speaker, messages[i].text, messages[i].timestamp);

            const currentContext = context.getContext();
            // The message we just added should be the last one
            const lastMsg = currentContext[currentContext.length - 1];
            expect(lastMsg.speaker).toBe(messages[i].speaker);
            expect(lastMsg.text).toBe(messages[i].text);
            expect(lastMsg.timestamp.getTime()).toBe(messages[i].timestamp.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('messages from earlier turns remain accessible after later messages are added', () => {
    fc.assert(
      fc.property(
        conversationHistoryArbitrary(),
        (messages) => {
          const context = new ConversationContext(new Date('2024-06-01T09:59:00Z'));

          // Add all messages
          for (const msg of messages) {
            context.addMessage(msg.speaker, msg.text, msg.timestamp);
          }

          // Now verify that after all are added, every earlier message is still accessible
          const finalContext = context.getContext();

          for (let i = 0; i < messages.length; i++) {
            expect(finalContext[i].speaker).toBe(messages[i].speaker);
            expect(finalContext[i].text).toBe(messages[i].text);
            expect(finalContext[i].timestamp.getTime()).toBe(messages[i].timestamp.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adding new messages does not mutate previously retrieved context snapshots', () => {
    fc.assert(
      fc.property(
        conversationHistoryArbitrary(),
        fc.integer({ min: 1, max: 49 }),
        (messages, splitIndexRaw) => {
          const splitIndex = Math.min(splitIndexRaw, messages.length - 1);
          if (splitIndex < 1) return; // Need at least 1 message in first batch

          const context = new ConversationContext(new Date('2024-06-01T09:59:00Z'));

          // Add first batch of messages
          for (let i = 0; i < splitIndex; i++) {
            context.addMessage(messages[i].speaker, messages[i].text, messages[i].timestamp);
          }

          // Take a snapshot
          const snapshot = context.getContext();
          const snapshotLength = snapshot.length;

          // Add remaining messages
          for (let i = splitIndex; i < messages.length; i++) {
            context.addMessage(messages[i].speaker, messages[i].text, messages[i].timestamp);
          }

          // Original snapshot should be unchanged (immutable copy)
          expect(snapshot).toHaveLength(snapshotLength);

          // Full context should now have all messages
          const fullContext = context.getContext();
          expect(fullContext).toHaveLength(messages.length);

          // Earlier messages still intact in the full context
          for (let i = 0; i < splitIndex; i++) {
            expect(fullContext[i].speaker).toBe(messages[i].speaker);
            expect(fullContext[i].text).toBe(messages[i].text);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
