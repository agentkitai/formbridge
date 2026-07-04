/**
 * Transactional write-path tests (D4/D7).
 *
 * Covers:
 * - Atomicity: a failure between submission save and event append rolls BOTH
 *   back, and the emitter never fires.
 * - Save-before-emit ordering: an emitter listener reading storage.submissions
 *   observes the committed submission.
 * - ApprovalManager routes review decisions through the durable event store.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteStorage } from "../../src/storage/sqlite-storage";
import { SubmissionManager } from "../../src/core/submission-manager";
import { ApprovalManager } from "../../src/core/approval-manager";
import type { EventEmitter } from "../../src/core/submission-manager";
import type { Actor, IntakeEvent } from "../../src/types/intake-contract";
import type { Submission } from "../../src/submission-types";
import { IntakeId, SubmissionId, ResumeToken } from "../../src/types/branded";

const actor: Actor = { kind: "agent", id: "a1", name: "Agent" };

function recordingEmitter(): { emitter: EventEmitter; emitted: IntakeEvent[] } {
  const emitted: IntakeEvent[] = [];
  return {
    emitted,
    emitter: {
      emit: async (event: IntakeEvent) => {
        emitted.push(event);
      },
    },
  };
}

describe("Transactional write path (SQLite)", () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage({ dbPath: ":memory:" });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  it("rolls back submission + event when append fails, and never emits", async () => {
    const { emitter, emitted } = recordingEmitter();

    // Inject a failure AFTER the submission save, BEFORE the event append.
    const originalAppend = storage.events.appendEvent.bind(storage.events);
    storage.events.appendEvent = async () => {
      throw new Error("append boom");
    };

    const manager = new SubmissionManager({
      store: storage.submissions,
      eventEmitter: emitter,
      eventStore: storage.events,
      storage,
    });

    await expect(
      manager.createSubmission({ intakeId: IntakeId("intake_txn"), actor })
    ).rejects.toThrow("append boom");

    // Restore for cleanliness.
    storage.events.appendEvent = originalAppend;

    // Submission save was rolled back.
    expect(await storage.submissions.getTotalCount()).toBe(0);
    // Emit fires only after commit — it must not have fired.
    expect(emitted).toHaveLength(0);
  });

  it("emits after commit: a listener sees the committed submission", async () => {
    let observedState: string | null | undefined;
    let observedId: string | undefined;

    const emitter: EventEmitter = {
      emit: async (event: IntakeEvent) => {
        observedId = event.submissionId;
        const persisted = await storage.submissions.get(event.submissionId);
        observedState = persisted?.state ?? null;
      },
    };

    const manager = new SubmissionManager({
      store: storage.submissions,
      eventEmitter: emitter,
      eventStore: storage.events,
      storage,
    });

    const result = await manager.createSubmission({
      intakeId: IntakeId("intake_order"),
      actor,
    });

    // The listener read the store during emit and found the committed row.
    expect(observedId).toBe(result.submissionId);
    expect(observedState).toBe("draft");
  });

  it("serializes concurrent transactions without nested-BEGIN errors", async () => {
    // Each transaction awaits inside, yielding the event loop; without the
    // serialization mutex a second BEGIN would fire mid-transaction and throw
    // "cannot start a transaction within a transaction".
    const N = 25;
    const now = new Date().toISOString();
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        storage.transaction(async (tx) => {
          await tx.submissions.save({
            id: SubmissionId(`sub_c${i}`),
            intakeId: IntakeId("intake_conc"),
            state: "draft",
            resumeToken: ResumeToken(`rtok_c${i}`),
            createdAt: now,
            updatedAt: now,
            fields: {},
            fieldAttribution: {},
            createdBy: actor,
            updatedBy: actor,
            events: [],
          });
        })
      )
    );
    expect(await storage.submissions.getTotalCount()).toBe(N);
  });
});

describe("ApprovalManager durable event append (SQLite)", () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage({ dbPath: ":memory:" });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  function seedNeedsReview(id: string, token: string): Submission {
    const now = new Date().toISOString();
    return {
      id: SubmissionId(id),
      intakeId: IntakeId("intake_review"),
      state: "needs_review",
      resumeToken: ResumeToken(token),
      createdAt: now,
      updatedAt: now,
      fields: {},
      fieldAttribution: {},
      createdBy: actor,
      updatedBy: actor,
      events: [],
    };
  }

  it("appends review.approved to the event store on approve", async () => {
    await storage.submissions.save(seedNeedsReview("sub_ap", "rtok_ap"));
    const { emitter } = recordingEmitter();
    const approvals = new ApprovalManager(
      storage.submissions,
      emitter,
      undefined,
      undefined,
      storage.events,
      storage
    );

    const res = await approvals.approve({
      submissionId: "sub_ap",
      resumeToken: "rtok_ap",
      actor,
    });
    expect("ok" in res && res.ok).toBe(true);

    const events = await storage.events.getEvents("sub_ap");
    expect(events.map((e) => e.type)).toContain("review.approved");

    // And the submission transitioned durably.
    const persisted = await storage.submissions.get("sub_ap");
    expect(persisted!.state).toBe("approved");
  });

  it("appends review.rejected to the event store on reject", async () => {
    await storage.submissions.save(seedNeedsReview("sub_rj", "rtok_rj"));
    const { emitter } = recordingEmitter();
    const approvals = new ApprovalManager(
      storage.submissions,
      emitter,
      undefined,
      undefined,
      storage.events,
      storage
    );

    await approvals.reject({
      submissionId: "sub_rj",
      resumeToken: "rtok_rj",
      actor,
      reason: "incomplete",
    });

    const events = await storage.events.getEvents("sub_rj");
    expect(events.map((e) => e.type)).toContain("review.rejected");
  });
});
