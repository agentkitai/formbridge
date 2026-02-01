/**
 * Comprehensive tests for Hono approval route handlers
 *
 * Tests all approval endpoints with coverage for all error conditions:
 * - POST /submissions/:id/approve
 * - POST /submissions/:id/reject  
 * - POST /submissions/:id/request-changes
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { createHonoApprovalRouter } from "../../src/routes/hono-approvals.js";
import type { ApprovalManager } from "../../src/core/approval-manager.js";
import { SubmissionNotFoundError, InvalidResumeTokenError } from "../../src/core/approval-manager.js";
import type { Actor, IntakeError } from "../../src/types/intake-contract.js";
import type { SubmissionState } from "../../src/types/intake-contract.js";

// ---------- Test Helpers ----------

const testActor: Actor = { kind: "human", id: "reviewer-1", name: "Test Reviewer" };

function createMockApprovalManager(): ApprovalManager {
  return {
    approve: vi.fn(),
    reject: vi.fn(),
    requestChanges: vi.fn(),
    notifyReviewers: vi.fn(),
  } as any;
}

function createConflictError(state: SubmissionState): IntakeError {
  return {
    ok: false,
    submissionId: "sub_123",
    state,
    resumeToken: "rtok_123",
    error: {
      type: "conflict",
      message: `Cannot perform action on submission in state '${state}'`,
      retryable: false,
    },
  };
}

function createSuccessResponse(state: SubmissionState) {
  return {
    ok: true,
    submissionId: "sub_123",
    state,
    resumeToken: "rtok_123",
  };
}

// ---------- Tests ----------

describe("Hono Approval Routes", () => {
  let app: Hono;
  let mockManager: ApprovalManager;

  beforeEach(() => {
    mockManager = createMockApprovalManager();
    app = new Hono();
    app.route("/", createHonoApprovalRouter(mockManager));
  });

  describe("POST /submissions/:id/approve", () => {
    it("returns 400 when resumeToken is missing", async () => {
      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: testActor,
          comment: "Looks good",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Missing resumeToken");
      expect(mockManager.approve).not.toHaveBeenCalled();
    });

    it("returns 400 when actor is invalid", async () => {
      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: { kind: "invalid" }, // Invalid actor
          comment: "Looks good",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Invalid actor");
      expect(mockManager.approve).not.toHaveBeenCalled();
    });

    it("returns 404 when submission is not found", async () => {
      vi.mocked(mockManager.approve).mockRejectedValueOnce(
        new SubmissionNotFoundError("sub_123")
      );

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          comment: "Looks good",
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("not_found");
      expect(mockManager.approve).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: testActor,
        comment: "Looks good",
      });
    });

    it("returns 403 when resume token is invalid", async () => {
      vi.mocked(mockManager.approve).mockRejectedValueOnce(
        new InvalidResumeTokenError()
      );

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "invalid_token",
          actor: testActor,
          comment: "Looks good",
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_resume_token");
    });

    it("returns 409 when submission is in wrong state (conflict)", async () => {
      vi.mocked(mockManager.approve).mockResolvedValueOnce(
        createConflictError("approved")
      );

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          comment: "Looks good",
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("conflict");
    });

    it("returns 200 on successful approval", async () => {
      vi.mocked(mockManager.approve).mockResolvedValueOnce(
        createSuccessResponse("approved")
      );

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          comment: "Looks good",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.state).toBe("approved");
      expect(data.submissionId).toBe("sub_123");
      expect(data.resumeToken).toBe("rtok_123");
    });

    it("works without optional comment", async () => {
      vi.mocked(mockManager.approve).mockResolvedValueOnce(
        createSuccessResponse("approved")
      );

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          // No comment
        }),
      });

      expect(res.status).toBe(200);
      expect(mockManager.approve).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: testActor,
        comment: undefined,
      });
    });

    it("uses default actor when actor is missing", async () => {
      vi.mocked(mockManager.approve).mockResolvedValueOnce(
        createSuccessResponse("approved")
      );

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          // No actor provided - should use default
        }),
      });

      expect(res.status).toBe(200);
      expect(mockManager.approve).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: {
          kind: "human",
          id: "human-reviewer",
          name: "Human Reviewer",
        },
        comment: undefined,
      });
    });
  });

  describe("POST /submissions/:id/reject", () => {
    it("returns 400 when resumeToken is missing", async () => {
      const res = await app.request("/submissions/sub_123/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: testActor,
          reason: "Incomplete data",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Missing resumeToken");
      expect(mockManager.reject).not.toHaveBeenCalled();
    });

    it("returns 400 when reason is missing", async () => {
      const res = await app.request("/submissions/sub_123/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          // No reason
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Missing reason");
      expect(mockManager.reject).not.toHaveBeenCalled();
    });

    it("returns 404 when submission is not found", async () => {
      vi.mocked(mockManager.reject).mockRejectedValueOnce(
        new SubmissionNotFoundError("sub_123")
      );

      const res = await app.request("/submissions/sub_123/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          reason: "Incomplete data",
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("not_found");
    });

    it("returns 403 when resume token is invalid", async () => {
      vi.mocked(mockManager.reject).mockRejectedValueOnce(
        new InvalidResumeTokenError()
      );

      const res = await app.request("/submissions/sub_123/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "invalid_token",
          actor: testActor,
          reason: "Incomplete data",
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_resume_token");
    });

    it("returns 200 on successful rejection", async () => {
      vi.mocked(mockManager.reject).mockResolvedValueOnce(
        createSuccessResponse("rejected")
      );

      const res = await app.request("/submissions/sub_123/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          reason: "Incomplete data",
          comment: "Missing required fields",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.state).toBe("rejected");
      expect(mockManager.reject).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: testActor,
        reason: "Incomplete data",
        comment: "Missing required fields",
      });
    });

    it("works without optional comment", async () => {
      vi.mocked(mockManager.reject).mockResolvedValueOnce(
        createSuccessResponse("rejected")
      );

      const res = await app.request("/submissions/sub_123/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          reason: "Incomplete data",
          // No comment
        }),
      });

      expect(res.status).toBe(200);
      expect(mockManager.reject).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: testActor,
        reason: "Incomplete data",
        comment: undefined,
      });
    });
  });

  describe("POST /submissions/:id/request-changes", () => {
    const validFieldComments = [
      { fieldPath: "name", comment: "Please provide full name" },
      { fieldPath: "email", comment: "Invalid email format" },
    ];

    it("returns 400 when resumeToken is missing", async () => {
      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: testActor,
          fieldComments: validFieldComments,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Missing resumeToken");
      expect(mockManager.requestChanges).not.toHaveBeenCalled();
    });

    it("returns 400 when fieldComments is missing", async () => {
      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          // No fieldComments
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Missing or invalid fieldComments");
      expect(mockManager.requestChanges).not.toHaveBeenCalled();
    });

    it("returns 400 when fieldComments is not an array", async () => {
      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          fieldComments: "not an array",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Missing or invalid fieldComments");
    });

    it("returns 400 when fieldComments is null", async () => {
      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          fieldComments: null,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_request");
      expect(data.error.message).toContain("Missing or invalid fieldComments");
    });

    it("returns 404 when submission is not found", async () => {
      vi.mocked(mockManager.requestChanges).mockRejectedValueOnce(
        new SubmissionNotFoundError("sub_123")
      );

      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          fieldComments: validFieldComments,
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("not_found");
    });

    it("returns 403 when resume token is invalid", async () => {
      vi.mocked(mockManager.requestChanges).mockRejectedValueOnce(
        new InvalidResumeTokenError()
      );

      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "invalid_token",
          actor: testActor,
          fieldComments: validFieldComments,
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("invalid_resume_token");
    });

    it("returns 200 on successful request for changes", async () => {
      vi.mocked(mockManager.requestChanges).mockResolvedValueOnce(
        createSuccessResponse("draft")
      );

      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          fieldComments: validFieldComments,
          comment: "Please fix these issues",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.state).toBe("draft");
      expect(mockManager.requestChanges).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: testActor,
        fieldComments: validFieldComments,
        comment: "Please fix these issues",
      });
    });

    it("works without optional comment", async () => {
      vi.mocked(mockManager.requestChanges).mockResolvedValueOnce(
        createSuccessResponse("draft")
      );

      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          fieldComments: validFieldComments,
          // No comment
        }),
      });

      expect(res.status).toBe(200);
      expect(mockManager.requestChanges).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: testActor,
        fieldComments: validFieldComments,
        comment: undefined,
      });
    });

    it("accepts empty array for fieldComments", async () => {
      vi.mocked(mockManager.requestChanges).mockResolvedValueOnce(
        createSuccessResponse("draft")
      );

      const res = await app.request("/submissions/sub_123/request-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
          fieldComments: [], // Empty but valid array
        }),
      });

      expect(res.status).toBe(200);
      expect(mockManager.requestChanges).toHaveBeenCalledWith({
        submissionId: "sub_123",
        resumeToken: "rtok_123",
        actor: testActor,
        fieldComments: [],
        comment: undefined,
      });
    });
  });

  describe("Error handling consistency", () => {
    it("all error responses follow unified error envelope format", async () => {
      // Test 404 error format
      vi.mocked(mockManager.approve).mockRejectedValueOnce(
        new SubmissionNotFoundError("sub_123")
      );

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
        }),
      });

      const data = await res.json();
      expect(data).toHaveProperty("ok", false);
      expect(data).toHaveProperty("error");
      expect(data.error).toHaveProperty("type");
      expect(data.error).toHaveProperty("message");
      expect(typeof data.error.type).toBe("string");
      expect(typeof data.error.message).toBe("string");
    });

    it("handles unexpected errors with 500 status", async () => {
      const unexpectedError = new Error("Unexpected database error");
      vi.mocked(mockManager.approve).mockRejectedValueOnce(unexpectedError);

      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
        }),
      });

      // Hono should catch the unexpected error and return 500
      expect(res.status).toBe(500);
    });
  });

  describe("Edge cases", () => {
    it("handles missing submission ID in URL", async () => {
      const res = await app.request("/submissions//approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: "rtok_123",
          actor: testActor,
        }),
      });

      // This should result in a route not found or similar error
      expect(res.status).not.toBe(200);
    });

    it("handles malformed JSON body", async () => {
      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      // Hono should catch the JSON parsing error and return 400 or 500
      expect([400, 500]).toContain(res.status);
    });

    it("handles empty request body", async () => {
      const res = await app.request("/submissions/sub_123/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("Missing resumeToken");
    });
  });
});