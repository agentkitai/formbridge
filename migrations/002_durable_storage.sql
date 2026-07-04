-- FormBridge PostgreSQL Schema
-- Migration: 002_durable_storage.sql
--
-- Doc artifact only. `PostgresStorage.initialize()` (src/storage/postgres-storage.ts,
-- INIT_SQL) is the source of truth and applies these idempotently on boot; this
-- file mirrors it for reference / out-of-band migration.
--
-- Adds: durable-storage columns on submissions, the deliveries outbox table, and
-- a schema_migrations ledger.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL
);

-- New submission columns (promoted out of the JSONB blob for indexing/queries).
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS destination_delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_submissions_tenant_id ON submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_submissions_expires_at ON submissions(expires_at);

-- Durable webhook/destination delivery outbox.
CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  status_code INTEGER,
  error TEXT,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status_next_retry ON deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_submission_id ON deliveries(submission_id);
-- Deliberately NO unique guard on (submission_id, destination_url): repeat
-- deliveries to the same destination are legitimate (e.g. reviewer
-- notifications), and deliveries are already uniquely keyed by delivery_id (PK).
-- Drop the old partial unique index if a prior migration created it.
DROP INDEX IF EXISTS idx_deliveries_submission_dest;

INSERT INTO schema_migrations (version, applied_at)
  VALUES ('002_durable_storage', NOW())
  ON CONFLICT (version) DO NOTHING;
