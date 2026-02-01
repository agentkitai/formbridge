/**
 * Storage Compliance Test Suite
 *
 * Tests that all storage backends conform to the FormBridgeStorage interface.
 * Currently tests MemoryStorage. SqliteStorage requires better-sqlite3 (optional).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { migrateStorage } from "../../src/storage/migration";
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

function createTestEvent(
  eventId: string,
  submissionId: string,
  type = "submission.created" as const
): IntakeEvent {
  return {
    eventId,
    type,
    submissionId,
    ts: new Date().toISOString(),
    actor: testActor,
    state: "draft",
    payload: { test: true },
  };
}

describe("MemoryStorage Compliance", () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.initialize();
  });

  describe("Lifecycle", () => {
    it("should initialize and close without error", async () => {
      await storage.initialize();
      await storage.close();
    });

    it("should report healthy", async () => {
      const health = await storage.healthCheck();
      expect(health.ok).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Submission CRUD", () => {
    it("should save and retrieve a submission by ID", async () => {
      const sub = createTestSubmission("sub_1");
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_1");
      expect(retrieved).toEqual(sub);
    });

    it("should retrieve by resume token", async () => {
      const sub = createTestSubmission("sub_2");
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.getByResumeToken("rtok_sub_2");
      expect(retrieved).toEqual(sub);
    });

    it("should return null for non-existent submission", async () => {
      const result = await storage.submissions.get("sub_nonexistent");
      expect(result).toBeNull();
    });

    it("should update existing submission", async () => {
      const sub = createTestSubmission("sub_3");
      await storage.submissions.save(sub);

      sub.state = "in_progress";
      sub.resumeToken = "rtok_new";
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_3");
      expect(retrieved!.state).toBe("in_progress");
      expect(retrieved!.resumeToken).toBe("rtok_new");

      // Old token should not work
      const byOldToken =
        await storage.submissions.getByResumeToken("rtok_sub_3");
      expect(byOldToken).toBeNull();

      // New token should work
      const byNewToken =
        await storage.submissions.getByResumeToken("rtok_new");
      expect(byNewToken!.id).toBe("sub_3");
    });

    it("should delete a submission", async () => {
      const sub = createTestSubmission("sub_4");
      await storage.submissions.save(sub);

      const deleted = await storage.submissions.delete("sub_4");
      expect(deleted).toBe(true);

      const retrieved = await storage.submissions.get("sub_4");
      expect(retrieved).toBeNull();
    });

    it("should return false for deleting non-existent submission", async () => {
      const deleted = await storage.submissions.delete("sub_missing");
      expect(deleted).toBe(false);
    });
  });

  describe("Submission List & Filter", () => {
    beforeEach(async () => {
      // Seed some submissions with slight time differences
      for (let i = 0; i < 5; i++) {
        const sub = createTestSubmission(`sub_list_${i}`, `intake_${i % 2}`);
        sub.state = i < 3 ? "draft" : "submitted";
        sub.createdAt = new Date(
          Date.now() - (5 - i) * 1000
        ).toISOString();
        await storage.submissions.save(sub);
      }
    });

    it("should list all submissions", async () => {
      const result = await storage.submissions.list({});
      expect(result.total).toBe(5);
      expect(result.items.length).toBe(5);
    });

    it("should filter by intakeId", async () => {
      const result = await storage.submissions.list({ intakeId: "intake_0" });
      expect(result.total).toBe(3);
    });

    it("should filter by state", async () => {
      const result = await storage.submissions.list({ state: "submitted" });
      expect(result.total).toBe(2);
    });

    it("should paginate results", async () => {
      const page1 = await storage.submissions.list({}, { limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await storage.submissions.list({}, { limit: 2, offset: 2 });
      expect(page2.items.length).toBe(2);
      expect(page2.hasMore).toBe(true);

      const page3 = await storage.submissions.list({}, { limit: 2, offset: 4 });
      expect(page3.items.length).toBe(1);
      expect(page3.hasMore).toBe(false);
    });

    it("should count submissions", async () => {
      const count = await storage.submissions.count({ state: "draft" });
      expect(count).toBe(3);
    });
  });

  describe("Event Store", () => {
    it("should append and retrieve events", async () => {
      const event = createTestEvent("evt_1", "sub_1");
      await storage.events.appendEvent(event);

      const events = await storage.events.getEvents("sub_1");
      expect(events.length).toBe(1);
      expect(events[0].eventId).toBe("evt_1");
      expect(events[0].version).toBe(1);
    });

    it("should assign monotonic versions", async () => {
      await storage.events.appendEvent(createTestEvent("evt_1", "sub_1"));
      await storage.events.appendEvent(
        createTestEvent("evt_2", "sub_1", "field.updated" as any)
      );

      const events = await storage.events.getEvents("sub_1");
      expect(events[0].version).toBe(1);
      expect(events[1].version).toBe(2);
    });

    it("should reject duplicate event IDs", async () => {
      await storage.events.appendEvent(createTestEvent("evt_dup", "sub_1"));
      await expect(
        storage.events.appendEvent(createTestEvent("evt_dup", "sub_1"))
      ).rejects.toThrow("Duplicate eventId");
    });

    it("should get statistics", async () => {
      await storage.events.appendEvent(createTestEvent("evt_s1", "sub_1"));
      await storage.events.appendEvent(createTestEvent("evt_s2", "sub_2"));

      const stats = await storage.events.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.submissionCount).toBe(2);
    });
  });

  describe("Migration", () => {
    it("should migrate data between storage backends", async () => {
      // Setup source with data
      const source = new MemoryStorage();
      await source.initialize();

      const sub = createTestSubmission("sub_migrate");
      await source.submissions.save(sub);
      await source.events.appendEvent(
        createTestEvent("evt_migrate", "sub_migrate")
      );

      // Create target
      const target = new MemoryStorage();
      await target.initialize();

      // Migrate
      const result = await migrateStorage(source, target);
      expect(result.submissionsMigrated).toBe(1);
      expect(result.eventsMigrated).toBe(1);
      expect(result.errors.length).toBe(0);
      expect(result.dryRun).toBe(false);

      // Verify target has the data
      const retrieved = await target.submissions.get("sub_migrate");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("sub_migrate");

      const events = await target.events.getEvents("sub_migrate");
      expect(events.length).toBe(1);
    });

    it("should support dry-run migration", async () => {
      const source = new MemoryStorage();
      await source.initialize();
      await source.submissions.save(createTestSubmission("sub_dry"));

      const target = new MemoryStorage();
      await target.initialize();

      const result = await migrateStorage(source, target, { dryRun: true });
      expect(result.submissionsMigrated).toBe(1);
      expect(result.dryRun).toBe(true);

      // Target should still be empty
      const retrieved = await target.submissions.get("sub_dry");
      expect(retrieved).toBeNull();
    });
  });
});
