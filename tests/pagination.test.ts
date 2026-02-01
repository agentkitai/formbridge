/**
 * Tests for event pagination
 *
 * Tests the limit/offset pagination in the EventStore and Hono event routes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "../src/core/event-store.js";
import { Hono } from "hono";
import { createHonoEventRouter } from "../src/routes/hono-events.js";
import { SubmissionManager } from "../src/core/submission-manager.js";
import type { IntakeEvent } from "../src/types/intake-contract.js";
import type { Submission } from "../src/submission-types.js";

// ---------- Helpers ----------

class TestStore {
  private submissions = new Map<string, Submission>();
  async get(id: string) { return this.submissions.get(id) ?? null; }
  async save(s: Submission) { this.submissions.set(s.id, s); }
  async getByResumeToken(token: string) {
    for (const s of this.submissions.values()) {
      if (s.resumeToken === token) return s;
    }
    return null;
  }
}

class TestEmitter {
  events: IntakeEvent[] = [];
  async emit(event: IntakeEvent) { this.events.push(event); }
}

const testActor = { kind: "agent" as const, id: "test-agent", name: "Test Agent" };

// ---------- EventStore Pagination Tests ----------

describe("InMemoryEventStore pagination", () => {
  let store: InMemoryEventStore;

  beforeEach(async () => {
    store = new InMemoryEventStore();
    // Add 10 events
    for (let i = 0; i < 10; i++) {
      await store.appendEvent({
        eventId: `evt_${i}`,
        type: "field.updated",
        submissionId: "sub_1",
        ts: new Date(2024, 0, 1, 0, 0, i).toISOString(),
        actor: testActor,
        state: "in_progress",
        payload: { index: i },
      });
    }
  });

  it("returns all events when no pagination specified", async () => {
    const events = await store.getEvents("sub_1");
    expect(events).toHaveLength(10);
  });

  it("applies limit", async () => {
    const events = await store.getEvents("sub_1", { limit: 3 });
    expect(events).toHaveLength(3);
    expect(events[0].eventId).toBe("evt_0");
  });

  it("applies offset", async () => {
    const events = await store.getEvents("sub_1", { offset: 5 });
    expect(events).toHaveLength(5);
    expect(events[0].eventId).toBe("evt_5");
  });

  it("applies limit + offset together", async () => {
    const events = await store.getEvents("sub_1", { limit: 3, offset: 2 });
    expect(events).toHaveLength(3);
    expect(events[0].eventId).toBe("evt_2");
    expect(events[2].eventId).toBe("evt_4");
  });

  it("handles offset beyond total count", async () => {
    const events = await store.getEvents("sub_1", { offset: 20 });
    expect(events).toHaveLength(0);
  });

  it("handles limit of 0", async () => {
    const events = await store.getEvents("sub_1", { limit: 0 });
    expect(events).toHaveLength(0);
  });

  it("combines pagination with content filters", async () => {
    // Add events with different types
    await store.appendEvent({
      eventId: "evt_created",
      type: "submission.created",
      submissionId: "sub_1",
      ts: new Date(2024, 0, 2).toISOString(),
      actor: testActor,
      state: "draft",
      payload: {},
    });

    const events = await store.getEvents("sub_1", {
      types: ["field.updated"],
      limit: 5,
      offset: 0,
    });
    expect(events).toHaveLength(5);
    expect(events.every((e) => e.type === "field.updated")).toBe(true);
  });
});

// ---------- Hono Route Pagination Tests ----------

describe("Hono Event Route pagination", () => {
  let app: Hono;
  let manager: SubmissionManager;
  let submissionId: string;

  beforeEach(async () => {
    const store = new TestStore();
    const emitter = new TestEmitter();
    const eventStore = new InMemoryEventStore();
    manager = new SubmissionManager(
      store, emitter, undefined, "http://localhost:3000", undefined, eventStore
    );

    app = new Hono();
    app.route("/", createHonoEventRouter(manager));

    // Create submission and add multiple events
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });
    submissionId = sub.submissionId;

    // Add more events via setFields
    let token = sub.resumeToken;
    for (let i = 0; i < 5; i++) {
      const result = await manager.setFields({
        submissionId,
        resumeToken: token,
        actor: testActor,
        fields: { [`field_${i}`]: `value_${i}` },
      });
      if (result.ok) {
        token = result.resumeToken;
      }
    }
  });

  it("returns pagination metadata with defaults", async () => {
    const res = await app.request(`/submissions/${submissionId}/events`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pagination).toBeDefined();
    expect(data.pagination.offset).toBe(0);
    expect(data.pagination.limit).toBe(100);
    expect(data.pagination.total).toBeGreaterThan(0);
    expect(typeof data.pagination.hasMore).toBe("boolean");
  });

  it("respects limit query parameter", async () => {
    const res = await app.request(
      `/submissions/${submissionId}/events?limit=2`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(2);
    expect(data.pagination.limit).toBe(2);
    expect(data.pagination.hasMore).toBe(true);
  });

  it("respects offset query parameter", async () => {
    const res = await app.request(
      `/submissions/${submissionId}/events?offset=1`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pagination.offset).toBe(1);
    // Should have total - 1 events
    expect(data.events.length).toBe(data.pagination.total - 1);
  });

  it("respects limit + offset together", async () => {
    const res = await app.request(
      `/submissions/${submissionId}/events?limit=2&offset=1`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(2);
    expect(data.pagination.offset).toBe(1);
    expect(data.pagination.limit).toBe(2);
    expect(data.pagination.hasMore).toBe(true);
  });

  it("hasMore is false when all events returned", async () => {
    const res = await app.request(
      `/submissions/${submissionId}/events?limit=1000`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pagination.hasMore).toBe(false);
  });
});
