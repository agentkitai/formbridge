/**
 * PostgresStorage — PostgreSQL-based implementation of FormBridgeStorage.
 *
 * Uses `pg` (node-postgres) with connection pooling for multi-replica HA deployments.
 * This is an optional peer dependency — users must install `pg` separately.
 *
 * Tables:
 * - submissions: id (TEXT, e.g. sub_<uuid>), intake_id, state, resume_token, data (JSONB), ...
 * - events: event_id (TEXT, e.g. evt_<uuid>), type, submission_id, ts (TIMESTAMPTZ), actor (JSONB), ...
 *
 * Environment:
 * - DATABASE_URL: PostgreSQL connection string
 * - FORMBRIDGE_STORAGE=postgres to select this backend
 */

import type { Submission } from "../submission-types.js";
import type {
  IntakeEvent,
  IntakeEventType,
  Actor,
  DeliveryRecord,
} from "../types/intake-contract.js";
import type { EventStore, EventFilters, EventStoreStats } from "../core/event-store.js";
import type {
  DeliveryQueue,
  DeliveryQueueStats,
  DeliveryContext,
} from "../core/delivery-queue.js";
import { EventId, SubmissionId, DeliveryId } from "../types/branded.js";
import type { StorageBackend } from "./storage-backend.js";
import type {
  FormBridgeStorage,
  SubmissionStorage,
  SubmissionFilter,
  PaginatedResult,
  PaginationOptions,
  StorageTransaction,
} from "./storage-interface.js";

// =============================================================================
// § Runtime type guards
// =============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isSubmissionShape(value: unknown): value is Submission {
  return (
    value != null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "intakeId" in value &&
    typeof value.intakeId === "string" &&
    "state" in value &&
    typeof value.state === "string"
  );
}

function isActor(value: unknown): value is Actor {
  return (
    value != null &&
    typeof value === "object" &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

const VALID_SUBMISSION_STATES = new Set<string>([
  "draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted",
  "needs_review", "approved", "rejected", "finalized", "cancelled", "expired",
  "created", "validating", "invalid", "valid", "uploading", "submitting",
  "completed", "failed", "pending_approval",
]);

function isSubmissionState(value: string): value is import("../types/intake-contract.js").SubmissionState {
  return VALID_SUBMISSION_STATES.has(value);
}

const VALID_INTAKE_EVENT_TYPES = new Set<string>([
  "submission.created", "field.updated", "fields.updated",
  "validation.passed", "validation.failed",
  "upload.requested", "upload.completed", "upload.failed",
  "submission.submitted", "review.requested", "review.approved", "review.rejected",
  "delivery.attempted", "delivery.succeeded", "delivery.failed",
  "submission.finalized", "submission.cancelled", "submission.expired",
  "handoff.link_issued", "handoff.resumed",
]);

function isIntakeEventType(value: string): value is IntakeEventType {
  return VALID_INTAKE_EVENT_TYPES.has(value);
}

// =============================================================================
// § Types for pg (optional dependency)
// =============================================================================

interface PgQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

/** Anything that can run a parameterized query (pool or a checked-out client). */
interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<PgQueryResult>;
}

interface PgClient extends PgQueryable {
  release(): void;
}

interface PgPool extends PgQueryable {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

interface PgPoolConstructor {
  new (config: { connectionString: string; max?: number; idleTimeoutMillis?: number }): PgPool;
}

// =============================================================================
// § PostgreSQL Submission Storage
// =============================================================================

class PostgresSubmissionStorage implements SubmissionStorage {
  constructor(private pool: PgQueryable) {}

  async get(id: string): Promise<Submission | null> {
    const { rows } = await this.pool.query(
      "SELECT data FROM submissions WHERE id = $1",
      [id]
    );
    if (rows.length === 0) return null;
    const parsed = rows[0]?.data;
    return isSubmissionShape(parsed) ? parsed : null;
  }

  async getByResumeToken(token: string): Promise<Submission | null> {
    const { rows } = await this.pool.query(
      "SELECT data FROM submissions WHERE resume_token = $1",
      [token]
    );
    if (rows.length === 0) return null;
    const parsed = rows[0]?.data;
    return isSubmissionShape(parsed) ? parsed : null;
  }

  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    const { rows } = await this.pool.query(
      "SELECT data FROM submissions WHERE idempotency_key = $1",
      [key]
    );
    if (rows.length === 0) return null;
    const parsed = rows[0]?.data;
    return isSubmissionShape(parsed) ? parsed : null;
  }

  async save(submission: Submission): Promise<void> {
    await this.pool.query(
      `INSERT INTO submissions
         (id, intake_id, state, resume_token, idempotency_key, tenant_id, expires_at, destination_delivered_at, created_at, updated_at, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         intake_id = EXCLUDED.intake_id,
         state = EXCLUDED.state,
         resume_token = EXCLUDED.resume_token,
         idempotency_key = EXCLUDED.idempotency_key,
         tenant_id = EXCLUDED.tenant_id,
         expires_at = EXCLUDED.expires_at,
         destination_delivered_at = EXCLUDED.destination_delivered_at,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at,
         data = EXCLUDED.data`,
      [
        submission.id,
        submission.intakeId,
        submission.state,
        submission.resumeToken,
        submission.idempotencyKey ?? null,
        submission.tenantId ?? null,
        submission.expiresAt ?? null,
        submission.destinationDeliveredAt ?? null,
        submission.createdAt,
        submission.updatedAt,
        JSON.stringify(submission),
      ]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM submissions WHERE id = $1",
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async list(
    filter: SubmissionFilter,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Submission>> {
    const whereClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filter.intakeId) {
      whereClauses.push(`intake_id = $${paramIdx++}`);
      params.push(filter.intakeId);
    }
    if (filter.state) {
      whereClauses.push(`state = $${paramIdx++}`);
      params.push(filter.state);
    }
    if (filter.createdAfter) {
      whereClauses.push(`created_at >= $${paramIdx++}`);
      params.push(filter.createdAfter);
    }
    if (filter.createdBefore) {
      whereClauses.push(`created_at <= $${paramIdx++}`);
      params.push(filter.createdBefore);
    }

    const whereStr =
      whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    // Count
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM submissions ${whereStr}`,
      params
    );
    const total = (countResult.rows[0]?.count as number) ?? 0;

    // Paginate
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;

    const dataResult = await this.pool.query(
      `SELECT data FROM submissions ${whereStr} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    const items: Submission[] = [];
    for (const row of dataResult.rows) {
      const parsed = row.data;
      if (isSubmissionShape(parsed)) {
        items.push(parsed);
      }
    }

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  }

  async count(filter: SubmissionFilter): Promise<number> {
    const result = await this.list(filter, { limit: 0 });
    return result.total;
  }

  async getExpired(): Promise<Submission[]> {
    const now = new Date().toISOString();
    const { rows } = await this.pool.query(
      `SELECT data FROM submissions
       WHERE expires_at IS NOT NULL AND expires_at < $1
         AND state NOT IN ('rejected', 'finalized', 'cancelled', 'expired')`,
      [now]
    );
    const items: Submission[] = [];
    for (const row of rows) {
      if (isSubmissionShape(row.data)) items.push(row.data);
    }
    return items;
  }

  async getAll(tenantId?: string): Promise<Submission[]> {
    const { rows } = tenantId
      ? await this.pool.query(
          "SELECT data FROM submissions WHERE tenant_id IS NULL OR tenant_id = $1",
          [tenantId]
        )
      : await this.pool.query("SELECT data FROM submissions");
    const items: Submission[] = [];
    for (const row of rows) {
      if (isSubmissionShape(row.data)) items.push(row.data);
    }
    return items;
  }

  async getStateCounts(): Promise<Record<string, number>> {
    const { rows } = await this.pool.query(
      "SELECT state, COUNT(*)::int as count FROM submissions GROUP BY state"
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const state = row.state;
      const count = row.count;
      if (typeof state === "string" && typeof count === "number") {
        counts[state] = count;
      }
    }
    return counts;
  }

  async getTotalCount(): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*)::int as count FROM submissions"
    );
    return (rows[0]?.count as number) ?? 0;
  }

  async getPendingApprovalCount(): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*)::int as count FROM submissions WHERE state = 'needs_review'"
    );
    return (rows[0]?.count as number) ?? 0;
  }
}

// =============================================================================
// § PostgreSQL Delivery Queue
// =============================================================================

function isDeliveryStatus(value: unknown): value is DeliveryRecord["status"] {
  return value === "pending" || value === "succeeded" || value === "failed";
}

function pgRowToDeliveryRecord(row: Record<string, unknown>): DeliveryRecord {
  return {
    deliveryId: DeliveryId(String(row.delivery_id)),
    submissionId: SubmissionId(String(row.submission_id)),
    destinationUrl: String(row.destination_url),
    status: isDeliveryStatus(row.status) ? row.status : "pending",
    attempts: (row.attempts as number) ?? 0,
    lastAttemptAt: pgTsToIso(row.last_attempt_at),
    nextRetryAt: pgTsToIso(row.next_retry_at),
    statusCode: (row.status_code as number | null) ?? undefined,
    error: (row.error as string | null) ?? undefined,
    createdAt: pgTsToIso(row.created_at) ?? new Date().toISOString(),
  };
}

function pgTsToIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

class PostgresDeliveryQueue implements DeliveryQueue {
  /** In-memory cache of retry contexts for synchronous getContext(). */
  private contexts = new Map<string, DeliveryContext>();

  constructor(private pool: PgQueryable) {}

  /**
   * Load retry contexts for non-terminal deliveries into the in-memory cache so
   * getContext() works after a process restart (mirrors SqliteDeliveryQueue's
   * constructor rehydration). Called once from PostgresStorage.initialize().
   * Without this, the webhook retry loop would `continue` past every pending
   * delivery (getContext returns undefined) and strand it forever.
   */
  async hydrateContexts(): Promise<void> {
    const { rows } = await this.pool.query(
      "SELECT delivery_id, context FROM deliveries WHERE context IS NOT NULL AND status <> 'failed'"
    );
    for (const row of rows) {
      const id = row.delivery_id;
      const ctx = row.context;
      if (typeof id !== "string" || ctx == null) continue;
      try {
        // pg returns JSONB as a parsed object; tolerate a raw string too.
        const parsed = typeof ctx === "string" ? JSON.parse(ctx) : ctx;
        if (parsed != null && typeof parsed === "object") {
          this.contexts.set(id, parsed as DeliveryContext);
        }
      } catch {
        // ignore malformed context
      }
    }
  }

  async enqueue(record: DeliveryRecord, context?: DeliveryContext): Promise<void> {
    await this.pool.query(
      `INSERT INTO deliveries
         (delivery_id, submission_id, destination_url, status, attempts, last_attempt_at, next_retry_at, status_code, error, context, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (delivery_id) DO UPDATE SET
         submission_id = EXCLUDED.submission_id,
         destination_url = EXCLUDED.destination_url,
         status = EXCLUDED.status,
         attempts = EXCLUDED.attempts,
         last_attempt_at = EXCLUDED.last_attempt_at,
         next_retry_at = EXCLUDED.next_retry_at,
         status_code = EXCLUDED.status_code,
         error = EXCLUDED.error,
         context = EXCLUDED.context`,
      [
        record.deliveryId,
        record.submissionId,
        record.destinationUrl,
        record.status,
        record.attempts,
        record.lastAttemptAt ?? null,
        record.nextRetryAt ?? null,
        record.statusCode ?? null,
        record.error ?? null,
        context ? JSON.stringify(context) : null,
        record.createdAt,
      ]
    );
    if (context) {
      this.contexts.set(record.deliveryId, context);
    }
  }

  getContext(deliveryId: string): DeliveryContext | undefined {
    return this.contexts.get(deliveryId);
  }

  async get(deliveryId: string): Promise<DeliveryRecord | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM deliveries WHERE delivery_id = $1",
      [deliveryId]
    );
    const row = rows[0];
    return row ? pgRowToDeliveryRecord(row) : null;
  }

  async getBySubmission(submissionId: string): Promise<DeliveryRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM deliveries WHERE submission_id = $1 ORDER BY created_at ASC",
      [submissionId]
    );
    return rows.map(pgRowToDeliveryRecord);
  }

  async update(record: DeliveryRecord): Promise<void> {
    const result = await this.pool.query(
      `UPDATE deliveries SET
         submission_id = $2, destination_url = $3, status = $4, attempts = $5,
         last_attempt_at = $6, next_retry_at = $7, status_code = $8, error = $9
       WHERE delivery_id = $1`,
      [
        record.deliveryId,
        record.submissionId,
        record.destinationUrl,
        record.status,
        record.attempts,
        record.lastAttemptAt ?? null,
        record.nextRetryAt ?? null,
        record.statusCode ?? null,
        record.error ?? null,
      ]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error(`Delivery not found: ${record.deliveryId}`);
    }
  }

  async getPendingRetries(): Promise<DeliveryRecord[]> {
    const now = new Date().toISOString();
    const { rows } = await this.pool.query(
      `SELECT * FROM deliveries
       WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= $1)
       ORDER BY created_at ASC`,
      [now]
    );
    return rows.map(pgRowToDeliveryRecord);
  }

  async getStats(): Promise<DeliveryQueueStats> {
    const { rows } = await this.pool.query(
      "SELECT status, COUNT(*)::int as count FROM deliveries GROUP BY status"
    );
    const stats: DeliveryQueueStats = {
      total: 0,
      pending: 0,
      succeeded: 0,
      failed: 0,
    };
    for (const row of rows) {
      const status = row.status;
      const count = (row.count as number) ?? 0;
      if (typeof status === "string") {
        stats.total += count;
        if (status === "pending") stats.pending = count;
        else if (status === "succeeded") stats.succeeded = count;
        else if (status === "failed") stats.failed = count;
      }
    }
    return stats;
  }
}

// =============================================================================
// § PostgreSQL Event Store
// =============================================================================

class PostgresEventStore implements EventStore {
  constructor(private pool: PgQueryable) {}

  async appendEvent(event: IntakeEvent): Promise<void> {
    // Assign version atomically using a subquery
    const versionResult = await this.pool.query(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM events WHERE submission_id = $1",
      [event.submissionId]
    );
    const nextVersion = (versionResult.rows[0]?.next_version as number) ?? 1;
    event.version = nextVersion;

    try {
      await this.pool.query(
        `INSERT INTO events (event_id, type, submission_id, ts, version, actor, state, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          event.eventId,
          event.type,
          event.submissionId,
          event.ts,
          nextVersion,
          JSON.stringify(event.actor),
          event.state,
          event.payload ? JSON.stringify(event.payload) : null,
        ]
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate key")) {
        throw new Error(`Duplicate eventId: ${event.eventId}`);
      }
      throw err;
    }
  }

  async getEvents(
    submissionId: string,
    filters?: EventFilters
  ): Promise<IntakeEvent[]> {
    const whereClauses = ["submission_id = $1"];
    const params: unknown[] = [submissionId];
    let paramIdx = 2;

    if (filters?.types && filters.types.length > 0) {
      const placeholders = filters.types.map(() => `$${paramIdx++}`).join(",");
      whereClauses.push(`type IN (${placeholders})`);
      params.push(...filters.types);
    }
    if (filters?.actorKind) {
      whereClauses.push(`actor->>'kind' = $${paramIdx++}`);
      params.push(filters.actorKind);
    }
    if (filters?.since) {
      whereClauses.push(`ts >= $${paramIdx++}`);
      params.push(filters.since);
    }
    if (filters?.until) {
      whereClauses.push(`ts <= $${paramIdx++}`);
      params.push(filters.until);
    }

    const whereStr = "WHERE " + whereClauses.join(" AND ");
    let sql = `SELECT * FROM events ${whereStr} ORDER BY ts ASC`;

    if (filters?.limit !== undefined) {
      sql += ` LIMIT $${paramIdx++}`;
      params.push(filters.limit);
    }
    if (filters?.offset) {
      sql += ` OFFSET $${paramIdx++}`;
      params.push(filters.offset);
    }

    const { rows } = await this.pool.query(sql, params);
    return this.mapEventRows(rows);
  }

  /**
   * Map raw event rows to IntakeEvent[], skipping any row that fails validation.
   * Shared by getEvents and the analytics helpers below.
   */
  private mapEventRows(rows: Record<string, unknown>[]): IntakeEvent[] {
    const events: IntakeEvent[] = [];
    for (const row of rows) {
      const actorValue = row.actor;
      const parsedActor = typeof actorValue === "string" ? JSON.parse(actorValue) : actorValue;
      if (!isActor(parsedActor)) continue;

      const type = row.type as string;
      const state = row.state as string;
      if (!isIntakeEventType(type)) continue;
      if (!isSubmissionState(state)) continue;

      let payload: Record<string, unknown> | undefined;
      if (row.payload) {
        const p = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        payload = isRecord(p) ? p : undefined;
      }

      events.push({
        eventId: EventId(row.event_id as string),
        type,
        submissionId: SubmissionId(row.submission_id as string),
        ts: typeof row.ts === "string" ? row.ts : (row.ts as Date).toISOString(),
        version: row.version as number,
        actor: parsedActor,
        state,
        payload,
      });
    }
    return events;
  }

  /**
   * Get the most recent events across all submissions (newest first).
   * Analytics helper — mirrors InMemoryEventStore.getRecentEventsAll so app.ts
   * feature-detection wires /analytics/summary recentActivity automatically.
   * Returns a Promise (pg is async); the analytics provider awaits it.
   */
  async getRecentEventsAll(limit: number): Promise<IntakeEvent[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM events ORDER BY ts DESC LIMIT $1",
      [limit]
    );
    return this.mapEventRows(rows);
  }

  /**
   * Get all events of a given type (chronological order).
   * Analytics helper — mirrors InMemoryEventStore.getEventsByTypeAll so app.ts
   * feature-detection wires /analytics/volume automatically.
   * Returns a Promise (pg is async); the analytics provider awaits it.
   */
  async getEventsByTypeAll(type: string): Promise<IntakeEvent[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM events WHERE type = $1 ORDER BY ts ASC",
      [type]
    );
    return this.mapEventRows(rows);
  }

  async countEvents(
    submissionId: string,
    filters?: EventFilters
  ): Promise<number> {
    const whereClauses = ["submission_id = $1"];
    const params: unknown[] = [submissionId];
    let paramIdx = 2;

    if (filters?.types && filters.types.length > 0) {
      const placeholders = filters.types.map(() => `$${paramIdx++}`).join(",");
      whereClauses.push(`type IN (${placeholders})`);
      params.push(...filters.types);
    }
    if (filters?.actorKind) {
      whereClauses.push(`actor->>'kind' = $${paramIdx++}`);
      params.push(filters.actorKind);
    }
    if (filters?.since) {
      whereClauses.push(`ts >= $${paramIdx++}`);
      params.push(filters.since);
    }
    if (filters?.until) {
      whereClauses.push(`ts <= $${paramIdx++}`);
      params.push(filters.until);
    }

    const whereStr = "WHERE " + whereClauses.join(" AND ");
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int as cnt FROM events ${whereStr}`,
      params
    );
    return (rows[0]?.cnt as number) ?? 0;
  }

  async getStats(): Promise<EventStoreStats> {
    const { rows } = await this.pool.query(`
      SELECT
        COUNT(*)::int as "totalEvents",
        COUNT(DISTINCT submission_id)::int as "submissionCount",
        MIN(ts) as "oldestEvent",
        MAX(ts) as "newestEvent"
      FROM events
    `);

    const row = rows[0];
    if (!row) {
      return { totalEvents: 0, submissionCount: 0 };
    }

    const oldest = row.oldestEvent;
    const newest = row.newestEvent;

    return {
      totalEvents: (row.totalEvents as number) ?? 0,
      submissionCount: (row.submissionCount as number) ?? 0,
      oldestEvent: oldest ? (oldest instanceof Date ? oldest.toISOString() : String(oldest)) : undefined,
      newestEvent: newest ? (newest instanceof Date ? newest.toISOString() : String(newest)) : undefined,
    };
  }

  async cleanupOld(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const result = await this.pool.query(
      "DELETE FROM events WHERE ts < $1",
      [cutoff]
    );
    return result.rowCount ?? 0;
  }
}

// =============================================================================
// § No-Op File Storage
// =============================================================================

class NoopStorageBackend implements StorageBackend {
  async generateUploadUrl(): Promise<never> {
    throw new Error("File storage not configured for PostgreSQL backend");
  }
  async verifyUpload(): Promise<never> {
    throw new Error("File storage not configured for PostgreSQL backend");
  }
  async getUploadMetadata(): Promise<undefined> {
    throw new Error("File storage not configured for PostgreSQL backend");
  }
  async generateDownloadUrl(): Promise<undefined> {
    throw new Error("File storage not configured for PostgreSQL backend");
  }
  async deleteUpload(): Promise<boolean> {
    throw new Error("File storage not configured for PostgreSQL backend");
  }
  async cleanupExpired(): Promise<void> {
    throw new Error("File storage not configured for PostgreSQL backend");
  }
}

// =============================================================================
// § Migration SQL
// =============================================================================

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL
);

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

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS destination_delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_submissions_intake_id ON submissions(intake_id);
CREATE INDEX IF NOT EXISTS idx_submissions_state ON submissions(state);
CREATE INDEX IF NOT EXISTS idx_submissions_resume_token ON submissions(resume_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_idempotency_key ON submissions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_tenant_id ON submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_submissions_expires_at ON submissions(expires_at);

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
-- notifications). Deliveries are keyed by delivery_id (PK), minted fresh per
-- enqueue. Drop the old partial unique index if a pre-existing DB carries it —
-- it raised an unhandled unique_violation on the second legitimate enqueue.
DROP INDEX IF EXISTS idx_deliveries_submission_dest;

INSERT INTO schema_migrations (version, applied_at)
  VALUES ('002_durable_storage', NOW())
  ON CONFLICT (version) DO NOTHING;
`;

// =============================================================================
// § PostgresStorage — Unified PostgreSQL Storage
// =============================================================================

export interface PostgresStorageOptions {
  /** PostgreSQL connection string (e.g., postgresql://user:pass@host:5432/db) */
  connectionString: string;
  /** Maximum number of connections in the pool (default: 10) */
  maxConnections?: number;
  /** Idle timeout in milliseconds (default: 30000) */
  idleTimeoutMillis?: number;
  /** Optional file storage backend */
  fileStorage?: StorageBackend;
}

export class PostgresStorage implements FormBridgeStorage {
  submissions!: SubmissionStorage;
  events!: EventStore;
  deliveries!: DeliveryQueue;
  files: StorageBackend;
  private pool: PgPool | null = null;
  private options: PostgresStorageOptions;

  constructor(options: PostgresStorageOptions) {
    this.options = options;
    this.files = options.fileStorage ?? new NoopStorageBackend();
  }

  async initialize(): Promise<void> {
    // Dynamic import of pg (optional peer dependency)
    let Pool: PgPoolConstructor;
    try {
      const mod = await import("pg" as string);
      Pool = (mod.default?.Pool ?? mod.Pool) as PgPoolConstructor;
      if (typeof Pool !== "function") {
        throw new Error("pg Pool constructor not found");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Pool constructor")) {
        throw err;
      }
      throw new Error(
        "pg is required for PostgresStorage. Install it: npm install pg"
      );
    }

    this.pool = new Pool({
      connectionString: this.options.connectionString,
      max: this.options.maxConnections ?? 10,
      idleTimeoutMillis: this.options.idleTimeoutMillis ?? 30000,
    });

    // Run migration. All DDL is kept in this single statement; the mock-pg unit
    // test asserts the first init query is this DDL (and the second is the
    // delivery-context hydration query below).
    await this.pool.query(INIT_SQL);

    this.submissions = new PostgresSubmissionStorage(this.pool);
    this.events = new PostgresEventStore(this.pool);
    const deliveries = new PostgresDeliveryQueue(this.pool);
    // Rehydrate delivery retry contexts from the durable outbox so getContext()
    // works for pending deliveries after a restart (mirrors SqliteDeliveryQueue).
    await deliveries.hydrateContexts();
    this.deliveries = deliveries;
  }

  async transaction<T>(
    fn: (tx: StorageTransaction) => Promise<T>
  ): Promise<T> {
    if (!this.pool) {
      throw new Error("PostgresStorage not initialized");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tx: StorageTransaction = {
        submissions: new PostgresSubmissionStorage(client),
        events: new PostgresEventStore(client),
        // NOTE: this is a throwaway per-transaction PostgresDeliveryQueue. Its
        // in-memory context cache is NOT the one on storage.deliveries, so a
        // context enqueued via tx.deliveries.enqueue would be cached here and
        // lost when the tx ends (getContext on storage.deliveries would miss
        // it). No code enqueues via tx.deliveries today; if you wire that up,
        // hydrate/propagate the context to storage.deliveries first.
        deliveries: new PostgresDeliveryQueue(client),
      };
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      // Roll back in its own try/catch so a ROLLBACK failure can't replace the
      // original error that caused us to abort — that error is what we rethrow.
      try {
        await client.query("ROLLBACK");
      } catch {
        // swallow rollback error; preserve the original err below
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      if (!this.pool) {
        return { ok: false, latencyMs: Date.now() - start };
      }
      await this.pool.query("SELECT 1");
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}
