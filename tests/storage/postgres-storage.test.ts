/**
 * PostgresStorage Unit Tests
 *
 * Tests PostgresStorage using a mock pg Pool (no real Postgres required).
 * Validates SQL generation, parameter binding, and data mapping.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg module before importing PostgresStorage
const mockQuery = vi.fn();
const mockEnd = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock("pg", () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
      end = mockEnd;
      connect = mockConnect;
    },
  },
  Pool: class MockPool {
    query = mockQuery;
    end = mockEnd;
    connect = mockConnect;
  },
}));

import { PostgresStorage } from "../../src/storage/postgres-storage";
import type { Submission } from "../../src/submission-types";
import type { Actor, IntakeEvent } from "../../src/types/intake-contract";

const testActor: Actor = { kind: "agent", id: "agent-1", name: "Test Agent" };

function createTestSubmission(id: string, intakeId = "intake_test"): Submission {
  const now = new Date().toISOString();
  return {
    id,
    intakeId,
    state: "draft",
    resumeToken: `rtok_${id}`,
    createdAt: now,
    updatedAt: now,
    fields: { name: "Test" },
    fieldAttribution: { name: testActor },
    createdBy: testActor,
    updatedBy: testActor,
    events: [],
  };
}

describe("PostgresStorage", () => {
  let storage: PostgresStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Mock the init migration query
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    // Transaction path checks out a client that shares the query mock.
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
    storage = new PostgresStorage({
      connectionString: "postgresql://test:test@localhost:5432/testdb",
    });
    await storage.initialize();
  });

  describe("initialize", () => {
    it("should run migration SQL then hydrate delivery contexts on initialize", () => {
      // initialize() issues exactly two queries: the DDL migration, then the
      // delivery-context hydration SELECT (FIX 3 — restart durability).
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS submissions");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS events");

      const hydrateSql = mockQuery.mock.calls[1][0] as string;
      expect(hydrateSql).toContain("SELECT delivery_id, context FROM deliveries");
      expect(hydrateSql).toContain("status <> 'failed'");
    });

    it("hydrates pending delivery contexts from the outbox (restart durability)", async () => {
      vi.clearAllMocks();
      const ctx = {
        submission: {
          id: "sub_pending",
          intakeId: "intake_x",
          state: "submitted",
          fields: {},
          fieldAttribution: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: { kind: "agent" as const, id: "a1" },
        },
        destination: { kind: "webhook", url: "https://e/x" },
      };
      // Call 1: DDL. Call 2: hydration SELECT returns a pending delivery + context.
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ delivery_id: "dlv_pending", context: ctx }],
          rowCount: 1,
        });

      const s = new PostgresStorage({
        connectionString: "postgresql://test:test@localhost:5432/testdb",
      });
      await s.initialize();

      // The freshly-constructed store returns a non-undefined context for the
      // pending delivery, synchronously — the webhook retry loop can proceed.
      expect(s.deliveries.getContext?.("dlv_pending")).toEqual(ctx);
    });

    // Regression guard: FormBridge generates prefixed string ids (sub_<uuid>,
    // evt_<uuid>) which are NOT valid PostgreSQL UUIDs. If these columns are
    // declared UUID, every real insert fails at runtime. The mocked pg pool
    // can't catch that, so assert the schema declares them as TEXT.
    // (A real-Postgres insert was verified manually; see fix report.)
    it("should declare id/foreign-key columns as TEXT, not UUID", () => {
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/id TEXT PRIMARY KEY/);
      expect(sql).toMatch(/event_id TEXT PRIMARY KEY/);
      expect(sql).toMatch(/submission_id TEXT NOT NULL/);
      expect(sql).not.toMatch(/UUID/i);
    });
  });

  describe("healthCheck", () => {
    it("should return ok: true when SELECT 1 succeeds", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 });
      const result = await storage.healthCheck();
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should return ok: false when query fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection refused"));
      const result = await storage.healthCheck();
      expect(result.ok).toBe(false);
    });
  });

  describe("close", () => {
    it("should call pool.end()", async () => {
      mockEnd.mockResolvedValueOnce(undefined);
      await storage.close();
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe("submissions", () => {
    it("should get a submission by id", async () => {
      const sub = createTestSubmission("sub-1");
      mockQuery.mockResolvedValueOnce({ rows: [{ data: sub }], rowCount: 1 });

      const result = await storage.submissions.get("sub-1");
      expect(result).toBeTruthy();
      expect(result?.id).toBe("sub-1");

      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("SELECT data FROM submissions WHERE id = $1");
      expect(call[1]).toEqual(["sub-1"]);
    });

    it("should return null for missing submission", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.submissions.get("missing");
      expect(result).toBeNull();
    });

    it("should save a submission with upsert", async () => {
      const sub = createTestSubmission("sub-2");
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await storage.submissions.save(sub);

      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("INSERT INTO submissions");
      expect(call[0]).toContain("ON CONFLICT (id) DO UPDATE");
      expect(call[1][0]).toBe("sub-2");
    });

    it("should delete a submission", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.submissions.delete("sub-1");
      expect(result).toBe(true);
    });

    it("should return false when deleting non-existent submission", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.submissions.delete("missing");
      expect(result).toBe(false);
    });

    it("should get by resume token", async () => {
      const sub = createTestSubmission("sub-3");
      mockQuery.mockResolvedValueOnce({ rows: [{ data: sub }], rowCount: 1 });

      const result = await storage.submissions.getByResumeToken("rtok_sub-3");
      expect(result?.id).toBe("sub-3");

      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("resume_token = $1");
    });

    it("should list with filters and pagination", async () => {
      const sub = createTestSubmission("sub-4");
      // Count query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 });
      // Data query
      mockQuery.mockResolvedValueOnce({ rows: [{ data: sub }], rowCount: 1 });

      const result = await storage.submissions.list(
        { intakeId: "intake_test", state: "draft" },
        { limit: 10, offset: 0 }
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);

      // Count query should have filters
      const countCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 2];
      expect(countCall[0]).toContain("intake_id = $1");
      expect(countCall[0]).toContain("state = $2");
    });
  });

  describe("events", () => {
    it("should append an event with auto-versioning", async () => {
      // Version query
      mockQuery.mockResolvedValueOnce({ rows: [{ next_version: 1 }], rowCount: 1 });
      // Insert query
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event: IntakeEvent = {
        eventId: "evt-1",
        type: "submission.created",
        submissionId: "sub-1",
        ts: new Date().toISOString(),
        actor: testActor,
        state: "draft",
        payload: { test: true },
      };

      await storage.events.appendEvent(event);
      expect(event.version).toBe(1);

      const insertCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(insertCall[0]).toContain("INSERT INTO events");
    });

    it("should throw on duplicate eventId", async () => {
      // Version query
      mockQuery.mockResolvedValueOnce({ rows: [{ next_version: 1 }], rowCount: 1 });
      // Insert fails with duplicate key
      mockQuery.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

      const event: IntakeEvent = {
        eventId: "evt-dup",
        type: "submission.created",
        submissionId: "sub-1",
        ts: new Date().toISOString(),
        actor: testActor,
        state: "draft",
      };

      await expect(storage.events.appendEvent(event)).rejects.toThrow("Duplicate eventId");
    });

    it("should get events with filters", async () => {
      const ts = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          event_id: "evt-1",
          type: "submission.created",
          submission_id: "sub-1",
          ts,
          version: 1,
          actor: testActor,
          state: "draft",
          payload: null,
        }],
        rowCount: 1,
      });

      const events = await storage.events.getEvents("sub-1", {
        types: ["submission.created"],
      });

      expect(events).toHaveLength(1);
      expect(events[0].eventId).toBe("evt-1");

      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("submission_id = $1");
      expect(call[0]).toContain("type IN ($2)");
    });

    it("should get stats", async () => {
      const oldest = new Date("2024-01-01").toISOString();
      const newest = new Date("2024-06-01").toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          totalEvents: 42,
          submissionCount: 5,
          oldestEvent: oldest,
          newestEvent: newest,
        }],
        rowCount: 1,
      });

      const stats = await storage.events.getStats();
      expect(stats.totalEvents).toBe(42);
      expect(stats.submissionCount).toBe(5);
    });

    it("should cleanup old events", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 10 });
      const deleted = await storage.events.cleanupOld(86400000);
      expect(deleted).toBe(10);

      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("DELETE FROM events WHERE ts < $1");
    });

    it("should count events", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 7 }], rowCount: 1 });
      const count = await storage.events.countEvents("sub-1");
      expect(count).toBe(7);
    });

    // FIX 4: analytics helpers so /analytics is not empty on the durable backend.
    it("getRecentEventsAll selects newest-first and maps rows", async () => {
      const ts = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            event_id: "evt-r",
            type: "submission.created",
            submission_id: "sub-1",
            ts,
            version: 1,
            actor: testActor,
            state: "draft",
            payload: null,
          },
        ],
        rowCount: 1,
      });
      const es = storage.events as unknown as {
        getRecentEventsAll(limit: number): Promise<IntakeEvent[]>;
      };
      const recent = await es.getRecentEventsAll(20);
      expect(recent).toHaveLength(1);
      expect(recent[0].eventId).toBe("evt-r");
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("ORDER BY ts DESC LIMIT $1");
      expect(call[1]).toEqual([20]);
    });

    it("getEventsByTypeAll filters on type and maps rows", async () => {
      const ts = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            event_id: "evt-t",
            type: "submission.created",
            submission_id: "sub-1",
            ts,
            version: 1,
            actor: testActor,
            state: "draft",
            payload: null,
          },
        ],
        rowCount: 1,
      });
      const es = storage.events as unknown as {
        getEventsByTypeAll(type: string): Promise<IntakeEvent[]>;
      };
      const byType = await es.getEventsByTypeAll("submission.created");
      expect(byType.map((e) => e.eventId)).toEqual(["evt-t"]);
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("WHERE type = $1");
      expect(call[1]).toEqual(["submission.created"]);
    });
  });

  describe("submissions (widened surface)", () => {
    it("save includes the new tenant/expiry/delivery columns", async () => {
      const sub = createTestSubmission("sub-cols");
      sub.tenantId = "tenant-1";
      sub.expiresAt = new Date().toISOString();
      sub.destinationDeliveredAt = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await storage.submissions.save(sub);

      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("tenant_id");
      expect(call[0]).toContain("expires_at");
      expect(call[0]).toContain("destination_delivered_at");
      expect(call[1][5]).toBe("tenant-1");
    });

    it("getTotalCount returns the counted total", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 9 }], rowCount: 1 });
      expect(await storage.submissions.getTotalCount()).toBe(9);
    });

    it("getPendingApprovalCount filters on needs_review", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 4 }], rowCount: 1 });
      expect(await storage.submissions.getPendingApprovalCount()).toBe(4);
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("state = 'needs_review'");
    });

    it("getStateCounts maps rows to a state->count record", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { state: "draft", count: 2 },
          { state: "submitted", count: 1 },
        ],
        rowCount: 2,
      });
      expect(await storage.submissions.getStateCounts()).toEqual({ draft: 2, submitted: 1 });
    });

    it("getAll without tenant selects all", async () => {
      const sub = createTestSubmission("sub-all");
      mockQuery.mockResolvedValueOnce({ rows: [{ data: sub }], rowCount: 1 });
      const all = await storage.submissions.getAll();
      expect(all).toHaveLength(1);
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("SELECT data FROM submissions");
      expect(call[0]).not.toContain("tenant_id");
    });

    it("getAll with tenant scopes the query", async () => {
      const sub = createTestSubmission("sub-t");
      mockQuery.mockResolvedValueOnce({ rows: [{ data: sub }], rowCount: 1 });
      await storage.submissions.getAll("tenant-9");
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("tenant_id IS NULL OR tenant_id = $1");
      expect(call[1]).toEqual(["tenant-9"]);
    });

    it("getExpired filters on expires_at and non-terminal state", async () => {
      const sub = createTestSubmission("sub-exp");
      mockQuery.mockResolvedValueOnce({ rows: [{ data: sub }], rowCount: 1 });
      const expired = await storage.submissions.getExpired();
      expect(expired).toHaveLength(1);
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("expires_at < $1");
      expect(call[0]).toContain("state NOT IN");
    });
  });

  describe("deliveries (durable outbox)", () => {
    it("enqueue upserts and caches context for getContext", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const ctx = {
        submission: {
          id: "sub-d",
          intakeId: "intake_x",
          state: "submitted",
          fields: {},
          fieldAttribution: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: { kind: "agent" as const, id: "a1" },
        },
        destination: { kind: "webhook", url: "https://e/x" },
      };
      await storage.deliveries.enqueue(
        {
          deliveryId: "dlv-1" as never,
          submissionId: "sub-d" as never,
          destinationUrl: "https://e/x",
          status: "pending",
          attempts: 0,
          createdAt: new Date().toISOString(),
        },
        ctx
      );
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("INSERT INTO deliveries");
      expect(call[0]).toContain("ON CONFLICT (delivery_id)");
      expect(storage.deliveries.getContext?.("dlv-1")).toEqual(ctx);
    });

    it("get maps a row to a DeliveryRecord", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "dlv-2",
            submission_id: "sub-d",
            destination_url: "https://e/x",
            status: "succeeded",
            attempts: 1,
            last_attempt_at: null,
            next_retry_at: null,
            status_code: 200,
            error: null,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });
      const rec = await storage.deliveries.get("dlv-2");
      expect(rec!.status).toBe("succeeded");
      expect(rec!.statusCode).toBe(200);
    });

    it("update throws when no row is affected", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        storage.deliveries.update({
          deliveryId: "dlv-missing" as never,
          submissionId: "sub-d" as never,
          destinationUrl: "https://e/x",
          status: "pending",
          attempts: 0,
          createdAt: new Date().toISOString(),
        })
      ).rejects.toThrow("Delivery not found");
    });

    it("getPendingRetries filters pending + due", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.deliveries.getPendingRetries();
      const call = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(call[0]).toContain("status = 'pending'");
      expect(call[0]).toContain("next_retry_at IS NULL OR next_retry_at <= $1");
    });

    it("getStats aggregates by status", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { status: "pending", count: 2 },
          { status: "failed", count: 1 },
        ],
        rowCount: 2,
      });
      const stats = await storage.deliveries.getStats();
      expect(stats).toEqual({ total: 3, pending: 2, succeeded: 0, failed: 1 });
    });
  });

  describe("transaction", () => {
    it("commits and releases the client on success", async () => {
      await storage.transaction(async (tx) => {
        await tx.submissions.save(createTestSubmission("sub-tx"));
      });
      const texts = mockQuery.mock.calls.map((c) => c[0] as string);
      expect(texts).toContain("BEGIN");
      expect(texts).toContain("COMMIT");
      expect(mockRelease).toHaveBeenCalled();
    });

    it("rolls back and releases the client on error", async () => {
      await expect(
        storage.transaction(async () => {
          throw new Error("tx boom");
        })
      ).rejects.toThrow("tx boom");
      const texts = mockQuery.mock.calls.map((c) => c[0] as string);
      expect(texts).toContain("BEGIN");
      expect(texts).toContain("ROLLBACK");
      expect(mockRelease).toHaveBeenCalled();
    });
  });
});

describe("StorageFactory", () => {
  it("should create memory storage by default", async () => {
    const { createStorageFromEnv } = await import("../../src/storage/storage-factory");
    const storage = await createStorageFromEnv({ type: "memory" });
    expect(storage).toBeTruthy();
    const health = await storage.healthCheck();
    expect(health.ok).toBe(true);
    await storage.close();
  });

  it("should throw for postgres without DATABASE_URL", async () => {
    const { createStorageFromEnv } = await import("../../src/storage/storage-factory");
    await expect(
      createStorageFromEnv({ type: "postgres" })
    ).rejects.toThrow("DATABASE_URL");
  });

  it("should throw for unknown storage type", async () => {
    const { createStorageFromEnv } = await import("../../src/storage/storage-factory");
    await expect(
      createStorageFromEnv({ type: "redis" as any })
    ).rejects.toThrow("Unknown storage type");
  });
});
