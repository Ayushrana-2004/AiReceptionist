-- 001_initial_schema.sql
-- Initial database schema for AI Receptionist platform

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BUSINESSES
-- ============================================================
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  greeting VARCHAR(500) NOT NULL,
  voice_profile_id VARCHAR(255) NOT NULL,
  enabled_languages JSONB NOT NULL DEFAULT '["en"]',
  operating_hours JSONB NOT NULL,
  max_concurrent_calls INTEGER NOT NULL DEFAULT 50,
  call_timeout_seconds INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_business_id ON users(business_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- KNOWLEDGE BASE ENTRIES
-- ============================================================
CREATE TABLE kb_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL CHECK (category IN ('business_hours', 'services', 'pricing', 'location', 'custom')),
  question VARCHAR(200) NOT NULL,
  answer VARCHAR(2000) NOT NULL,
  language VARCHAR(5) NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es', 'fr', 'zh')),
  keywords JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_entries_business_id ON kb_entries(business_id);
CREATE INDEX idx_kb_entries_created_at ON kb_entries(created_at);
CREATE INDEX idx_kb_entries_category ON kb_entries(category);
CREATE INDEX idx_kb_entries_language ON kb_entries(language);

-- ============================================================
-- CALL RECORDS
-- ============================================================
CREATE TABLE call_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  caller_number VARCHAR(50) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'queued', 'completed', 'failed')),
  outcome_category VARCHAR(100),
  summary_text TEXT,
  transcript_url VARCHAR(500),
  intent_classification VARCHAR(100),
  language VARCHAR(5) NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es', 'fr', 'zh')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_records_business_id ON call_records(business_id);
CREATE INDEX idx_call_records_created_at ON call_records(created_at);
CREATE INDEX idx_call_records_status ON call_records(status);
CREATE INDEX idx_call_records_started_at ON call_records(started_at);
CREATE INDEX idx_call_records_caller_number ON call_records(caller_number);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES call_records(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  reason VARCHAR(500),
  qualification_status VARCHAR(20) NOT NULL DEFAULT 'needs_review' CHECK (qualification_status IN ('qualified', 'unqualified', 'needs_review')),
  crm_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (crm_sync_status IN ('synced', 'pending', 'failed')),
  crm_record_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_business_id ON leads(business_id);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_status ON leads(qualification_status);
CREATE INDEX idx_leads_crm_sync_status ON leads(crm_sync_status);

-- ============================================================
-- ROUTING RULES
-- ============================================================
CREATE TABLE routing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  intent_category VARCHAR(100) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  destinations JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_routing_rules_business_id ON routing_rules(business_id);
CREATE INDEX idx_routing_rules_intent_category ON routing_rules(intent_category);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES call_records(id) ON DELETE CASCADE,
  caller_name VARCHAR(100) NOT NULL,
  caller_phone VARCHAR(50) NOT NULL,
  service_type VARCHAR(100) NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  calendar_event_id VARCHAR(255) NOT NULL,
  sms_confirmation_sent BOOLEAN NOT NULL DEFAULT false,
  reminders_sent JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_business_id ON appointments(business_id);
CREATE INDEX idx_appointments_created_at ON appointments(created_at);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);

-- ============================================================
-- SMS MESSAGES
-- ============================================================
CREATE TABLE sms_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recipient_phone VARCHAR(50) NOT NULL,
  template_id UUID,
  body VARCHAR(160) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('confirmation', 'reminder', 'follow_up')),
  status VARCHAR(30) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'permanently_failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  twilio_message_sid VARCHAR(255),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sms_messages_business_id ON sms_messages(business_id);
CREATE INDEX idx_sms_messages_created_at ON sms_messages(sent_at);
CREATE INDEX idx_sms_messages_status ON sms_messages(status);

-- ============================================================
-- SMS TEMPLATES
-- ============================================================
CREATE TABLE sms_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  body VARCHAR(160) NOT NULL,
  trigger_event VARCHAR(30) NOT NULL CHECK (trigger_event IN ('missed_call', 'voicemail', 'lead_captured', 'appointment_booked')),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_sms_templates_business_id ON sms_templates(business_id);

-- ============================================================
-- ANALYTICS SNAPSHOTS
-- ============================================================
CREATE TABLE analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period VARCHAR(10) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  date DATE NOT NULL,
  total_calls INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds NUMERIC(10, 2) NOT NULL DEFAULT 0,
  appointment_conversion_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  lead_capture_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  transfers_by_category JSONB NOT NULL DEFAULT '{}',
  calls_by_outcome JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_snapshots_business_id ON analytics_snapshots(business_id);
CREATE INDEX idx_analytics_snapshots_created_at ON analytics_snapshots(created_at);
CREATE INDEX idx_analytics_snapshots_date ON analytics_snapshots(date);
CREATE UNIQUE INDEX idx_analytics_snapshots_unique ON analytics_snapshots(business_id, period, date);

-- ============================================================
-- CALENDAR INTEGRATIONS
-- ============================================================
CREATE TABLE calendar_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'outlook', 'calendly')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  calendar_id VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_calendar_integrations_business_id ON calendar_integrations(business_id);

-- ============================================================
-- CRM INTEGRATIONS
-- ============================================================
CREATE TABLE crm_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('hubspot', 'salesforce', 'zoho')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  field_mapping JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_crm_integrations_business_id ON crm_integrations(business_id);

-- ============================================================
-- QUALIFICATION CRITERIA
-- ============================================================
CREATE TABLE qualification_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category VARCHAR(20) NOT NULL CHECK (category IN ('budget', 'timeline', 'service_type')),
  values JSONB NOT NULL DEFAULT '[]',
  weight NUMERIC(5, 2) NOT NULL DEFAULT 1.0
);

CREATE INDEX idx_qualification_criteria_business_id ON qualification_criteria(business_id);

-- ============================================================
-- Add foreign key for sms_messages.template_id
-- ============================================================
ALTER TABLE sms_messages
  ADD CONSTRAINT fk_sms_messages_template
  FOREIGN KEY (template_id) REFERENCES sms_templates(id) ON DELETE SET NULL;
