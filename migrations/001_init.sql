-- FormBridge PostgreSQL Schema
-- Migration: 001_init.sql

-- Note: id columns are TEXT (not UUID): FormBridge generates prefixed string ids
-- like sub_<uuid> / evt_<uuid>, which are not valid PostgreSQL UUIDs.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL,
  state TEXT NOT NULL,
  resume_token TEXT NOT NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_intake_id ON submissions(intake_id);
CREATE INDEX IF NOT EXISTS idx_submissions_state ON submissions(state);
CREATE INDEX IF NOT EXISTS idx_submissions_resume_token ON submissions(resume_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_idempotency_key ON submissions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL,
  actor JSONB NOT NULL,
  state TEXT NOT NULL,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_submission_id ON events(submission_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
