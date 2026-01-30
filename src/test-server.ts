/**
 * Test HTTP Server
 * Simple server for testing HTTP endpoints during development
 */

import express from "express";
import { SubmissionManager } from "./core/submission-manager";
import { createSubmissionRoutes } from "./routes/submissions";

// Mock store and event emitter for testing
class MockStore {
  private submissions = new Map<string, any>();

  async get(submissionId: string) {
    return this.submissions.get(submissionId) || null;
  }

  async save(submission: any) {
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
  async emit(event: any) {
    console.log("Event emitted:", event.type);
  }
}

// Create test server
const app = express();
app.use(express.json());

const store = new MockStore();
const eventEmitter = new MockEventEmitter();
const manager = new SubmissionManager(store, eventEmitter, undefined, "http://localhost:3000");

// Setup routes
const routes = createSubmissionRoutes(manager);
app.post("/submissions/:id/handoff", routes.generateHandoff);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Test endpoint: POST http://localhost:${PORT}/submissions/sub_test/handoff`);
});
