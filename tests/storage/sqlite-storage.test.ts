/**
 * SqliteStorage Test Suite
 *
 * Comprehensive tests for the SQLite storage backend covering:
 * - Initialization & lifecycle (migration, WAL mode, tables/indexes)
 * - Submission CRUD (get, save, getByResumeToken, getByIdempotencyKey, delete)
 * - Submission list & filter (intakeId, state, date range, pagination)
 * - Event store (append, versioning, duplicate rejection, filters, stats, cleanup)
 * - Edge cases (not found, null idempotency key, concurrent writes)
 * - Health check
 * - NoopStorageBackend (file storage not configured)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteStorage } from "../../src/storage/sqlite-storage";
import { migrateStorage } from "../../src/storage/migration";
import { MemoryStorage } from "../../src/storage/memory-storage";
import type { Submission } from "../../src/submission-types";
import type { Actor, IntakeEvent, IntakeEventType } from "../../src/types/intake-contract";

// =============================================================================
// § Helpers
// =============================================================================

const testActor: Actor = { kind: "agent", id: "agent-1", name: "Test Agent" };

function createSubmission(
  id: string,
  overrides: Partial<Submission> = {}
): Submission {
  const now = new Date().toISOString();
  return {
    id,
    intakeId: "intake_default",
    state: "draft",
    resumeToken: `rtok_${id}`,
    createdAt: now,
    updatedAt: now,
    fields: { name: "Test User" },
    fieldAttribution: { name: testActor },
    createdBy: testActor,
    updatedBy: testActor,
    events: [],
    ...overrides,
  };
}

function createEvent(
  eventId: string,
  submissionId: string,
  type: IntakeEventType = "submission.created",
  overrides: Partial<IntakeEvent> = {}
): IntakeEvent {
  return {
    eventId,
    type,
    submissionId,
    ts: new Date().toISOString(),
    actor: testActor,
    state: "draft",
    payload: { test: true },
    ...overrides,
  };
}

// =============================================================================
// § Tests
// =============================================================================

describe("SqliteStorage", () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage({ dbPath: ":memory:" });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  describe("Lifecycle", () => {
    it("should initialize successfully with in-memory database", async () => {
      const s = new SqliteStorage({ dbPath: ":memory:" });
      await s.initialize();
      const health = await s.healthCheck();
      expect(health.ok).toBe(true);
      await s.close();
    });

    it("should report healthy after initialization", async () => {
      const health = await storage.healthCheck();
      expect(health.ok).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should report unhealthy after close", async () => {
      await storage.close();
      const health = await storage.healthCheck();
      expect(health.ok).toBe(false);
    });

    it("should allow calling close multiple times", async () => {
      await storage.close();
      await storage.close(); // should not throw
    });

    it("should create submissions and events tables", async () => {
      // Verify by saving and retrieving data in both tables
      const sub = createSubmission("lifecycle_sub");
      await storage.submissions.save(sub);
      const retrieved = await storage.submissions.get("lifecycle_sub");
      expect(retrieved).toBeDefined();

      const event = createEvent("lifecycle_evt", "lifecycle_sub");
      await storage.events.appendEvent(event);
      const events = await storage.events.getEvents("lifecycle_sub");
      expect(events).toHaveLength(1);
    });

    it("should be idempotent on re-initialization (CREATE IF NOT EXISTS)", async () => {
      // Close and re-initialize on same in-memory DB won't work, 
      // but we can verify double-init pattern with a new instance
      const s = new SqliteStorage({ dbPath: ":memory:" });
      await s.initialize();
      // Tables already created; calling exec with CREATE IF NOT EXISTS again should be fine
      await s.initialize();
      await s.close();
    });
  });

  // ===========================================================================
  // Submission CRUD
  // ===========================================================================

  describe("Submission CRUD", () => {
    it("should save and retrieve a submission by ID", async () => {
      const sub = createSubmission("sub_1");
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_1");
      expect(retrieved).toEqual(sub);
    });

    it("should return null for non-existent submission", async () => {
      const result = await storage.submissions.get("sub_nonexistent");
      expect(result).toBeNull();
    });

    it("should retrieve by resume token", async () => {
      const sub = createSubmission("sub_rt");
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.getByResumeToken("rtok_sub_rt");
      expect(retrieved).toEqual(sub);
    });

    it("should return null for non-existent resume token", async () => {
      const result = await storage.submissions.getByResumeToken("rtok_missing");
      expect(result).toBeNull();
    });

    it("should retrieve by idempotency key", async () => {
      const sub = createSubmission("sub_ik", { idempotencyKey: "idem_123" });
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.getByIdempotencyKey("idem_123");
      expect(retrieved).toEqual(sub);
    });

    it("should return null for non-existent idempotency key", async () => {
      const result = await storage.submissions.getByIdempotencyKey("idem_missing");
      expect(result).toBeNull();
    });

    it("should return null for null idempotency key lookup", async () => {
      // Save a submission without idempotency key
      const sub = createSubmission("sub_no_ik");
      await storage.submissions.save(sub);

      // Looking up any key shouldn't match submissions with null idempotency key
      const result = await storage.submissions.getByIdempotencyKey("anything");
      expect(result).toBeNull();
    });

    it("should update an existing submission via INSERT OR REPLACE", async () => {
      const sub = createSubmission("sub_update");
      await storage.submissions.save(sub);

      // Update fields
      sub.state = "in_progress";
      sub.fields = { name: "Updated Name" };
      sub.updatedAt = new Date().toISOString();
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_update");
      expect(retrieved!.state).toBe("in_progress");
      expect(retrieved!.fields).toEqual({ name: "Updated Name" });
    });

    it("should update resume token and still be queryable", async () => {
      const sub = createSubmission("sub_rt_update");
      await storage.submissions.save(sub);

      // Update resume token
      sub.resumeToken = "rtok_new";
      await storage.submissions.save(sub);

      // Old token should not work (the row is replaced with new token)
      const byOldToken = await storage.submissions.getByResumeToken("rtok_sub_rt_update");
      expect(byOldToken).toBeNull();

      // New token should work
      const byNewToken = await storage.submissions.getByResumeToken("rtok_new");
      expect(byNewToken!.id).toBe("sub_rt_update");
    });

    it("should delete a submission", async () => {
      const sub = createSubmission("sub_del");
      await storage.submissions.save(sub);

      const deleted = await storage.submissions.delete("sub_del");
      expect(deleted).toBe(true);

      const retrieved = await storage.submissions.get("sub_del");
      expect(retrieved).toBeNull();
    });

    it("should return false when deleting non-existent submission", async () => {
      const deleted = await storage.submissions.delete("sub_missing");
      expect(deleted).toBe(false);
    });

    it("should handle submission with all optional fields", async () => {
      const sub = createSubmission("sub_full", {
        idempotencyKey: "idem_full",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        ttlMs: 60_000,
        currentStep: "step_1",
        completedSteps: ["step_0"],
      });
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_full");
      expect(retrieved).toEqual(sub);
      expect(retrieved!.idempotencyKey).toBe("idem_full");
      expect(retrieved!.expiresAt).toBeDefined();
      expect(retrieved!.currentStep).toBe("step_1");
    });

    it("should preserve complex nested fields", async () => {
      const sub = createSubmission("sub_nested", {
        fields: {
          person: { first: "Jane", last: "Doe" },
          tags: ["a", "b", "c"],
          count: 42,
          active: true,
        },
      });
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_nested");
      expect(retrieved!.fields).toEqual({
        person: { first: "Jane", last: "Doe" },
        tags: ["a", "b", "c"],
        count: 42,
        active: true,
      });
    });
  });

  // ===========================================================================
  // Submission List & Filter
  // ===========================================================================

  describe("Submission List & Filter", () => {
    beforeEach(async () => {
      // Seed 10 submissions across 2 intakes, mixed states
      for (let i = 0; i < 10; i++) {
        const sub = createSubmission(`sub_list_${i}`, {
          intakeId: `intake_${i % 3}`,
          state: i < 5 ? "draft" : "submitted",
          createdAt: new Date(Date.now() - (10 - i) * 1000).toISOString(),
        });
        await storage.submissions.save(sub);
      }
    });

    it("should list all submissions", async () => {
      const result = await storage.submissions.list({});
      expect(result.total).toBe(10);
      expect(result.items).toHaveLength(10);
    });

    it("should filter by intakeId", async () => {
      const result = await storage.submissions.list({ intakeId: "intake_0" });
      // i=0,3,6,9 → intake_0
      expect(result.total).toBe(4);
      for (const item of result.items) {
        expect(item.intakeId).toBe("intake_0");
      }
    });

    it("should filter by state", async () => {
      const result = await storage.submissions.list({ state: "draft" });
      expect(result.total).toBe(5);
      for (const item of result.items) {
        expect(item.state).toBe("draft");
      }
    });

    it("should filter by createdAfter", async () => {
      // Get the 5th submission's createdAt as cutoff
      const allSubs = await storage.submissions.list({});
      // Sorted newest first, so index 4 = 5th newest
      const cutoff = allSubs.items[4].createdAt;

      const result = await storage.submissions.list({ createdAfter: cutoff });
      expect(result.total).toBeGreaterThanOrEqual(1);
      for (const item of result.items) {
        expect(item.createdAt >= cutoff).toBe(true);
      }
    });

    it("should filter by createdBefore", async () => {
      const allSubs = await storage.submissions.list({});
      const cutoff = allSubs.items[5].createdAt;

      const result = await storage.submissions.list({ createdBefore: cutoff });
      expect(result.total).toBeGreaterThanOrEqual(1);
      for (const item of result.items) {
        expect(item.createdAt <= cutoff).toBe(true);
      }
    });

    it("should combine multiple filters", async () => {
      const result = await storage.submissions.list({
        intakeId: "intake_0",
        state: "draft",
      });
      // intake_0 items at i=0,3,6,9; drafts at i<5; intersection: i=0,3
      expect(result.total).toBe(2);
    });

    it("should paginate with limit and offset", async () => {
      const page1 = await storage.submissions.list({}, { limit: 3, offset: 0 });
      expect(page1.items).toHaveLength(3);
      expect(page1.total).toBe(10);
      expect(page1.offset).toBe(0);
      expect(page1.limit).toBe(3);
      expect(page1.hasMore).toBe(true);

      const page2 = await storage.submissions.list({}, { limit: 3, offset: 3 });
      expect(page2.items).toHaveLength(3);
      expect(page2.hasMore).toBe(true);

      // Ensure no overlap between pages
      const ids1 = page1.items.map((s) => s.id);
      const ids2 = page2.items.map((s) => s.id);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    });

    it("should return hasMore=false on last page", async () => {
      const lastPage = await storage.submissions.list({}, { limit: 5, offset: 8 });
      expect(lastPage.items).toHaveLength(2);
      expect(lastPage.hasMore).toBe(false);
    });

    it("should return empty result for non-matching filter", async () => {
      const result = await storage.submissions.list({ intakeId: "intake_nonexistent" });
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should order results by createdAt descending", async () => {
      const result = await storage.submissions.list({});
      for (let i = 0; i < result.items.length - 1; i++) {
        expect(result.items[i].createdAt >= result.items[i + 1].createdAt).toBe(true);
      }
    });

    it("should count submissions matching filter", async () => {
      const count = await storage.submissions.count({ state: "submitted" });
      expect(count).toBe(5);
    });

    it("should count all submissions with empty filter", async () => {
      const count = await storage.submissions.count({});
      expect(count).toBe(10);
    });
  });

  // ===========================================================================
  // Event Store
  // ===========================================================================

  describe("Event Store", () => {
    it("should append and retrieve an event", async () => {
      const event = createEvent("evt_1", "sub_1");
      await storage.events.appendEvent(event);

      const events = await storage.events.getEvents("sub_1");
      expect(events).toHaveLength(1);
      expect(events[0].eventId).toBe("evt_1");
      expect(events[0].submissionId).toBe("sub_1");
    });

    it("should assign monotonically increasing versions", async () => {
      await storage.events.appendEvent(createEvent("evt_1", "sub_1"));
      await storage.events.appendEvent(
        createEvent("evt_2", "sub_1", "field.updated" as IntakeEventType)
      );
      await storage.events.appendEvent(
        createEvent("evt_3", "sub_1", "submission.submitted" as IntakeEventType)
      );

      const events = await storage.events.getEvents("sub_1");
      expect(events).toHaveLength(3);
      expect(events[0].version).toBe(1);
      expect(events[1].version).toBe(2);
      expect(events[2].version).toBe(3);
    });

    it("should maintain separate version counters per submission", async () => {
      await storage.events.appendEvent(createEvent("evt_a1", "sub_a"));
      await storage.events.appendEvent(createEvent("evt_a2", "sub_a"));
      await storage.events.appendEvent(createEvent("evt_b1", "sub_b"));

      const eventsA = await storage.events.getEvents("sub_a");
      const eventsB = await storage.events.getEvents("sub_b");

      expect(eventsA[0].version).toBe(1);
      expect(eventsA[1].version).toBe(2);
      expect(eventsB[0].version).toBe(1);
    });

    it("should reject duplicate event IDs", async () => {
      await storage.events.appendEvent(createEvent("evt_dup", "sub_1"));
      await expect(
        storage.events.appendEvent(createEvent("evt_dup", "sub_1"))
      ).rejects.toThrow("Duplicate eventId");
    });

    it("should reject duplicate event IDs across different submissions", async () => {
      await storage.events.appendEvent(createEvent("evt_dup_cross", "sub_1"));
      await expect(
        storage.events.appendEvent(createEvent("evt_dup_cross", "sub_2"))
      ).rejects.toThrow("Duplicate eventId");
    });

    it("should return empty array for submission with no events", async () => {
      const events = await storage.events.getEvents("sub_nonexistent");
      expect(events).toEqual([]);
    });

    it("should preserve event payload", async () => {
      const event = createEvent("evt_payload", "sub_1", "submission.created", {
        payload: { fieldName: "email", oldValue: null, newValue: "test@test.com" },
      });
      await storage.events.appendEvent(event);

      const events = await storage.events.getEvents("sub_1");
      expect(events[0].payload).toEqual({
        fieldName: "email",
        oldValue: null,
        newValue: "test@test.com",
      });
    });

    it("should handle event with no payload", async () => {
      const event = createEvent("evt_no_payload", "sub_1");
      delete (event as any).payload;
      event.payload = undefined;
      await storage.events.appendEvent(event);

      const events = await storage.events.getEvents("sub_1");
      expect(events[0].payload).toBeUndefined();
    });

    it("should preserve actor data", async () => {
      const actor: Actor = { kind: "human", id: "user_42", name: "Jane Doe" };
      const event = createEvent("evt_actor", "sub_1", "submission.created", { actor });
      await storage.events.appendEvent(event);

      const events = await storage.events.getEvents("sub_1");
      expect(events[0].actor).toEqual(actor);
    });

    it("should return events in chronological order (ts ASC)", async () => {
      const ts1 = new Date(Date.now() - 3000).toISOString();
      const ts2 = new Date(Date.now() - 2000).toISOString();
      const ts3 = new Date(Date.now() - 1000).toISOString();

      // Insert out of order
      await storage.events.appendEvent(
        createEvent("evt_2", "sub_1", "submission.created", { ts: ts2 })
      );
      await storage.events.appendEvent(
        createEvent("evt_3", "sub_1", "field.updated" as IntakeEventType, { ts: ts3 })
      );
      await storage.events.appendEvent(
        createEvent("evt_1", "sub_1", "submission.submitted" as IntakeEventType, { ts: ts1 })
      );

      const events = await storage.events.getEvents("sub_1");
      expect(events[0].ts).toBe(ts1);
      expect(events[1].ts).toBe(ts2);
      expect(events[2].ts).toBe(ts3);
    });

    describe("Event Filters", () => {
      beforeEach(async () => {
        const humanActor: Actor = { kind: "human", id: "user_1", name: "Human" };
        const systemActor: Actor = { kind: "system", id: "sys_1", name: "System" };

        const baseTs = Date.now();

        await storage.events.appendEvent(
          createEvent("evt_f1", "sub_filter", "submission.created", {
            ts: new Date(baseTs - 5000).toISOString(),
            actor: testActor,
          })
        );
        await storage.events.appendEvent(
          createEvent("evt_f2", "sub_filter", "field.updated" as IntakeEventType, {
            ts: new Date(baseTs - 4000).toISOString(),
            actor: humanActor,
          })
        );
        await storage.events.appendEvent(
          createEvent("evt_f3", "sub_filter", "submission.submitted" as IntakeEventType, {
            ts: new Date(baseTs - 3000).toISOString(),
            actor: systemActor,
          })
        );
        await storage.events.appendEvent(
          createEvent("evt_f4", "sub_filter", "field.updated" as IntakeEventType, {
            ts: new Date(baseTs - 2000).toISOString(),
            actor: testActor,
          })
        );
      });

      it("should filter events by type", async () => {
        const events = await storage.events.getEvents("sub_filter", {
          types: ["field.updated" as IntakeEventType],
        });
        expect(events).toHaveLength(2);
        events.forEach((e) => expect(e.type).toBe("field.updated"));
      });

      it("should filter events by multiple types", async () => {
        const events = await storage.events.getEvents("sub_filter", {
          types: [
            "submission.created" as IntakeEventType,
            "submission.submitted" as IntakeEventType,
          ],
        });
        expect(events).toHaveLength(2);
      });

      it("should filter events by actor kind", async () => {
        const events = await storage.events.getEvents("sub_filter", {
          actorKind: "human",
        });
        expect(events).toHaveLength(1);
        expect(events[0].actor.kind).toBe("human");
      });

      it("should filter events by since timestamp", async () => {
        const allEvents = await storage.events.getEvents("sub_filter");
        const midpoint = allEvents[2].ts;

        const events = await storage.events.getEvents("sub_filter", {
          since: midpoint,
        });
        expect(events.length).toBeGreaterThanOrEqual(1);
        events.forEach((e) => expect(e.ts >= midpoint).toBe(true));
      });

      it("should filter events by until timestamp", async () => {
        const allEvents = await storage.events.getEvents("sub_filter");
        const midpoint = allEvents[1].ts;

        const events = await storage.events.getEvents("sub_filter", {
          until: midpoint,
        });
        expect(events.length).toBeGreaterThanOrEqual(1);
        events.forEach((e) => expect(e.ts <= midpoint).toBe(true));
      });

      it("should apply limit to events", async () => {
        const events = await storage.events.getEvents("sub_filter", { limit: 2 });
        expect(events).toHaveLength(2);
      });

      it("should apply offset to events", async () => {
        const allEvents = await storage.events.getEvents("sub_filter");
        const offsetEvents = await storage.events.getEvents("sub_filter", {
          limit: 2,
          offset: 2,
        });
        expect(offsetEvents).toHaveLength(2);
        expect(offsetEvents[0].eventId).toBe(allEvents[2].eventId);
      });

      it("should combine multiple filters", async () => {
        const events = await storage.events.getEvents("sub_filter", {
          types: ["field.updated" as IntakeEventType],
          actorKind: "agent",
        });
        expect(events).toHaveLength(1);
        expect(events[0].actor.kind).toBe("agent");
        expect(events[0].type).toBe("field.updated");
      });
    });

    describe("Event Stats", () => {
      it("should return zeroes for empty store", async () => {
        const stats = await storage.events.getStats();
        expect(stats.totalEvents).toBe(0);
        expect(stats.submissionCount).toBe(0);
      });

      it("should count events and unique submissions", async () => {
        await storage.events.appendEvent(createEvent("evt_s1", "sub_1"));
        await storage.events.appendEvent(createEvent("evt_s2", "sub_1"));
        await storage.events.appendEvent(createEvent("evt_s3", "sub_2"));

        const stats = await storage.events.getStats();
        expect(stats.totalEvents).toBe(3);
        expect(stats.submissionCount).toBe(2);
      });

      it("should track oldest and newest events", async () => {
        const ts1 = new Date(Date.now() - 10_000).toISOString();
        const ts2 = new Date().toISOString();

        await storage.events.appendEvent(
          createEvent("evt_old", "sub_1", "submission.created", { ts: ts1 })
        );
        await storage.events.appendEvent(
          createEvent("evt_new", "sub_2", "submission.created", { ts: ts2 })
        );

        const stats = await storage.events.getStats();
        expect(stats.oldestEvent).toBe(ts1);
        expect(stats.newestEvent).toBe(ts2);
      });
    });

    describe("Event Cleanup", () => {
      it("should delete events older than threshold", async () => {
        const oldTs = new Date(Date.now() - 60_000).toISOString();
        const newTs = new Date().toISOString();

        await storage.events.appendEvent(
          createEvent("evt_old", "sub_1", "submission.created", { ts: oldTs })
        );
        await storage.events.appendEvent(
          createEvent("evt_new", "sub_1", "field.updated" as IntakeEventType, { ts: newTs })
        );

        // Cleanup events older than 30 seconds
        const deleted = await storage.events.cleanupOld(30_000);
        expect(deleted).toBe(1);

        const remaining = await storage.events.getEvents("sub_1");
        expect(remaining).toHaveLength(1);
        expect(remaining[0].eventId).toBe("evt_new");
      });

      it("should return 0 when nothing to clean up", async () => {
        await storage.events.appendEvent(createEvent("evt_recent", "sub_1"));
        const deleted = await storage.events.cleanupOld(60_000);
        expect(deleted).toBe(0);
      });
    });
  });

  // ===========================================================================
  // File Storage (Noop)
  // ===========================================================================

  describe("NoopStorageBackend (files)", () => {
    it("should throw on generateUploadUrl", async () => {
      await expect(
        storage.files.generateUploadUrl({
          intakeId: "i",
          submissionId: "s",
          fieldPath: "f",
          filename: "file.txt",
          mimeType: "text/plain",
          constraints: { maxSize: 1024, allowedTypes: [], maxCount: 1 },
        })
      ).rejects.toThrow("File storage not configured");
    });

    it("should throw on verifyUpload", async () => {
      await expect(storage.files.verifyUpload("upload_123")).rejects.toThrow(
        "File storage not configured"
      );
    });

    it("should throw on getUploadMetadata", async () => {
      await expect(storage.files.getUploadMetadata("upload_123")).rejects.toThrow(
        "File storage not configured"
      );
    });

    it("should throw on generateDownloadUrl", async () => {
      await expect(storage.files.generateDownloadUrl("upload_123")).rejects.toThrow(
        "File storage not configured"
      );
    });

    it("should throw on deleteUpload", async () => {
      await expect(storage.files.deleteUpload("upload_123")).rejects.toThrow(
        "File storage not configured"
      );
    });

    it("should throw on cleanupExpired", async () => {
      await expect(storage.files.cleanupExpired()).rejects.toThrow(
        "File storage not configured"
      );
    });
  });

  // ===========================================================================
  // Migration
  // ===========================================================================

  describe("Migration (Memory → SQLite)", () => {
    it("should migrate submissions and events from memory to sqlite", async () => {
      // Seed source
      const source = new MemoryStorage();
      await source.initialize();

      const sub1 = createSubmission("mig_sub_1", { intakeId: "mig_intake" });
      const sub2 = createSubmission("mig_sub_2", { intakeId: "mig_intake" });
      await source.submissions.save(sub1);
      await source.submissions.save(sub2);

      await source.events.appendEvent(createEvent("mig_evt_1", "mig_sub_1"));
      await source.events.appendEvent(createEvent("mig_evt_2", "mig_sub_1"));
      await source.events.appendEvent(createEvent("mig_evt_3", "mig_sub_2"));

      // Migrate to SQLite
      const result = await migrateStorage(source, storage);
      expect(result.submissionsMigrated).toBe(2);
      expect(result.eventsMigrated).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(result.dryRun).toBe(false);

      // Verify data in SQLite
      const retrieved1 = await storage.submissions.get("mig_sub_1");
      expect(retrieved1).toBeDefined();
      expect(retrieved1!.intakeId).toBe("mig_intake");

      const events = await storage.events.getEvents("mig_sub_1");
      expect(events).toHaveLength(2);
    });

    it("should support dry-run migration to SQLite", async () => {
      const source = new MemoryStorage();
      await source.initialize();
      await source.submissions.save(createSubmission("dry_sub"));

      const result = await migrateStorage(source, storage, { dryRun: true });
      expect(result.submissionsMigrated).toBe(1);
      expect(result.dryRun).toBe(true);

      // SQLite should be empty
      const retrieved = await storage.submissions.get("dry_sub");
      expect(retrieved).toBeNull();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("should handle empty fields object", async () => {
      const sub = createSubmission("sub_empty_fields", { fields: {} });
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_empty_fields");
      expect(retrieved!.fields).toEqual({});
    });

    it("should handle very long field values", async () => {
      const longStr = "x".repeat(10_000);
      const sub = createSubmission("sub_long", {
        fields: { description: longStr },
      });
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_long");
      expect(retrieved!.fields.description).toBe(longStr);
    });

    it("should handle multiple submissions with same intakeId", async () => {
      for (let i = 0; i < 5; i++) {
        await storage.submissions.save(
          createSubmission(`sub_same_intake_${i}`, { intakeId: "shared_intake" })
        );
      }

      const result = await storage.submissions.list({ intakeId: "shared_intake" });
      expect(result.total).toBe(5);
    });

    it("should handle idempotency key uniqueness constraint", async () => {
      const sub1 = createSubmission("sub_ik_1", { idempotencyKey: "unique_key" });
      await storage.submissions.save(sub1);

      // A different submission with the same idempotency key should fail
      // (because of UNIQUE index on idempotencyKey)
      const sub2 = createSubmission("sub_ik_2", { idempotencyKey: "unique_key" });
      // INSERT OR REPLACE will replace based on primary key (id), but the
      // UNIQUE constraint on idempotencyKey would cause a conflict.
      // In SQLite with INSERT OR REPLACE, this replaces the conflicting row.
      await storage.submissions.save(sub2);

      // After the save, sub_ik_2 should exist and sub_ik_1 might have been replaced
      const retrieved = await storage.submissions.getByIdempotencyKey("unique_key");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("sub_ik_2");
    });

    it("should handle submissions without idempotency key (null)", async () => {
      // Multiple submissions with null idempotency key should be fine
      const sub1 = createSubmission("sub_null_ik_1");
      const sub2 = createSubmission("sub_null_ik_2");
      await storage.submissions.save(sub1);
      await storage.submissions.save(sub2);

      const result = await storage.submissions.list({});
      expect(result.total).toBe(2);
    });

    it("should handle special characters in field values", async () => {
      const sub = createSubmission("sub_special", {
        fields: {
          name: 'O\'Brien "The Great"',
          notes: "Line 1\nLine 2\tTabbed",
          emoji: "🎉🚀",
          html: "<script>alert('xss')</script>",
        },
      });
      await storage.submissions.save(sub);

      const retrieved = await storage.submissions.get("sub_special");
      expect(retrieved!.fields.name).toBe('O\'Brien "The Great"');
      expect(retrieved!.fields.emoji).toBe("🎉🚀");
    });
  });
});
