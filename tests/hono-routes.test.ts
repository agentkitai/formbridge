/**
 * Integration tests for Hono route modules
 *
 * Tests the new Hono route layer: submissions, events, approvals, and submit endpoint.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createHonoSubmissionRouter } from "../src/routes/hono-submissions.js";
import { createHonoEventRouter } from "../src/routes/hono-events.js";
import { createHonoApprovalRouter } from "../src/routes/hono-approvals.js";
import { SubmissionManager } from "../src/core/submission-manager.js";
import { ApprovalManager } from "../src/core/approval-manager.js";
import { InMemoryEventStore } from "../src/core/event-store.js";
import type { Submission } from "../src/submission-types.js";
import type { IntakeEvent } from "../src/types/intake-contract.js";

// ---------- Test Helpers ----------

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

class TestRegistry {
  private intakes = new Map<string, { approvalGates?: unknown[] }>();
  register(id: string, gates?: unknown[]) {
    this.intakes.set(id, { approvalGates: gates });
  }
  getIntake(id: string) {
    const intake = this.intakes.get(id);
    if (!intake) throw new Error(`Intake not found: ${id}`);
    return intake;
  }
}

const testActor = { kind: "agent" as const, id: "test-agent", name: "Test Agent" };

// ---------- Tests ----------

describe("Hono Submission Routes", () => {
  let app: Hono;
  let manager: SubmissionManager;
  let store: TestStore;

  beforeEach(() => {
    store = new TestStore();
    const emitter = new TestEmitter();
    const eventStore = new InMemoryEventStore();
    manager = new SubmissionManager(store, emitter, undefined, "http://localhost:3000", undefined, eventStore);

    app = new Hono();
    app.route("/", createHonoSubmissionRouter(manager));
  });

  it("POST /submissions/:id/handoff returns resume URL", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    const res = await app.request(`/submissions/${sub.submissionId}/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: testActor }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resumeUrl).toContain("token=");
    expect(data.submissionId).toBe(sub.submissionId);
  });

  it("POST /submissions/:id/handoff returns 404 for unknown submission", async () => {
    const res = await app.request("/submissions/unknown/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.type).toBe("not_found");
  });

  it("GET /submissions/resume/:token returns submission data", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    const res = await app.request(`/submissions/resume/${sub.resumeToken}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(sub.submissionId);
    expect(data.state).toBe("draft");
  });

  it("GET /submissions/resume/:token returns 404 for invalid token", async () => {
    const res = await app.request("/submissions/resume/invalid-token");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("POST /submissions/resume/:token/resumed emits event", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    const res = await app.request(
      `/submissions/resume/${sub.resumeToken}/resumed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: { kind: "human", id: "user-1", name: "User" },
        }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.eventId).toBeDefined();
  });
});

describe("Hono Submit Endpoint", () => {
  let app: Hono;
  let manager: SubmissionManager;

  beforeEach(() => {
    const store = new TestStore();
    const emitter = new TestEmitter();
    const eventStore = new InMemoryEventStore();
    manager = new SubmissionManager(store, emitter, undefined, "http://localhost:3000", undefined, eventStore);

    app = new Hono();
    app.route("/", createHonoSubmissionRouter(manager));
  });

  it("POST /intake/:intakeId/submissions/:submissionId/submit submits successfully", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    const res = await app.request(
      `/intake/test-intake/submissions/${sub.submissionId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: sub.resumeToken,
          actor: testActor,
        }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.state).toBe("submitted");
  });

  it("POST submit returns 400 without resumeToken", async () => {
    const res = await app.request(
      "/intake/test-intake/submissions/sub_123/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: testActor }),
      }
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.type).toBe("invalid_request");
  });

  it("POST submit returns 404 for unknown submission", async () => {
    const res = await app.request(
      "/intake/test-intake/submissions/sub_unknown/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_invalid",
          actor: testActor,
        }),
      }
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.type).toBe("not_found");
  });

  it("POST submit with approval gate returns 202", async () => {
    const registry = new TestRegistry();
    registry.register("gated-intake", [{ type: "manual" }]);

    const store = new TestStore();
    const emitter = new TestEmitter();
    const eventStore = new InMemoryEventStore();
    const mgr = new SubmissionManager(store, emitter, registry, "http://localhost:3000", undefined, eventStore);

    const a = new Hono();
    a.route("/", createHonoSubmissionRouter(mgr));

    const sub = await mgr.createSubmission({
      intakeId: "gated-intake",
      actor: testActor,
    });

    const res = await a.request(
      `/intake/gated-intake/submissions/${sub.submissionId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: sub.resumeToken,
          actor: testActor,
        }),
      }
    );

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.state).toBe("needs_review");
  });
});

describe("Hono Event Routes", () => {
  let app: Hono;
  let manager: SubmissionManager;

  beforeEach(() => {
    const store = new TestStore();
    const emitter = new TestEmitter();
    const eventStore = new InMemoryEventStore();
    manager = new SubmissionManager(store, emitter, undefined, "http://localhost:3000", undefined, eventStore);

    app = new Hono();
    app.route("/", createHonoEventRouter(manager));
  });

  it("GET /submissions/:id/events returns events", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    const res = await app.request(`/submissions/${sub.submissionId}/events`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submissionId).toBe(sub.submissionId);
    expect(data.events).toBeInstanceOf(Array);
    expect(data.events.length).toBeGreaterThanOrEqual(1);
    expect(data.events[0].type).toBe("submission.created");
  });

  it("GET /submissions/:id/events with type filter", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    // Set fields to generate additional events
    await manager.setFields({
      submissionId: sub.submissionId,
      resumeToken: sub.resumeToken,
      actor: testActor,
      fields: { name: "test" },
    });

    const res = await app.request(
      `/submissions/${sub.submissionId}/events?type=field.updated`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events.every((e: any) => e.type === "field.updated")).toBe(true);
  });

  it("GET /submissions/:id/events returns 404 for unknown", async () => {
    const res = await app.request("/submissions/unknown/events");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.type).toBe("not_found");
  });

  it("GET /submissions/:id/events/export returns JSONL", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    const res = await app.request(
      `/submissions/${sub.submissionId}/events/export`
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
  });

  it("GET /submissions/:id/events/export?format=json returns JSON", async () => {
    const sub = await manager.createSubmission({
      intakeId: "test-intake",
      actor: testActor,
    });

    const res = await app.request(
      `/submissions/${sub.submissionId}/events/export?format=json`
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("Hono Approval Routes", () => {
  let app: Hono;
  let store: TestStore;
  let approvalManager: ApprovalManager;
  let submissionManager: SubmissionManager;

  beforeEach(() => {
    store = new TestStore();
    const emitter = new TestEmitter();
    const registry = new TestRegistry();
    registry.register("approval-intake", [{ type: "manual" }]);
    const eventStore = new InMemoryEventStore();
    submissionManager = new SubmissionManager(store, emitter, registry, "http://localhost:3000", undefined, eventStore);
    approvalManager = new ApprovalManager(store, emitter);

    app = new Hono();
    app.route("/", createHonoSubmissionRouter(submissionManager));
    app.route("/", createHonoApprovalRouter(approvalManager));
  });

  async function createReviewSubmission() {
    const sub = await submissionManager.createSubmission({
      intakeId: "approval-intake",
      actor: testActor,
    });
    // Submit to trigger needs_review
    const _result = await submissionManager.submit({
      submissionId: sub.submissionId,
      resumeToken: sub.resumeToken,
      actor: testActor,
    });
    // Get current submission state
    const submission = await store.get(sub.submissionId);
    return { submissionId: sub.submissionId, resumeToken: submission!.resumeToken };
  }

  it("POST /submissions/:id/approve works", async () => {
    const { submissionId, resumeToken } = await createReviewSubmission();

    const res = await app.request(`/submissions/${submissionId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeToken,
        actor: { kind: "human", id: "reviewer-1" },
        comment: "Looks good",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.state).toBe("approved");
  });

  it("POST /submissions/:id/reject works", async () => {
    const { submissionId, resumeToken } = await createReviewSubmission();

    const res = await app.request(`/submissions/${submissionId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeToken,
        actor: { kind: "human", id: "reviewer-1" },
        reason: "Incomplete data",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.state).toBe("rejected");
  });

  it("POST /submissions/:id/request-changes works", async () => {
    const { submissionId, resumeToken } = await createReviewSubmission();

    const res = await app.request(
      `/submissions/${submissionId}/request-changes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken,
          actor: { kind: "human", id: "reviewer-1" },
          fieldComments: [
            { fieldPath: "name", comment: "Please provide full name" },
          ],
        }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.state).toBe("draft");
  });

  it("POST /submissions/:id/approve returns 400 without resumeToken", async () => {
    const res = await app.request("/submissions/sub_123/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: { kind: "human", id: "r1" } }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("POST /submissions/:id/reject returns 400 without reason", async () => {
    const res = await app.request("/submissions/sub_123/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeToken: "rtok_123",
        actor: { kind: "human", id: "r1" },
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("POST /submissions/:id/approve returns 409 for wrong state", async () => {
    // Create a draft submission (not in needs_review)
    const sub = await submissionManager.createSubmission({
      intakeId: "approval-intake",
      actor: testActor,
    });

    const res = await app.request(`/submissions/${sub.submissionId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeToken: sub.resumeToken,
        actor: { kind: "human", id: "reviewer-1" },
      }),
    });

    expect(res.status).toBe(409);
  });

  it("All error responses use unified Hono envelope", async () => {
    const res = await app.request("/submissions/unknown/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeToken: "rtok_fake",
        actor: { kind: "human", id: "r1" },
      }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty("ok", false);
    expect(data).toHaveProperty("error");
    expect(data.error).toHaveProperty("type");
    expect(data.error).toHaveProperty("message");
  });
});
