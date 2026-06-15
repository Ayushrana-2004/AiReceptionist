# Implementation Plan: AI Receptionist

## Overview

This plan implements the AI Receptionist platform incrementally: starting with project structure and shared types, then building backend services with their validators, followed by frontend dashboard components, and finally wiring integrations and end-to-end flows together. Each task builds on prior work and references specific requirements for traceability.

## Tasks

- [x] 1. Set up project structure, core types, and testing infrastructure
  - [x] 1.1 Create directory structure and install dependencies
    - Create `src/server/`, `src/client/`, `src/shared/` directories
    - Install Express, pg, ioredis, vitest, fast-check, @types packages
    - Configure Vitest in `vitest.config.ts` with coverage thresholds
    - Set up `src/shared/types/` with all TypeScript interfaces and enums from design (Business, User, KBEntry, CallRecord, Lead, RoutingRule, Appointment, SMSMessage, SMSTemplate, AnalyticsSnapshot, CalendarIntegration, CRMIntegration, QualificationCriteria, Vapi webhook events)
    - _Requirements: 9.1, 9.8_

  - [x] 1.2 Create database schema and migration files
    - Create PostgreSQL migration files for all tables (businesses, users, kb_entries, call_records, leads, routing_rules, appointments, sms_messages, sms_templates, analytics_snapshots, calendar_integrations, crm_integrations, qualification_criteria)
    - Add indexes on business_id, created_at, status columns
    - Create Redis connection utility for pub/sub and caching
    - _Requirements: 1.6, 5.7, 7.3_

  - [x] 1.3 Implement input validation module
    - Create `src/server/validators/inputValidator.ts` enforcing field length constraints: business name (100), greeting (500), KB question (200), KB answer (2000), lead name (100), lead reason (500), SMS template body (160), context summary (200)
    - Return structured error responses with field name, message, maxLength, actualLength
    - _Requirements: 1.3, 3.1, 3.6, 4.3, 5.1, 6.3, 9.1_

  - [x] 1.4 Write property test for input validation (Property 1)
    - **Property 1: Input validation enforces field length constraints**
    - Generate random strings of length 0–5000 for each field type
    - Assert rejection for inputs exceeding max length, acceptance at or below
    - **Validates: Requirements 1.3, 3.1, 3.6, 5.1, 6.3, 9.1**

  - [x] 1.5 Implement capacity validator module
    - Create `src/server/validators/capacityValidator.ts` enforcing: 500 KB entries total, 100 per category, 50 routing rules per business, 3 destinations per routing rule, 10 qualification criteria per category
    - _Requirements: 3.4, 4.2, 5.3_

  - [x] 1.6 Write property test for capacity limits (Property 6)
    - **Property 6: System enforces capacity limits**
    - Generate random insertion sequences and verify rejection at capacity boundaries
    - **Validates: Requirements 3.4, 4.2, 5.3**

  - [x] 1.7 Implement format validators (phone, email)
    - Create `src/server/validators/formatValidator.ts` with E.164 phone validation and RFC 5322 basic email validation
    - _Requirements: 5.2_

  - [x] 1.8 Write property test for format validation (Property 10)
    - **Property 10: Phone and email format validation**
    - Generate random strings and verify only valid E.164/RFC 5322 strings pass
    - **Validates: Requirements 5.2**

- [x] 2. Implement core backend services — Call Management and Scheduling
  - [x] 2.1 Implement Call Manager service
    - Create `src/server/services/callManager.ts` implementing ICallManager interface
    - Handle Vapi webhooks: call-start (create session, load business config), call-end (emit events, store record), tool-call dispatch
    - Implement concurrent call tracking with Redis, enforce max 50 concurrent calls, queue overflow
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.2 Write property test for call queueing (Property 2)
    - **Property 2: Call queueing above configured maximum**
    - Generate random N (0–100) simultaneous calls and M (1–50) max capacity
    - Assert exactly N-M queued when N > M, zero queued when N ≤ M
    - **Validates: Requirements 1.7**

  - [x] 2.3 Implement Scheduler service
    - Create `src/server/services/scheduler.ts` implementing ISchedulerService
    - checkAvailability: query calendar for 7-day window from preferred date
    - bookAppointment: create calendar event, return Appointment record
    - cancelAppointment: remove event by ID
    - Implement fallback logic: return next 3 slots beyond window when none available
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.4 Write property test for date range calculation (Property 3)
    - **Property 3: Appointment date range window calculation**
    - Generate random valid dates, assert 7-day window (inclusive start, exclusive end)
    - **Validates: Requirements 2.1**

  - [x] 2.5 Write property test for fallback slot selection (Property 4)
    - **Property 4: Appointment fallback slot selection**
    - Generate random calendar states with empty 7-day windows
    - Assert exactly 3 returned slots, all after the window end
    - **Validates: Requirements 2.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Knowledge Base, Routing, and Lead services
  - [x] 4.1 Implement Knowledge Base service
    - Create `src/server/services/knowledgeBase.ts` implementing IKnowledgeBaseService
    - CRUD operations with category enforcement and capacity checks
    - Keyword-based search: extract keywords from query, match against entry question/topic fields
    - Language fallback: return English entries when target language has no matches
    - Cache KB in Redis with 60s TTL for propagation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 4.2 Write property test for KB search (Property 5)
    - **Property 5: Knowledge Base search returns keyword-matching entries**
    - Generate random KB entries and query strings, assert all-and-only matching entries returned
    - **Validates: Requirements 3.2, 3.3**

  - [x] 4.3 Write property test for KB language fallback (Property 17)
    - **Property 17: KB language fallback to English**
    - Generate random queries in non-English + mixed KB state, assert English fallback entries returned with caller language indicated
    - **Validates: Requirements 8.7**

  - [x] 4.4 Implement Call Routing service
    - Create `src/server/services/callRouter.ts` implementing ICallRoutingService
    - evaluateRoute: match intent category to routing rules, return priority-ordered destinations
    - executeTransfer: attempt transfer via Vapi/Twilio, timeout at 15s per destination
    - handleTransferFailure: advance to next priority destination, max 3 attempts
    - Generate context summary (≤200 chars) with intent category + truncated description
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.5 Write property test for routing fallback order (Property 7)
    - **Property 7: Call routing follows priority-ordered fallback**
    - Generate random routing configs + availability states, assert priority order and max 3 attempts
    - **Validates: Requirements 4.4**

  - [x] 4.6 Write property test for context summary length (Property 8)
    - **Property 8: Context summary never exceeds 200 characters**
    - Generate random intents + descriptions (0–1000 chars), assert ≤200 char output containing intent category
    - **Validates: Requirements 4.3**

  - [x] 4.7 Implement Lead Capture service
    - Create `src/server/services/leadCapture.ts` implementing ILeadCaptureService
    - captureLead: collect name, phone, email, reason with format validation
    - qualifyLead: deterministic status assignment based on configured criteria
    - syncToCRM: push to HubSpot/Salesforce/Zoho with field mapping
    - Queue failed syncs for retry (every 5 min, max 288 attempts over 24h)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 4.8 Write property test for lead qualification (Property 9)
    - **Property 9: Lead qualification assigns correct status based on criteria**
    - Generate random lead data + criteria configs, assert exactly one deterministic status assigned
    - **Validates: Requirements 5.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement SMS, Summary, and Utility services
  - [x] 6.1 Implement SMS service
    - Create `src/server/services/smsService.ts` implementing ISMSService
    - sendConfirmation, sendReminder, sendFollowUp via Twilio API
    - Retry logic: 3 retries at 5-min intervals, then mark permanently_failed
    - Skip delivery on invalid phone numbers, log event
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 6.2 Implement Retry Scheduler utility
    - Create `src/server/services/retryScheduler.ts`
    - Compute retry timestamps: given initial failure time, interval, and max attempts
    - Used by SMS service (3 retries, 5 min) and CRM sync (288 retries, 5 min)
    - _Requirements: 5.6, 6.7_

  - [x] 6.3 Write property test for retry scheduling (Property 11)
    - **Property 11: Retry scheduling produces correct attempt times and respects maximum**
    - Generate random timestamps + intervals + max counts, assert correct spacing and count
    - **Validates: Requirements 5.6, 6.7**

  - [x] 6.4 Implement Summary service
    - Create `src/server/services/summaryService.ts` implementing ISummaryService
    - generateSummary: produce 50–200 char summary from transcript (skip if call <5s)
    - generateTranscript: format Vapi transcript data with "AI"/"Caller" speaker labels
    - classifyOutcome: assign outcome from configured categories
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_

  - [x] 6.5 Write property test for post-call artifacts (Property 13)
    - **Property 13: Post-call artifacts are well-formed**
    - Generate random calls with durations 0–1800s, assert summary length (50–200), speaker labels, outcome membership; no artifacts for <5s
    - **Validates: Requirements 7.1, 7.2, 7.4**

  - [x] 6.6 Implement Pagination utility
    - Create `src/server/utils/pagination.ts`
    - Given N items, page size P (default 20), page K: return correct slice, total pages, sorted by most recent first
    - _Requirements: 5.7_

  - [x] 6.7 Write property test for pagination (Property 12)
    - **Property 12: Pagination returns correct page slices**
    - Generate random arrays (0–1000 items) + page numbers, assert correct indices and page count
    - **Validates: Requirements 5.7**

  - [x] 6.8 Implement Call History filtering
    - Create `src/server/services/callHistory.ts`
    - Filter by outcome category, date range, caller number, keyword search across summary/transcript
    - _Requirements: 7.3_

  - [x] 6.9 Write property test for call history filtering (Property 14)
    - **Property 14: Call history filtering returns only matching records**
    - Generate random call records + filter criteria, assert all-and-only matching records returned
    - **Validates: Requirements 7.3**

- [x] 7. Implement Language, Analytics, and Auth services
  - [x] 7.1 Implement Language Detection service
    - Create `src/server/services/languageDetector.ts`
    - Detect language from text input for supported languages (en, es, fr, zh)
    - Default to English on detection failure
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

  - [x] 7.2 Write property test for language detection (Property 15)
    - **Property 15: Language detection identifies supported languages**
    - Generate random text in supported languages, assert correct identification
    - **Validates: Requirements 8.2, 8.6**

  - [x] 7.3 Implement Language Configuration service
    - Create `src/server/services/languageConfig.ts`
    - Enable/disable languages per business, enforce minimum 1 language enabled
    - _Requirements: 8.3, 8.4_

  - [x] 7.4 Write property test for language config minimum (Property 16)
    - **Property 16: Language configuration maintains minimum enabled count**
    - Generate random enable/disable sequences, assert rejection when operation would leave zero enabled
    - **Validates: Requirements 8.3**

  - [x] 7.5 Implement Analytics service
    - Create `src/server/services/analytics.ts`
    - Compute average duration, appointment conversion rate, lead capture rate
    - Aggregate daily/weekly/monthly snapshots
    - Refresh interval ≤5 minutes
    - _Requirements: 9.2, 9.3_

  - [x] 7.6 Write property test for analytics computations (Property 18)
    - **Property 18: Analytics computations are mathematically correct**
    - Generate random call record sets, assert avg = sum/count, conversion = booked/total × 100, lead rate = captured/total × 100
    - **Validates: Requirements 9.2**

  - [x] 7.7 Implement Authentication service
    - Create `src/server/services/auth.ts`
    - Email/password login, JWT issuance, refresh tokens
    - Account lockout: 5 consecutive failures → 5 min lock
    - Session expiry: 30 min inactivity (no API requests)
    - Reset failure counter on successful login
    - _Requirements: 9.4, 9.5_

  - [x] 7.8 Write property test for auth security (Property 19)
    - **Property 19: Authentication security enforcement**
    - Generate random login attempt sequences, assert lockout after 5 failures, counter reset on success, session expiry after 30 min inactivity
    - **Validates: Requirements 9.4, 9.5**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Conversation and Voice services
  - [x] 9.1 Implement Conversation service
    - Create `src/server/services/conversation.ts`
    - STT rephrasing: generate distinct prompts on failure (up to 3), then offer transfer
    - Context retention: maintain conversation state for ≤30 min calls
    - Intent classification dispatching to tool calls (booking, routing, lead capture)
    - _Requirements: 10.3, 10.4, 10.5, 10.6_

  - [x] 9.2 Write property test for STT rephrasing (Property 20)
    - **Property 20: STT rephrasing prompts are distinct**
    - Generate random STT failure sequences, assert each prompt is textually distinct, max 3 before transfer
    - **Validates: Requirements 10.4**

  - [x] 9.3 Write property test for context retention (Property 21)
    - **Property 21: Conversation context retention**
    - Generate random conversation histories (0–30 min), assert all stated info accessible in subsequent turns
    - **Validates: Requirements 10.6**

- [x] 10. Implement Express API routes and webhook handlers
  - [x] 10.1 Set up Express server with middleware
    - Create `src/server/index.ts` with Express app, CORS, JSON body parsing, error handling middleware
    - Configure JWT authentication middleware
    - Set up Redis pub/sub event bus
    - _Requirements: 9.4_

  - [x] 10.2 Implement auth API routes
    - Create `src/server/routes/auth.ts` — POST /api/auth/login, POST /api/auth/refresh
    - Wire to auth service
    - _Requirements: 9.4, 9.5_

  - [x] 10.3 Implement calls API routes
    - Create `src/server/routes/calls.ts` — GET /api/calls, GET /api/calls/:id, GET /api/calls/active
    - WebSocket upgrade for real-time call status
    - _Requirements: 1.6, 7.3, 7.5_

  - [x] 10.4 Implement knowledge base API routes
    - Create `src/server/routes/knowledgeBase.ts` — GET/POST /api/knowledge-base, PUT/DELETE /api/knowledge-base/:id
    - Wire validation and capacity checks
    - _Requirements: 3.1, 3.4, 3.5, 3.6_

  - [x] 10.5 Implement routing rules, leads, config, SMS, analytics, and integration API routes
    - Create `src/server/routes/routingRules.ts` — CRUD for /api/routing-rules
    - Create `src/server/routes/leads.ts` — GET /api/leads, GET/PUT /api/leads/:id
    - Create `src/server/routes/config.ts` — GET/PUT /api/config
    - Create `src/server/routes/sms.ts` — CRUD /api/sms/templates, GET /api/sms/history
    - Create `src/server/routes/analytics.ts` — GET /api/analytics
    - Create `src/server/routes/integrations.ts` — POST/DELETE /api/integrations/calendar, /api/integrations/crm
    - _Requirements: 4.2, 4.6, 5.3, 5.5, 5.7, 6.2, 6.3, 6.6, 9.1, 9.2, 9.3_

  - [x] 10.6 Implement Vapi webhook routes
    - Create `src/server/routes/webhooks.ts` — POST /api/webhooks/vapi/call-start, /call-end, /tool-call
    - Dispatch to Call Manager service
    - Emit events on Redis pub/sub for async processing (lead capture, SMS, summary generation)
    - _Requirements: 1.1, 1.4, 7.1, 7.2_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement frontend — Auth and Layout
  - [x] 12.1 Set up React app structure and routing
    - Create `src/client/App.tsx` with React Router
    - Create `src/client/components/`, `src/client/hooks/`, `src/client/services/` directories
    - Set up API client service with JWT token management
    - _Requirements: 9.4, 9.8_

  - [x] 12.2 Implement AuthProvider component
    - Create `src/client/components/AuthProvider.tsx`
    - JWT-based auth, session management, 30-min inactivity timeout
    - Login form with email/password, error display, lockout messaging
    - Protected route wrapper
    - _Requirements: 9.4, 9.5_

  - [x] 12.3 Implement DashboardLayout component
    - Create `src/client/components/DashboardLayout.tsx`
    - Responsive shell (≥768px), navigation sidebar, WCAG 2.1 AA compliance
    - Proper heading hierarchy, keyboard navigation, focus management, color contrast
    - _Requirements: 9.8_

- [x] 13. Implement frontend — Configuration and Knowledge Base
  - [x] 13.1 Implement ConfigPanel component
    - Create `src/client/components/ConfigPanel.tsx`
    - Business name, greeting, voice selection, operating hours, call timeout, max concurrent calls
    - Client-side field length validation with inline errors
    - Save with confirmation message, error handling with form retention
    - _Requirements: 9.1, 9.6, 9.7_

  - [x] 13.2 Implement KnowledgeBaseEditor component
    - Create `src/client/components/KnowledgeBaseEditor.tsx`
    - CRUD for KB entries with category selection and validation
    - Display capacity (X/500 total, X/100 per category)
    - Inline validation for empty fields and max lengths
    - _Requirements: 3.1, 3.4, 3.6_

  - [x] 13.3 Implement LanguageSettings component
    - Create `src/client/components/LanguageSettings.tsx`
    - Enable/disable languages, prevent disabling last language
    - Per-language KB content management interface
    - _Requirements: 8.3, 8.4_

  - [x] 13.4 Implement SMSTemplateEditor component
    - Create `src/client/components/SMSTemplateEditor.tsx`
    - CRUD for SMS templates, trigger event selection, 160-char limit enforcement
    - Reminder interval configuration (15min, 1h, 4h, 24h, 48h)
    - _Requirements: 6.2, 6.3_

- [x] 14. Implement frontend — Calls, Leads, and Analytics
  - [x] 14.1 Implement CallMonitor component
    - Create `src/client/components/CallMonitor.tsx`
    - Real-time call status display (active/queued/completed) via WebSocket
    - Update within 2 seconds of state changes
    - _Requirements: 1.6_

  - [x] 14.2 Implement CallHistory component
    - Create `src/client/components/CallHistory.tsx`
    - Paginated list with summaries, transcripts, metadata
    - Search by keyword, filter by outcome/date/caller number
    - Summary/transcript unavailable indicators
    - _Requirements: 7.3, 7.5, 7.6_

  - [x] 14.3 Implement RoutingRuleEditor component
    - Create `src/client/components/RoutingRuleEditor.tsx`
    - CRUD for routing rules, intent category selection, priority-ordered destinations (max 3)
    - Capacity display (X/50 rules)
    - _Requirements: 4.2, 4.6_

  - [x] 14.4 Implement LeadsList component
    - Create `src/client/components/LeadsList.tsx`
    - Paginated list (20/page), qualification status filters
    - Contact details, call timestamp, CRM sync status
    - _Requirements: 5.7_

  - [x] 14.5 Implement AnalyticsDashboard component
    - Create `src/client/components/AnalyticsDashboard.tsx`
    - Time range selector (today, 7 days, 30 days)
    - Total calls, avg duration, conversion rate, lead capture rate
    - Daily/weekly/monthly call volume charts
    - Routing analytics by intent category with date range
    - _Requirements: 9.2, 9.3, 4.6_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Wire integrations and event-driven processing
  - [x] 16.1 Implement Event Bus handlers
    - Create `src/server/events/eventBus.ts` with Redis pub/sub
    - Subscribe handlers: on call-end → generate summary + transcript, capture lead, send SMS
    - Ensure async processing does not block webhook responses
    - _Requirements: 7.1, 7.2, 5.4, 6.1, 6.4_

  - [x] 16.2 Implement Google Calendar integration
    - Create `src/server/integrations/calendar.ts`
    - OAuth2 flow, availability queries, event creation/deletion
    - Handle unreachable API with graceful fallback
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 16.3 Implement CRM integrations
    - Create `src/server/integrations/crm.ts`
    - Support HubSpot, Salesforce, Zoho via adapter pattern
    - OAuth2 auth, field mapping, lead creation/updates
    - Retry queue on failure (288 attempts over 24h)
    - _Requirements: 5.5, 5.6_

  - [x] 16.4 Implement Vapi assistant configuration
    - Create `src/server/integrations/vapi.ts`
    - Register assistant with business config (greeting, voice profile, enabled languages)
    - Configure tool definitions for Claude (check_availability, book_appointment, capture_lead, transfer_call)
    - Handle config propagation within 30s of dashboard changes
    - _Requirements: 1.3, 2.1, 4.1, 9.6, 10.1, 10.2_

  - [x] 16.5 Wire frontend WebSocket for real-time updates
    - Create `src/client/hooks/useCallStatus.ts` WebSocket hook
    - Connect CallMonitor component to live call status stream
    - Handle reconnection on disconnect
    - _Requirements: 1.6_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses Express + PostgreSQL + Redis; the frontend uses React + TypeScript + Vite
- External service integrations (Vapi, Twilio, Deepgram, ElevenLabs, Google Calendar, CRM) should use interface adapters for testability
- All API routes require JWT auth except webhook endpoints (verified by Vapi signature)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.5", "1.7"] },
    { "id": 2, "tasks": ["1.4", "1.6", "1.8"] },
    { "id": 3, "tasks": ["2.1", "2.3", "4.1", "4.4", "4.7", "6.6"] },
    { "id": 4, "tasks": ["2.2", "2.4", "2.5", "4.2", "4.3", "4.5", "4.6", "4.8", "6.7"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.4", "6.8", "7.1", "7.3", "7.5", "7.7"] },
    { "id": 6, "tasks": ["6.3", "6.5", "6.9", "7.2", "7.4", "7.6", "7.8"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6"] },
    { "id": 11, "tasks": ["12.1"] },
    { "id": 12, "tasks": ["12.2", "12.3"] },
    { "id": 13, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 14, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 15, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5"] }
  ]
}
```
