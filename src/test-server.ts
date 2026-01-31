/**
 * Test HTTP Server
 * Simple Hono server for testing HTTP endpoints during development
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { SubmissionManager } from "./core/submission-manager.js";
import { ApprovalManager } from "./core/approval-manager.js";
import { InMemoryEventStore } from "./core/event-store.js";
import { createHonoSubmissionRouter } from "./routes/hono-submissions.js";
import { createHonoEventRouter } from "./routes/hono-events.js";
import { createHonoApprovalRouter } from "./routes/hono-approvals.js";
import type { Submission } from "./types.js";
import type { IntakeEvent } from "./types/intake-contract.js";

// Mock store for testing
class MockStore {
  private submissions = new Map<string, Submission>();

  async get(submissionId: string) {
    return this.submissions.get(submissionId) || null;
  }

  async save(submission: Submission) {
    this.submissions.set(submission.id, submission);
  }

  async getByResumeToken(resumeToken: string) {
    for (const sub of this.submissions.values()) {
      if (sub.resumeToken === resumeToken) {
        return sub;
      }
    }
    return null;
  }
}

class MockEventEmitter {
  async emit(event: IntakeEvent) {
    console.log("Event emitted:", event.type);
  }
}

// Create test app
const app = new Hono();

const store = new MockStore();
const eventEmitter = new MockEventEmitter();
const eventStore = new InMemoryEventStore();
const manager = new SubmissionManager(
  store,
  eventEmitter,
  undefined,
  "http://localhost:3000",
  undefined,
  eventStore
);
const approvalManager = new ApprovalManager(store, eventEmitter);

// Mount routes
app.route("/", createHonoSubmissionRouter(manager));
app.route("/", createHonoEventRouter(manager));
app.route("/", createHonoApprovalRouter(approvalManager));

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const PORT = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  console.log(`Test endpoint: POST http://localhost:${PORT}/submissions/sub_test/handoff`);
});

export default app;
