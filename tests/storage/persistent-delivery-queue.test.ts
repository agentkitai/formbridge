/**
 * Persistent DeliveryQueue tests (SQLite outbox).
 *
 * Mirrors tests/delivery-queue.test.ts for the durable SqliteDeliveryQueue,
 * plus coverage for getContext rehydration, getPendingRetries ordering /
 * nextRetryAt gating, and repeat deliveries to the same (submission,
 * destination) persisting as separate rows (there is deliberately NO unique
 * guard on (submission_id, destination_url) — deliveries are keyed by
 * delivery_id, and reviewer notifications legitimately re-deliver to one URL).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import { SqliteStorage } from "../../src/storage/sqlite-storage";
import type { DeliveryQueue, DeliveryContext } from "../../src/core/delivery-queue";
import type { DeliveryRecord } from "../../src/types/intake-contract";

function createTestDelivery(
  overrides?: Partial<DeliveryRecord>
): DeliveryRecord {
  return {
    deliveryId: `dlv_${Math.random().toString(36).slice(2)}`,
    submissionId: "sub_test_123",
    destinationUrl: "https://example.com/webhook",
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as DeliveryRecord;
}

function makeContext(submissionId: string): DeliveryContext {
  return {
    submission: {
      id: submissionId,
      intakeId: "intake_x",
      state: "submitted",
      fields: { a: 1 },
      fieldAttribution: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { kind: "agent", id: "a1" },
    },
    destination: { kind: "webhook", url: "https://example.com/webhook" },
  };
}

describe("SqliteDeliveryQueue", () => {
  let storage: SqliteStorage;
  let queue: DeliveryQueue;

  beforeEach(async () => {
    storage = new SqliteStorage({ dbPath: ":memory:" });
    await storage.initialize();
    queue = storage.deliveries;
  });

  afterEach(async () => {
    await storage.close();
  });

  it("enqueues and retrieves a delivery record", async () => {
    const record = createTestDelivery({ deliveryId: "dlv_a" });
    await queue.enqueue(record);
    const retrieved = await queue.get("dlv_a");
    expect(retrieved).toEqual(record);
  });

  it("returns null for a non-existent delivery", async () => {
    expect(await queue.get("dlv_missing")).toBeNull();
  });

  it("lists deliveries for a submission ordered by createdAt", async () => {
    const t0 = new Date(Date.now() - 2000).toISOString();
    const t1 = new Date(Date.now() - 1000).toISOString();
    await queue.enqueue(
      createTestDelivery({ deliveryId: "dlv_2", submissionId: "sub_a", destinationUrl: "https://e/2", createdAt: t1 })
    );
    await queue.enqueue(
      createTestDelivery({ deliveryId: "dlv_1", submissionId: "sub_a", destinationUrl: "https://e/1", createdAt: t0 })
    );
    await queue.enqueue(
      createTestDelivery({ deliveryId: "dlv_3", submissionId: "sub_b" })
    );

    const deliveries = await queue.getBySubmission("sub_a");
    expect(deliveries.map((d) => d.deliveryId)).toEqual(["dlv_1", "dlv_2"]);
  });

  it("returns empty array for unknown submission", async () => {
    expect(await queue.getBySubmission("sub_unknown")).toEqual([]);
  });

  it("updates an existing delivery record", async () => {
    const record = createTestDelivery({ deliveryId: "dlv_update" });
    await queue.enqueue(record);

    record.status = "succeeded";
    record.attempts = 2;
    record.statusCode = 200;
    await queue.update(record);

    const updated = await queue.get("dlv_update");
    expect(updated!.status).toBe("succeeded");
    expect(updated!.attempts).toBe(2);
    expect(updated!.statusCode).toBe(200);
  });

  it("throws when updating a non-existent delivery", async () => {
    const record = createTestDelivery({ deliveryId: "dlv_missing" });
    await expect(queue.update(record)).rejects.toThrow("Delivery not found");
  });

  it("getPendingRetries returns only ready pending deliveries, ordered", async () => {
    const t0 = new Date(Date.now() - 3000).toISOString();
    const t1 = new Date(Date.now() - 2000).toISOString();
    const ready1 = createTestDelivery({
      deliveryId: "dlv_ready_1",
      destinationUrl: "https://e/r1",
      status: "pending",
      nextRetryAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: t0,
    });
    const ready2 = createTestDelivery({
      deliveryId: "dlv_ready_2",
      destinationUrl: "https://e/r2",
      status: "pending",
      createdAt: t1, // no nextRetryAt → immediately ready
    });
    const notReady = createTestDelivery({
      deliveryId: "dlv_not_ready",
      destinationUrl: "https://e/nr",
      status: "pending",
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const done = createTestDelivery({
      deliveryId: "dlv_done",
      destinationUrl: "https://e/done",
      status: "succeeded",
    });

    await queue.enqueue(ready1);
    await queue.enqueue(ready2);
    await queue.enqueue(notReady);
    await queue.enqueue(done);

    const pending = await queue.getPendingRetries();
    expect(pending.map((d) => d.deliveryId)).toEqual(["dlv_ready_1", "dlv_ready_2"]);
  });

  it("getStats aggregates counts by status", async () => {
    await queue.enqueue(createTestDelivery({ deliveryId: "s1", destinationUrl: "https://e/s1", status: "pending" }));
    await queue.enqueue(createTestDelivery({ deliveryId: "s2", destinationUrl: "https://e/s2", status: "pending" }));
    await queue.enqueue(createTestDelivery({ deliveryId: "s3", destinationUrl: "https://e/s3", status: "succeeded" }));
    await queue.enqueue(createTestDelivery({ deliveryId: "s4", destinationUrl: "https://e/s4", status: "failed" }));

    const stats = await queue.getStats();
    expect(stats).toEqual({ total: 4, pending: 2, succeeded: 1, failed: 1 });
  });

  it("getContext returns the stored retry context synchronously", async () => {
    const record = createTestDelivery({ deliveryId: "dlv_ctx", submissionId: "sub_ctx" });
    const ctx = makeContext("sub_ctx");
    await queue.enqueue(record, ctx);

    expect(queue.getContext?.("dlv_ctx")).toEqual(ctx);
  });

  it("rehydrates contexts for non-failed deliveries across a restart", async () => {
    const dbPath = join(
      tmpdir(),
      `fb-dlq-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    try {
      const first = new SqliteStorage({ dbPath });
      await first.initialize();
      await first.deliveries.enqueue(
        createTestDelivery({ deliveryId: "dlv_active", submissionId: "sub_rh", destinationUrl: "https://e/active" }),
        makeContext("sub_rh")
      );
      await first.deliveries.enqueue(
        createTestDelivery({
          deliveryId: "dlv_dead",
          submissionId: "sub_rh",
          destinationUrl: "https://e/dead",
          status: "failed",
        }),
        makeContext("sub_rh")
      );
      await first.close();

      // Reopen the same DB file — the queue constructor rehydrates the cache.
      const second = new SqliteStorage({ dbPath });
      await second.initialize();
      try {
        // Active delivery's context is restored...
        expect(second.deliveries.getContext?.("dlv_active")).toBeDefined();
        // ...but a failed delivery's context is excluded (WHERE status <> 'failed').
        expect(second.deliveries.getContext?.("dlv_dead")).toBeUndefined();
      } finally {
        await second.close();
      }
    } finally {
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}-wal`, { force: true });
      rmSync(`${dbPath}-shm`, { force: true });
    }
  });

  describe("repeat deliveries to the same (submission, destination)", () => {
    it("persists repeat enqueues as separate rows without clobbering the first", async () => {
      const first = createTestDelivery({
        deliveryId: "dlv_first",
        submissionId: "sub_guard",
        destinationUrl: "https://dest/one",
        status: "pending",
        attempts: 2,
      });
      const second = createTestDelivery({
        deliveryId: "dlv_second",
        submissionId: "sub_guard",
        destinationUrl: "https://dest/one",
        status: "pending",
        attempts: 0,
      });

      await queue.enqueue(first);
      await queue.enqueue(second);

      // Both persist as distinct rows (keyed by delivery_id). A second enqueue to
      // the same (submission, destination) must NOT supersede/delete the first —
      // there is deliberately no unique guard, because reviewer notifications
      // legitimately re-deliver to the same URL. (The old partial-unique index +
      // INSERT OR REPLACE deleted the in-flight row → "Delivery not found" loops.)
      const rows = await queue.getBySubmission("sub_guard");
      expect(rows).toHaveLength(2);
      expect(rows.map((d) => d.deliveryId).sort()).toEqual(["dlv_first", "dlv_second"]);

      // The in-flight first row is untouched (its attempts are not clobbered)...
      const firstRow = await queue.get("dlv_first");
      expect(firstRow).not.toBeNull();
      expect(firstRow!.attempts).toBe(2);

      // ...and both remain retrievable / updatable (no "Delivery not found").
      expect(await queue.get("dlv_second")).not.toBeNull();
      first.attempts = 3;
      await expect(queue.update(first)).resolves.toBeUndefined();
    });

    it("keeps a failed row alongside a fresh pending retry", async () => {
      const failed = createTestDelivery({
        deliveryId: "dlv_failed",
        submissionId: "sub_coexist",
        destinationUrl: "https://dest/two",
        status: "failed",
      });
      const pending = createTestDelivery({
        deliveryId: "dlv_retry",
        submissionId: "sub_coexist",
        destinationUrl: "https://dest/two",
        status: "pending",
      });

      await queue.enqueue(failed);
      await queue.enqueue(pending);

      // Distinct delivery_ids → both persist regardless of status.
      const all = await queue.getBySubmission("sub_coexist");
      expect(all.map((d) => d.deliveryId).sort()).toEqual(["dlv_failed", "dlv_retry"]);
    });
  });
});
