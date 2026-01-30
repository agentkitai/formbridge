/**
 * Approval Routes Tests
 * Verify HTTP endpoint handlers for approval operations
 */

import { describe, it, expect, vi } from "vitest";
import { createApprovalRoutes } from "../approvals";
import type { ApprovalManager } from "../../core/approval-manager";
import {
  SubmissionNotFoundError,
  InvalidResumeTokenError,
} from "../../core/approval-manager";
import type { IntakeError } from "../../types/intake-contract";

describe("Approval Routes", () => {
  describe("POST /submissions/:id/approve", () => {
    it("should approve a submission successfully", async () => {
      const mockManager = {
        approve: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "approved",
          resumeToken: "rtok_abc123",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          actor: {
            kind: "human",
            id: "reviewer_1",
            name: "Test Reviewer",
          },
          comment: "Looks good!",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.approve).toHaveBeenCalledWith({
        submissionId: "sub_test123",
        resumeToken: "rtok_abc123",
        actor: mockReq.body.actor,
        comment: "Looks good!",
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        submissionId: "sub_test123",
        state: "approved",
        resumeToken: "rtok_abc123",
      });
    });

    it("should use default human actor when no actor provided", async () => {
      const mockManager = {
        approve: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "approved",
          resumeToken: "rtok_abc123",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.approve).toHaveBeenCalledWith({
        submissionId: "sub_test123",
        resumeToken: "rtok_abc123",
        actor: {
          kind: "human",
          id: "human-reviewer",
          name: "Human Reviewer",
        },
        comment: undefined,
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 when submission ID is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: {},
        body: { resumeToken: "rtok_abc123" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing submission ID",
      });
    });

    it("should return 400 when resumeToken is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing resumeToken in request body",
      });
    });

    it("should return 404 when submission not found", async () => {
      const mockManager = {
        approve: vi
          .fn()
          .mockRejectedValue(new SubmissionNotFoundError("sub_notfound")),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_notfound" },
        body: { resumeToken: "rtok_abc123" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Submission not found: sub_notfound",
      });
    });

    it("should return 403 when resume token is invalid", async () => {
      const mockManager = {
        approve: vi.fn().mockRejectedValue(new InvalidResumeTokenError()),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { resumeToken: "invalid_token" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid resume token",
      });
    });

    it("should return 409 when submission is in wrong state", async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: "sub_test123",
        state: "approved",
        resumeToken: "rtok_abc123",
        error: {
          type: "conflict",
          message: "Cannot approve submission in state 'approved'",
          retryable: false,
        },
      };

      const mockManager = {
        approve: vi.fn().mockResolvedValue(errorResponse),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { resumeToken: "rtok_abc123" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(errorResponse);
    });

    it("should return 400 when actor is invalid", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          actor: {
            kind: "invalid_kind",
            id: "test",
          },
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalled();
      const errorCall = mockRes.json.mock.calls[0][0];
      expect(errorCall.error).toContain("Invalid actor");
    });

    it("should pass unknown errors to next middleware", async () => {
      const unknownError = new Error("Database connection failed");

      const mockManager = {
        approve: vi.fn().mockRejectedValue(unknownError),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { resumeToken: "rtok_abc123" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.approve(mockReq as any, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(unknownError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe("POST /submissions/:id/reject", () => {
    it("should reject a submission successfully", async () => {
      const mockManager = {
        reject: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "rejected",
          resumeToken: "rtok_abc123",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          actor: {
            kind: "human",
            id: "reviewer_1",
            name: "Test Reviewer",
          },
          reason: "Does not meet requirements",
          comment: "Please revise and resubmit",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.reject).toHaveBeenCalledWith({
        submissionId: "sub_test123",
        resumeToken: "rtok_abc123",
        actor: mockReq.body.actor,
        reason: "Does not meet requirements",
        comment: "Please revise and resubmit",
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        submissionId: "sub_test123",
        state: "rejected",
        resumeToken: "rtok_abc123",
      });
    });

    it("should use default human actor when no actor provided", async () => {
      const mockManager = {
        reject: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "rejected",
          resumeToken: "rtok_abc123",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          reason: "Invalid data",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.reject).toHaveBeenCalledWith({
        submissionId: "sub_test123",
        resumeToken: "rtok_abc123",
        actor: {
          kind: "human",
          id: "human-reviewer",
          name: "Human Reviewer",
        },
        reason: "Invalid data",
        comment: undefined,
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 when submission ID is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: {},
        body: { resumeToken: "rtok_abc123", reason: "Bad data" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing submission ID",
      });
    });

    it("should return 400 when resumeToken is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { reason: "Bad data" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing resumeToken in request body",
      });
    });

    it("should return 400 when reason is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { resumeToken: "rtok_abc123" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing reason in request body (required for rejection)",
      });
    });

    it("should return 404 when submission not found", async () => {
      const mockManager = {
        reject: vi
          .fn()
          .mockRejectedValue(new SubmissionNotFoundError("sub_notfound")),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_notfound" },
        body: { resumeToken: "rtok_abc123", reason: "Bad data" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Submission not found: sub_notfound",
      });
    });

    it("should return 403 when resume token is invalid", async () => {
      const mockManager = {
        reject: vi.fn().mockRejectedValue(new InvalidResumeTokenError()),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { resumeToken: "invalid_token", reason: "Bad data" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid resume token",
      });
    });

    it("should return 409 when submission is in wrong state", async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: "sub_test123",
        state: "approved",
        resumeToken: "rtok_abc123",
        error: {
          type: "conflict",
          message: "Cannot reject submission in state 'approved'",
          retryable: false,
        },
      };

      const mockManager = {
        reject: vi.fn().mockResolvedValue(errorResponse),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { resumeToken: "rtok_abc123", reason: "Bad data" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(errorResponse);
    });

    it("should pass unknown errors to next middleware", async () => {
      const unknownError = new Error("Database connection failed");

      const mockManager = {
        reject: vi.fn().mockRejectedValue(unknownError),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: { resumeToken: "rtok_abc123", reason: "Bad data" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.reject(mockReq as any, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(unknownError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe("POST /submissions/:id/request-changes", () => {
    it("should request changes successfully", async () => {
      const mockManager = {
        requestChanges: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "draft",
          resumeToken: "rtok_abc123",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          actor: {
            kind: "human",
            id: "reviewer_1",
            name: "Test Reviewer",
          },
          fieldComments: [
            {
              fieldPath: "email",
              comment: "Please use a company email",
              suggestedValue: "user@company.com",
            },
          ],
          comment: "Please update the email field",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.requestChanges).toHaveBeenCalledWith({
        submissionId: "sub_test123",
        resumeToken: "rtok_abc123",
        actor: mockReq.body.actor,
        fieldComments: mockReq.body.fieldComments,
        comment: "Please update the email field",
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        submissionId: "sub_test123",
        state: "draft",
        resumeToken: "rtok_abc123",
      });
    });

    it("should use default human actor when no actor provided", async () => {
      const mockManager = {
        requestChanges: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "draft",
          resumeToken: "rtok_abc123",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          fieldComments: [
            {
              fieldPath: "email",
              comment: "Fix this",
            },
          ],
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.requestChanges).toHaveBeenCalledWith({
        submissionId: "sub_test123",
        resumeToken: "rtok_abc123",
        actor: {
          kind: "human",
          id: "human-reviewer",
          name: "Human Reviewer",
        },
        fieldComments: mockReq.body.fieldComments,
        comment: undefined,
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 when submission ID is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: {},
        body: {
          resumeToken: "rtok_abc123",
          fieldComments: [],
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing submission ID",
      });
    });

    it("should return 400 when resumeToken is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          fieldComments: [],
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing resumeToken in request body",
      });
    });

    it("should return 400 when fieldComments is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing or invalid fieldComments in request body (required array)",
      });
    });

    it("should return 400 when fieldComments is not an array", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          fieldComments: "not an array",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing or invalid fieldComments in request body (required array)",
      });
    });

    it("should return 404 when submission not found", async () => {
      const mockManager = {
        requestChanges: vi
          .fn()
          .mockRejectedValue(new SubmissionNotFoundError("sub_notfound")),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_notfound" },
        body: {
          resumeToken: "rtok_abc123",
          fieldComments: [],
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Submission not found: sub_notfound",
      });
    });

    it("should return 403 when resume token is invalid", async () => {
      const mockManager = {
        requestChanges: vi.fn().mockRejectedValue(new InvalidResumeTokenError()),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "invalid_token",
          fieldComments: [],
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid resume token",
      });
    });

    it("should return 409 when submission is in wrong state", async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: "sub_test123",
        state: "approved",
        resumeToken: "rtok_abc123",
        error: {
          type: "conflict",
          message: "Cannot request changes on submission in state 'approved'",
          retryable: false,
        },
      };

      const mockManager = {
        requestChanges: vi.fn().mockResolvedValue(errorResponse),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          fieldComments: [],
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(errorResponse);
    });

    it("should pass unknown errors to next middleware", async () => {
      const unknownError = new Error("Database connection failed");

      const mockManager = {
        requestChanges: vi.fn().mockRejectedValue(unknownError),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_abc123",
          fieldComments: [],
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.requestChanges(mockReq as any, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(unknownError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
