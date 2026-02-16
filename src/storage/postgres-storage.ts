/**
 * PostgresStorage — PostgreSQL-based implementation of FormBridgeStorage.
 *
 * Uses `pg` (node-postgres) with connection pooling for multi-replica HA deployments.
 * This is an optional peer dependency — users must install `pg` separately.
 *
 * Tables:
 * - submissions: id (UUID), intake_id, state, resume_token, data (JSONB), ...
 * - events: event_id (UUID), type, submission_id, ts (TIMESTAMPTZ), actor (JSONB), ...
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
} from "../types/intake-contract.js";
import type { EventStore, EventFilters, EventStoreStats } from "../core/event-store.js";
import { EventId, SubmissionId } from "../types/branded.js";
import type { StorageBackend } from "./storage-backend.js";
import type {
  FormBridgeStorage,
  SubmissionStorage,
  SubmissionFilter,
  PaginatedResult,
  PaginationOptions,
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

interface PgPool {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  end(): Promise<void>;
}

interface PgPoolConstructor {
  new (config: { connectionString: string; max?: number; idleTimeoutMillis?: number }): PgPool;
}

// =============================================================================
// § PostgreSQL Submission Storage
// =============================================================================

class PostgresSubmissionStorage implements SubmissionStorage {
  constructor(private pool: PgPool) {}

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
      `INSERT INTO submissions (id, intake_id, state, resume_token, idempotency_key, created_at, updated_at, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         intake_id = EXCLUDED.intake_id,
         state = EXCLUDED.state,
         resume_token = EXCLUDED.resume_token,
         idempotency_key = EXCLUDED.idempotency_key,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at,
         data = EXCLUDED.data`,
      [
        submission.id,
        submission.intakeId,
        submission.state,
        submission.resumeToken,
        submission.idempotencyKey ?? null,
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
}

// =============================================================================
// § PostgreSQL Event Store
// =============================================================================

class PostgresEventStore implements EventStore {
  constructor(private pool: PgPool) {}

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
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
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
  event_id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  submission_id UUID NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL,
  actor JSONB NOT NULL,
  state TEXT NOT NULL,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_submission_id ON events(submission_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
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

    // Run migration
    await this.pool.query(INIT_SQL);

    this.submissions = new PostgresSubmissionStorage(this.pool);
    this.events = new PostgresEventStore(this.pool);
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
