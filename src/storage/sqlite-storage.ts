/**
 * SqliteStorage — SQLite-based implementation of FormBridgeStorage.
 *
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 * This is an optional peer dependency — users must install better-sqlite3 separately.
 *
 * Tables:
 * - submissions: id, intakeId, state, resumeToken, fields (JSON), ...
 * - events: eventId, type, submissionId, ts, actor (JSON), ...
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
// § Runtime type guards for SQL row narrowing
// =============================================================================

/** Type guard for plain record objects */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Type guard for SQL rows with a 'data' column */
function isDataRow(row: unknown): row is { data: string } {
  return row != null && typeof row === 'object' && 'data' in row && typeof row.data === 'string';
}

/** Type guard for SQL COUNT(*) result rows */
function isCountRow(row: unknown): row is { count: number } {
  return row != null && typeof row === 'object' && 'count' in row && typeof row.count === 'number';
}

/** Type guard for version counter rows from GROUP BY query */
function isVersionRow(row: unknown): row is { submissionId: string; maxVersion: number } {
  return (
    row != null && typeof row === 'object' &&
    'submissionId' in row && typeof row.submissionId === 'string' &&
    'maxVersion' in row && typeof row.maxVersion === 'number'
  );
}

/** Type guard for event rows from the events table */
interface EventRow {
  eventId: string;
  type: string;
  submissionId: string;
  ts: string;
  version: number;
  actor: string;
  state: string;
  payload: string | null;
}

function isEventRow(row: unknown): row is EventRow {
  return (
    row != null && typeof row === 'object' &&
    'eventId' in row && typeof row.eventId === 'string' &&
    'type' in row && typeof row.type === 'string' &&
    'submissionId' in row && typeof row.submissionId === 'string' &&
    'ts' in row && typeof row.ts === 'string' &&
    'version' in row && typeof row.version === 'number' &&
    'actor' in row && typeof row.actor === 'string' &&
    'state' in row && typeof row.state === 'string'
  );
}

/** Type guard for stats aggregate rows */
interface StatsRow {
  totalEvents: number;
  submissionCount: number;
  oldestEvent: string | null;
  newestEvent: string | null;
}

function isStatsRow(row: unknown): row is StatsRow {
  return (
    row != null && typeof row === 'object' &&
    'totalEvents' in row && typeof row.totalEvents === 'number' &&
    'submissionCount' in row && typeof row.submissionCount === 'number' &&
    'oldestEvent' in row &&
    'newestEvent' in row
  );
}

/** Type guard for Actor parsed from JSON */
function isActor(value: unknown): value is Actor {
  return (
    value != null && typeof value === 'object' &&
    'kind' in value && typeof value.kind === 'string' &&
    'id' in value && typeof value.id === 'string'
  );
}

/** Type guard for Submission parsed from JSON (minimal shape check) */
function isSubmissionShape(value: unknown): value is Submission {
  return (
    value != null && typeof value === 'object' &&
    'id' in value && typeof value.id === 'string' &&
    'intakeId' in value && typeof value.intakeId === 'string' &&
    'state' in value && typeof value.state === 'string'
  );
}

// Valid SubmissionState values for runtime validation
const VALID_SUBMISSION_STATES = new Set<string>([
  "draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted",
  "needs_review", "approved", "rejected", "finalized", "cancelled", "expired",
  "created", "validating", "invalid", "valid", "uploading", "submitting",
  "completed", "failed", "pending_approval",
]);

function isSubmissionState(value: string): value is import("../types/intake-contract.js").SubmissionState {
  return VALID_SUBMISSION_STATES.has(value);
}

// Valid IntakeEventType values for runtime validation
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
// § Types for better-sqlite3 (optional dependency)
// =============================================================================

interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  close(): void;
  pragma(key: string, value?: unknown): unknown;
}

interface Statement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

// =============================================================================
// § SQLite Submission Storage
// =============================================================================

class SqliteSubmissionStorage implements SubmissionStorage {
  constructor(private db: Database) {}

  async get(id: string): Promise<Submission | null> {
    const row = this.db
      .prepare("SELECT data FROM submissions WHERE id = ?")
      .get(id);
    if (!isDataRow(row)) return null;
    const parsed: unknown = JSON.parse(row.data);
    return isSubmissionShape(parsed) ? parsed : null;
  }

  async getByResumeToken(token: string): Promise<Submission | null> {
    const row = this.db
      .prepare("SELECT data FROM submissions WHERE resumeToken = ?")
      .get(token);
    if (!isDataRow(row)) return null;
    const parsed: unknown = JSON.parse(row.data);
    return isSubmissionShape(parsed) ? parsed : null;
  }

  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    const row = this.db
      .prepare("SELECT data FROM submissions WHERE idempotencyKey = ?")
      .get(key);
    if (!isDataRow(row)) return null;
    const parsed: unknown = JSON.parse(row.data);
    return isSubmissionShape(parsed) ? parsed : null;
  }

  async save(submission: Submission): Promise<void> {
    const data = JSON.stringify(submission);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO submissions
           (id, intakeId, state, resumeToken, idempotencyKey, tenant_id, expires_at, destination_delivered_at, createdAt, updatedAt, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
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
        data
      );
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db
      .prepare("DELETE FROM submissions WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  async list(
    filter: SubmissionFilter,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Submission>> {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (filter.intakeId) {
      whereClauses.push("intakeId = ?");
      params.push(filter.intakeId);
    }
    if (filter.state) {
      whereClauses.push("state = ?");
      params.push(filter.state);
    }
    if (filter.createdAfter) {
      whereClauses.push("createdAt >= ?");
      params.push(filter.createdAfter);
    }
    if (filter.createdBefore) {
      whereClauses.push("createdAt <= ?");
      params.push(filter.createdBefore);
    }

    const whereStr =
      whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    // Count
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM submissions ${whereStr}`)
      .get(...params);
    const total = isCountRow(countRow) ? countRow.count : 0;

    // Paginate
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;

    const rawRows = this.db
      .prepare(
        `SELECT data FROM submissions ${whereStr} ORDER BY createdAt DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const items: Submission[] = [];
    for (const row of rawRows) {
      if (isDataRow(row)) {
        const parsed: unknown = JSON.parse(row.data);
        if (isSubmissionShape(parsed)) {
          items.push(parsed);
        }
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
    const rows = this.db
      .prepare(
        `SELECT data FROM submissions
         WHERE expires_at IS NOT NULL AND expires_at < ?
           AND state NOT IN ('rejected', 'finalized', 'cancelled', 'expired')`
      )
      .all(now);
    const items: Submission[] = [];
    for (const row of rows) {
      if (isDataRow(row)) {
        const parsed: unknown = JSON.parse(row.data);
        if (isSubmissionShape(parsed)) items.push(parsed);
      }
    }
    return items;
  }

  async getAll(tenantId?: string): Promise<Submission[]> {
    const rows = tenantId
      ? this.db
          .prepare(
            "SELECT data FROM submissions WHERE tenant_id IS NULL OR tenant_id = ?"
          )
          .all(tenantId)
      : this.db.prepare("SELECT data FROM submissions").all();
    const items: Submission[] = [];
    for (const row of rows) {
      if (isDataRow(row)) {
        const parsed: unknown = JSON.parse(row.data);
        if (isSubmissionShape(parsed)) items.push(parsed);
      }
    }
    return items;
  }

  async getStateCounts(): Promise<Record<string, number>> {
    const rows = this.db
      .prepare("SELECT state, COUNT(*) as count FROM submissions GROUP BY state")
      .all();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (
        row != null &&
        typeof row === "object" &&
        "state" in row &&
        typeof row.state === "string" &&
        "count" in row &&
        typeof row.count === "number"
      ) {
        counts[row.state] = row.count;
      }
    }
    return counts;
  }

  async getTotalCount(): Promise<number> {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM submissions")
      .get();
    return isCountRow(row) ? row.count : 0;
  }

  async getPendingApprovalCount(): Promise<number> {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM submissions WHERE state = 'needs_review'"
      )
      .get();
    return isCountRow(row) ? row.count : 0;
  }
}

// =============================================================================
// § SQLite Delivery Queue
// =============================================================================

/** Type guard for delivery rows from the deliveries table. */
interface DeliveryRow {
  delivery_id: string;
  submission_id: string;
  destination_url: string;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  status_code: number | null;
  error: string | null;
  created_at: string;
}

function isDeliveryRow(row: unknown): row is DeliveryRow {
  return (
    row != null &&
    typeof row === "object" &&
    "delivery_id" in row &&
    typeof row.delivery_id === "string" &&
    "submission_id" in row &&
    typeof row.submission_id === "string" &&
    "status" in row &&
    typeof row.status === "string"
  );
}

function isDeliveryStatus(value: string): value is DeliveryRecord["status"] {
  return value === "pending" || value === "succeeded" || value === "failed";
}

function rowToDeliveryRecord(row: DeliveryRow): DeliveryRecord {
  return {
    deliveryId: DeliveryId(row.delivery_id),
    submissionId: SubmissionId(row.submission_id),
    destinationUrl: row.destination_url,
    status: isDeliveryStatus(row.status) ? row.status : "pending",
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    statusCode: row.status_code ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

class SqliteDeliveryQueue implements DeliveryQueue {
  /** In-memory cache of retry contexts for synchronous getContext(). */
  private contexts = new Map<string, DeliveryContext>();

  constructor(private db: Database) {
    // Rehydrate retry contexts for non-failed deliveries (durability across restart).
    const rows = this.db
      .prepare(
        "SELECT delivery_id, context FROM deliveries WHERE context IS NOT NULL AND status <> 'failed'"
      )
      .all();
    for (const row of rows) {
      if (
        row != null &&
        typeof row === "object" &&
        "delivery_id" in row &&
        typeof row.delivery_id === "string" &&
        "context" in row &&
        typeof row.context === "string"
      ) {
        try {
          const ctx: unknown = JSON.parse(row.context);
          if (ctx != null && typeof ctx === "object") {
            this.contexts.set(row.delivery_id, ctx as DeliveryContext);
          }
        } catch {
          // ignore malformed context
        }
      }
    }
  }

  async enqueue(record: DeliveryRecord, context?: DeliveryContext): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO deliveries
           (delivery_id, submission_id, destination_url, status, attempts, last_attempt_at, next_retry_at, status_code, error, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
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
        record.createdAt
      );
    if (context) {
      this.contexts.set(record.deliveryId, context);
    }
  }

  getContext(deliveryId: string): DeliveryContext | undefined {
    return this.contexts.get(deliveryId);
  }

  async get(deliveryId: string): Promise<DeliveryRecord | null> {
    const row = this.db
      .prepare("SELECT * FROM deliveries WHERE delivery_id = ?")
      .get(deliveryId);
    return isDeliveryRow(row) ? rowToDeliveryRecord(row) : null;
  }

  async getBySubmission(submissionId: string): Promise<DeliveryRecord[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM deliveries WHERE submission_id = ? ORDER BY created_at ASC"
      )
      .all(submissionId);
    const records: DeliveryRecord[] = [];
    for (const row of rows) {
      if (isDeliveryRow(row)) records.push(rowToDeliveryRecord(row));
    }
    return records;
  }

  async update(record: DeliveryRecord): Promise<void> {
    const result = this.db
      .prepare(
        `UPDATE deliveries SET
           submission_id = ?, destination_url = ?, status = ?, attempts = ?,
           last_attempt_at = ?, next_retry_at = ?, status_code = ?, error = ?
         WHERE delivery_id = ?`
      )
      .run(
        record.submissionId,
        record.destinationUrl,
        record.status,
        record.attempts,
        record.lastAttemptAt ?? null,
        record.nextRetryAt ?? null,
        record.statusCode ?? null,
        record.error ?? null,
        record.deliveryId
      );
    if (result.changes === 0) {
      throw new Error(`Delivery not found: ${record.deliveryId}`);
    }
  }

  async getPendingRetries(): Promise<DeliveryRecord[]> {
    const now = new Date().toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM deliveries
         WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)
         ORDER BY created_at ASC`
      )
      .all(now);
    const records: DeliveryRecord[] = [];
    for (const row of rows) {
      if (isDeliveryRow(row)) records.push(rowToDeliveryRecord(row));
    }
    return records;
  }

  async getStats(): Promise<DeliveryQueueStats> {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) as count FROM deliveries GROUP BY status")
      .all();
    const stats: DeliveryQueueStats = {
      total: 0,
      pending: 0,
      succeeded: 0,
      failed: 0,
    };
    for (const row of rows) {
      if (
        row != null &&
        typeof row === "object" &&
        "status" in row &&
        typeof row.status === "string" &&
        "count" in row &&
        typeof row.count === "number"
      ) {
        stats.total += row.count;
        if (row.status === "pending") stats.pending = row.count;
        else if (row.status === "succeeded") stats.succeeded = row.count;
        else if (row.status === "failed") stats.failed = row.count;
      }
    }
    return stats;
  }
}

// =============================================================================
// § SQLite Event Store
// =============================================================================

class SqliteEventStore implements EventStore {
  private versionCounters = new Map<string, number>();

  constructor(private db: Database) {
    // Load version counters from existing data
    const rows = this.db
      .prepare(
        "SELECT submissionId, MAX(version) as maxVersion FROM events GROUP BY submissionId"
      )
      .all();
    for (const row of rows) {
      if (isVersionRow(row)) {
        this.versionCounters.set(row.submissionId, row.maxVersion);
      }
    }
  }

  async appendEvent(event: IntakeEvent): Promise<void> {
    // Check duplicate
    const existing = this.db
      .prepare("SELECT eventId FROM events WHERE eventId = ?")
      .get(event.eventId);
    if (existing) {
      throw new Error(`Duplicate eventId: ${event.eventId}`);
    }

    // Assign version
    const currentVersion =
      this.versionCounters.get(event.submissionId) ?? 0;
    const nextVersion = currentVersion + 1;
    event.version = nextVersion;
    this.versionCounters.set(event.submissionId, nextVersion);

    this.db
      .prepare(
        `INSERT INTO events (eventId, type, submissionId, ts, version, actor, state, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.eventId,
        event.type,
        event.submissionId,
        event.ts,
        nextVersion,
        JSON.stringify(event.actor),
        event.state,
        event.payload ? JSON.stringify(event.payload) : null
      );
  }

  async getEvents(
    submissionId: string,
    filters?: EventFilters
  ): Promise<IntakeEvent[]> {
    const whereClauses = ["submissionId = ?"];
    const params: unknown[] = [submissionId];

    if (filters?.types && filters.types.length > 0) {
      const placeholders = filters.types.map(() => "?").join(",");
      whereClauses.push(`type IN (${placeholders})`);
      params.push(...filters.types);
    }
    if (filters?.actorKind) {
      whereClauses.push(
        "json_extract(actor, '$.kind') = ?"
      );
      params.push(filters.actorKind);
    }
    if (filters?.since) {
      whereClauses.push("ts >= ?");
      params.push(filters.since);
    }
    if (filters?.until) {
      whereClauses.push("ts <= ?");
      params.push(filters.until);
    }

    const whereStr = "WHERE " + whereClauses.join(" AND ");
    let sql = `SELECT * FROM events ${whereStr} ORDER BY ts ASC`;

    if (filters?.limit !== undefined) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    } else if (filters?.offset) {
      // OFFSET requires LIMIT in SQLite — use -1 for unlimited
      sql += ` LIMIT -1 OFFSET ?`;
      params.push(filters.offset);
    }

    const rawRows = this.db.prepare(sql).all(...params);
    return this.mapEventRows(rawRows);
  }

  /**
   * Map raw event rows to IntakeEvent[], skipping any row that fails validation.
   * Shared by getEvents and the analytics helpers below.
   */
  private mapEventRows(rawRows: unknown[]): IntakeEvent[] {
    const events: IntakeEvent[] = [];
    for (const row of rawRows) {
      if (!isEventRow(row)) continue;

      const parsedActor: unknown = JSON.parse(row.actor);
      if (!isActor(parsedActor)) continue;
      if (!isIntakeEventType(row.type)) continue;
      if (!isSubmissionState(row.state)) continue;

      let payload: Record<string, unknown> | undefined;
      if (row.payload) {
        const p: unknown = JSON.parse(row.payload);
        payload = isRecord(p) ? p : undefined;
      }

      events.push({
        eventId: EventId(row.eventId),
        type: row.type,
        submissionId: SubmissionId(row.submissionId),
        ts: row.ts,
        version: row.version,
        actor: parsedActor,
        state: row.state,
        payload,
      });
    }
    return events;
  }

  /**
   * Get the most recent events across all submissions (newest first).
   * Analytics helper — signature mirrors InMemoryEventStore so app.ts
   * feature-detection wires /analytics/summary recentActivity automatically.
   */
  getRecentEventsAll(limit: number): IntakeEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY ts DESC LIMIT ?")
      .all(limit);
    return this.mapEventRows(rows);
  }

  /**
   * Get all events of a given type (chronological order).
   * Analytics helper — signature mirrors InMemoryEventStore so app.ts
   * feature-detection wires /analytics/volume automatically.
   */
  getEventsByTypeAll(type: string): IntakeEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE type = ? ORDER BY ts ASC")
      .all(type);
    return this.mapEventRows(rows);
  }

  async countEvents(
    submissionId: string,
    filters?: EventFilters
  ): Promise<number> {
    const whereClauses = ["submissionId = ?"];
    const params: unknown[] = [submissionId];

    if (filters?.types && filters.types.length > 0) {
      const placeholders = filters.types.map(() => "?").join(",");
      whereClauses.push(`type IN (${placeholders})`);
      params.push(...filters.types);
    }
    if (filters?.actorKind) {
      whereClauses.push("json_extract(actor, '$.kind') = ?");
      params.push(filters.actorKind);
    }
    if (filters?.since) {
      whereClauses.push("ts >= ?");
      params.push(filters.since);
    }
    if (filters?.until) {
      whereClauses.push("ts <= ?");
      params.push(filters.until);
    }

    const whereStr = "WHERE " + whereClauses.join(" AND ");
    const sql = `SELECT COUNT(*) as cnt FROM events ${whereStr}`;

    const row = this.db.prepare(sql).get(...params) as
      | { cnt: number }
      | undefined;
    return row?.cnt ?? 0;
  }

  async getStats(): Promise<EventStoreStats> {
    const statsRow = this.db
      .prepare(
        `SELECT
          COUNT(*) as totalEvents,
          COUNT(DISTINCT submissionId) as submissionCount,
          MIN(ts) as oldestEvent,
          MAX(ts) as newestEvent
        FROM events`
      )
      .get();

    if (!isStatsRow(statsRow)) {
      return { totalEvents: 0, submissionCount: 0 };
    }

    return {
      totalEvents: statsRow.totalEvents,
      submissionCount: statsRow.submissionCount,
      oldestEvent: statsRow.oldestEvent ?? undefined,
      newestEvent: statsRow.newestEvent ?? undefined,
    };
  }

  async cleanupOld(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const result = this.db
      .prepare("DELETE FROM events WHERE ts < ?")
      .run(cutoff);
    return result.changes;
  }
}

// =============================================================================
// § No-Op File Storage
// =============================================================================

class NoopStorageBackend implements StorageBackend {
  async generateUploadUrl(): Promise<never> {
    throw new Error("File storage not configured for SQLite backend");
  }
  async verifyUpload(): Promise<never> {
    throw new Error("File storage not configured for SQLite backend");
  }
  async getUploadMetadata(): Promise<undefined> {
    throw new Error("File storage not configured for SQLite backend");
  }
  async generateDownloadUrl(): Promise<undefined> {
    throw new Error("File storage not configured for SQLite backend");
  }
  async deleteUpload(): Promise<boolean> {
    throw new Error("File storage not configured for SQLite backend");
  }
  async cleanupExpired(): Promise<void> {
    throw new Error("File storage not configured for SQLite backend");
  }
}

// =============================================================================
// § SqliteStorage — Unified SQLite Storage
// =============================================================================

export interface SqliteStorageOptions {
  /** Path to SQLite database file (or :memory: for in-memory) */
  dbPath: string;
  /** Optional file storage backend */
  fileStorage?: StorageBackend;
}

export class SqliteStorage implements FormBridgeStorage {
  submissions!: SubmissionStorage;
  events!: EventStore;
  deliveries!: DeliveryQueue;
  files: StorageBackend;
  private db: Database | null = null;
  private dbPath: string;

  constructor(options: SqliteStorageOptions) {
    this.dbPath = options.dbPath;
    this.files = options.fileStorage ?? new NoopStorageBackend();
  }

  async initialize(): Promise<void> {
    // Dynamic import of better-sqlite3 (optional peer dependency)
    let BetterSqlite3: new (path: string) => Database;
    try {
      const mod: { default?: unknown } = await import("better-sqlite3" as string);
      if (typeof mod.default !== 'function') {
        throw new Error("better-sqlite3 default export is not a constructor");
      }
      BetterSqlite3 = mod.default as new (path: string) => Database;
    } catch (err) {
      if (err instanceof Error && err.message.includes("default export")) {
        throw err;
      }
      throw new Error(
        "better-sqlite3 is required for SqliteStorage. Install it: npm install better-sqlite3"
      );
    }

    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    // Create tables (idempotent). initialize() is the source of truth for the
    // schema; migrations/*.sql mirror this for reference.
    //
    // Ordering matters: the tenant_id / expires_at indexes are created in a
    // SECOND exec below, AFTER addColumnIfMissing() has ensured those columns
    // exist. On a pre-existing on-disk DB, `CREATE TABLE IF NOT EXISTS` is a
    // no-op, so the durable-storage columns are absent until the ALTER runs —
    // creating an index that references them here would fail with
    // "no such column: tenant_id". (Postgres INIT_SQL has the same ordering.)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        intakeId TEXT NOT NULL,
        state TEXT NOT NULL,
        resumeToken TEXT NOT NULL,
        idempotencyKey TEXT,
        tenant_id TEXT,
        expires_at TEXT,
        destination_delivered_at TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_submissions_intakeId ON submissions(intakeId);
      CREATE INDEX IF NOT EXISTS idx_submissions_state ON submissions(state);
      CREATE INDEX IF NOT EXISTS idx_submissions_resumeToken ON submissions(resumeToken);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_idempotencyKey ON submissions(idempotencyKey) WHERE idempotencyKey IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_submissions_createdAt ON submissions(createdAt);

      CREATE TABLE IF NOT EXISTS events (
        eventId TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        submissionId TEXT NOT NULL,
        ts TEXT NOT NULL,
        version INTEGER NOT NULL,
        actor TEXT NOT NULL,
        state TEXT NOT NULL,
        payload TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_submissionId ON events(submissionId);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

      CREATE TABLE IF NOT EXISTS deliveries (
        delivery_id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        destination_url TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        next_retry_at TEXT,
        status_code INTEGER,
        error TEXT,
        context TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_deliveries_status_next_retry ON deliveries(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_deliveries_submission_id ON deliveries(submission_id);
      -- Deliberately NO unique guard on (submission_id, destination_url):
      -- repeat deliveries to the same destination are legitimate (e.g. reviewer
      -- notifications). Deliveries are keyed by delivery_id (PK), which enqueue
      -- mints fresh each time, so there is no conflict. Drop the old partial
      -- unique index if a pre-existing DB still carries it — it deleted in-flight
      -- rows via INSERT OR REPLACE, causing "Delivery not found" error loops.
      DROP INDEX IF EXISTS idx_deliveries_submission_dest;
    `);

    // Idempotent column additions for pre-existing databases created before
    // the durable-storage columns landed. SQLite lacks ADD COLUMN IF NOT EXISTS,
    // so guard via pragma table_info. These MUST run before any CREATE INDEX
    // that references the new columns (see the second exec, below).
    this.addColumnIfMissing("submissions", "tenant_id", "TEXT");
    this.addColumnIfMissing("submissions", "expires_at", "TEXT");
    this.addColumnIfMissing("submissions", "destination_delivered_at", "TEXT");

    // Indexes on the newly-ensured columns. Safe now that the ALTER TABLE ADD
    // COLUMN calls above guarantee tenant_id / expires_at exist.
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_submissions_tenant_id ON submissions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_expires_at ON submissions(expires_at);
    `);

    this.db
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      )
      .run("002_durable_storage", new Date().toISOString());

    this.submissions = new SqliteSubmissionStorage(this.db);
    this.events = new SqliteEventStore(this.db);
    this.deliveries = new SqliteDeliveryQueue(this.db);
  }

  /** Add a column to a table only when it does not already exist. */
  private addColumnIfMissing(table: string, column: string, type: string): void {
    if (!this.db) return;
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = cols.some(
      (c) =>
        c != null &&
        typeof c === "object" &&
        "name" in c &&
        (c as { name: unknown }).name === column
    );
    if (!exists) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }

  private txChain: Promise<unknown> = Promise.resolve();

  async transaction<T>(
    fn: (tx: StorageTransaction) => Promise<T>
  ): Promise<T> {
    // Serialize transactions. SQLite is single-writer, and an `await` inside the
    // callback yields the event loop — so two concurrent transactions on the one
    // connection would issue nested BEGINs ("cannot start a transaction within a
    // transaction"). Chain each transaction after the previous one settles.
    const run = this.txChain.then(() => this.runTransaction(fn));
    this.txChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async runTransaction<T>(
    fn: (tx: StorageTransaction) => Promise<T>
  ): Promise<T> {
    if (!this.db) {
      throw new Error("SqliteStorage not initialized");
    }
    const db = this.db;
    // better-sqlite3's db.transaction() rejects async callbacks; our store
    // methods are async (over synchronous work), so drive BEGIN/COMMIT/ROLLBACK
    // explicitly. Serialization is guaranteed by transaction() above.
    db.exec("BEGIN");
    try {
      const result = await fn({
        submissions: this.submissions,
        events: this.events,
        deliveries: this.deliveries,
      });
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      if (!this.db) {
        return { ok: false, latencyMs: Date.now() - start };
      }
      this.db.prepare("SELECT 1").get();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}
