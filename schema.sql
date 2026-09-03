-- Schema required by netlify/functions/email-alerts.mjs
-- Run this once against the database at WOWSQL_DATABASE_URL before the
-- scheduled function is invoked for the first time.

CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_events (
  id SERIAL PRIMARY KEY,
  gmail_message_id TEXT NOT NULL UNIQUE,
  sender TEXT,
  subject TEXT,
  snippet TEXT,
  category TEXT,
  received_at TIMESTAMPTZ,
  is_important BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_notifications (
  id SERIAL PRIMARY KEY,
  email_event_id INTEGER NOT NULL REFERENCES email_events(id),
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO alert_rules (name, category, keywords) VALUES
  ('admissions', 'University, admissions and bursaries', ARRAY['admission', 'bursary', 'registration', 'nsfas']),
  ('security', 'Account security and payment problems', ARRAY['security alert', 'payment failed', 'suspicious login', 'verify your account']),
  ('deadlines', 'Deadlines, appointments and official documents', ARRAY['deadline', 'appointment', 'due date', 'official document'])
ON CONFLICT DO NOTHING;
