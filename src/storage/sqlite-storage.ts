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
} from "../types/intake-contract.js";
import type { EventStore, EventFilters, EventStoreStats } from "../core/event-store.js";
import type { StorageBackend } from "./storage-backend.js";
import type {
  FormBridgeStorage,
  SubmissionStorage,
  SubmissionFilter,
  PaginatedResult,
  PaginationOptions,
} from "./storage-interface.js";

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
      .get(id) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  async getByResumeToken(token: string): Promise<Submission | null> {
    const row = this.db
      .prepare("SELECT data FROM submissions WHERE resumeToken = ?")
      .get(token) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    const row = this.db
      .prepare("SELECT data FROM submissions WHERE idempotencyKey = ?")
      .get(key) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  async save(submission: Submission): Promise<void> {
    const data = JSON.stringify(submission);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO submissions (id, intakeId, state, resumeToken, idempotencyKey, createdAt, updatedAt, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        submission.id,
        submission.intakeId,
        submission.state,
        submission.resumeToken,
        submission.idempotencyKey ?? null,
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
      .get(...params) as { count: number };
    const total = countRow.count;

    // Paginate
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;

    const rows = this.db
      .prepare(
        `SELECT data FROM submissions ${whereStr} ORDER BY createdAt DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as { data: string }[];

    const items = rows.map((row) => JSON.parse(row.data) as Submission);

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
      .all() as { submissionId: string; maxVersion: number }[];
    for (const row of rows) {
      this.versionCounters.set(row.submissionId, row.maxVersion);
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

    if (filters?.offset) {
      sql += ` OFFSET ${filters.offset}`;
    }
    if (filters?.limit !== undefined) {
      // Need to add LIMIT before OFFSET for proper SQL
      const limitClause = ` LIMIT ${filters.limit}`;
      if (filters?.offset) {
        sql = `SELECT * FROM events ${whereStr} ORDER BY ts ASC LIMIT ${filters.limit} OFFSET ${filters.offset}`;
      } else {
        sql += limitClause;
      }
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      eventId: string;
      type: string;
      submissionId: string;
      ts: string;
      version: number;
      actor: string;
      state: string;
      payload: string | null;
    }>;

    return rows.map((row) => ({
      eventId: row.eventId,
      type: row.type as IntakeEventType,
      submissionId: row.submissionId,
      ts: row.ts,
      version: row.version,
      actor: JSON.parse(row.actor) as Actor,
      state: row.state as import("../types/intake-contract.js").SubmissionState,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
    }));
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
      .get() as {
      totalEvents: number;
      submissionCount: number;
      oldestEvent: string | null;
      newestEvent: string | null;
    };

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
  submissions: SubmissionStorage;
  events: EventStore;
  files: StorageBackend;
  private db: Database | null = null;
  private dbPath: string;

  constructor(options: SqliteStorageOptions) {
    this.dbPath = options.dbPath;

    // Initialize with placeholder — real init happens in initialize()
    this.submissions = null as any;
    this.events = null as any;
    this.files = options.fileStorage ?? new NoopStorageBackend();
  }

  async initialize(): Promise<void> {
    // Dynamic import of better-sqlite3 (optional peer dependency)
    let BetterSqlite3: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      BetterSqlite3 = (await import("better-sqlite3" as string)).default;
    } catch {
      throw new Error(
        "better-sqlite3 is required for SqliteStorage. Install it: npm install better-sqlite3"
      );
    }

    this.db = new BetterSqlite3(this.dbPath) as unknown as Database;
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        intakeId TEXT NOT NULL,
        state TEXT NOT NULL,
        resumeToken TEXT NOT NULL,
        idempotencyKey TEXT,
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
    `);

    this.submissions = new SqliteSubmissionStorage(this.db);
    this.events = new SqliteEventStore(this.db);
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
