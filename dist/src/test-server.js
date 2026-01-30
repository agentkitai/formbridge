import express from "express";
import { SubmissionManager } from "./core/submission-manager";
import { createSubmissionRoutes } from "./routes/submissions";
import { createEventRoutes } from "./routes/events";
class MockStore {
    submissions = new Map();
    async get(submissionId) {
        return this.submissions.get(submissionId) || null;
    }
    async save(submission) {
        this.submissions.set(submission.id, submission);
    }
    async getByResumeToken(resumeToken) {
        for (const sub of this.submissions.values()) {
            if (sub.resumeToken === resumeToken) {
                return sub;
            }
        }
        return null;
    }
}
class MockEventEmitter {
    async emit(event) {
        console.log("Event emitted:", event.type);
    }
}
const app = express();
app.use(express.json());
const store = new MockStore();
const eventEmitter = new MockEventEmitter();
const manager = new SubmissionManager(store, eventEmitter, "http://localhost:3000");
const routes = createSubmissionRoutes(manager);
app.post("/submissions/:id/handoff", routes.generateHandoff);
const eventRoutes = createEventRoutes(manager);
app.get("/submissions/:id/events", eventRoutes.getEvents);
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Test server running on http://localhost:${PORT}`);
    console.log(`Test endpoint: POST http://localhost:${PORT}/submissions/sub_test/handoff`);
});
//# sourceMappingURL=test-server.js.map