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

vi.mock("pg", () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
      end = mockEnd;
    },
  },
  Pool: class MockPool {
    query = mockQuery;
    end = mockEnd;
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
    storage = new PostgresStorage({
      connectionString: "postgresql://test:test@localhost:5432/testdb",
    });
    await storage.initialize();
  });

  describe("initialize", () => {
    it("should run migration SQL on initialize", () => {
      // First call is the migration
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS submissions");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS events");
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
