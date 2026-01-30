/**
 * Submission Routes Tests
 * Verify HTTP endpoint handlers for submission operations
 */

import { describe, it, expect, vi } from "vitest";
import { createSubmissionRoutes } from "../submissions";
import type { SubmissionManager } from "../../core/submission-manager";
import {
  SubmissionNotFoundError,
  SubmissionExpiredError,
} from "../../core/submission-manager";
import type { Submission } from "../../types";

describe("Submission Routes", () => {
  describe("POST /submissions/:id/handoff", () => {
    it("should generate handoff URL for existing submission", async () => {
      // Mock submission
      const mockSubmission: Submission = {
        id: "sub_test123",
        intakeId: "intake_test",
        state: "in_progress",
        resumeToken: "rtok_abc123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: { name: "Test" },
        fieldAttribution: {},
        createdBy: { kind: "agent", id: "agent_1", name: "Agent" },
        updatedBy: { kind: "agent", id: "agent_1", name: "Agent" },
        events: [],
      };

      // Mock SubmissionManager
      const mockManager = {
        generateHandoffUrl: vi.fn().mockResolvedValue("http://localhost:3000/resume?token=rtok_abc123"),
        getSubmission: vi.fn().mockResolvedValue(mockSubmission),
      } as unknown as SubmissionManager;

      // Create routes
      const routes = createSubmissionRoutes(mockManager);

      // Mock Express request and response
      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          actor: {
            kind: "agent",
            id: "agent_1",
            name: "Test Agent",
          },
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      // Call the handler
      await routes.generateHandoff(mockReq as any, mockRes as any, mockNext);

      // Verify generateHandoffUrl was called with correct params
      expect(mockManager.generateHandoffUrl).toHaveBeenCalledWith(
        "sub_test123",
        mockReq.body.actor
      );

      // Verify response
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        resumeUrl: "http://localhost:3000/resume?token=rtok_abc123",
        submissionId: "sub_test123",
        resumeToken: "rtok_abc123",
      });
    });

    it("should use system actor when no actor provided in request", async () => {
      const mockSubmission: Submission = {
        id: "sub_test123",
        intakeId: "intake_test",
        state: "in_progress",
        resumeToken: "rtok_abc123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: {},
        fieldAttribution: {},
        createdBy: { kind: "system", id: "system", name: "System" },
        updatedBy: { kind: "system", id: "system", name: "System" },
        events: [],
      };

      const mockManager = {
        generateHandoffUrl: vi.fn().mockResolvedValue("http://localhost:3000/resume?token=rtok_abc123"),
        getSubmission: vi.fn().mockResolvedValue(mockSubmission),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {}, // No actor provided
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.generateHandoff(mockReq as any, mockRes as any, mockNext);

      // Verify system actor was used
      expect(mockManager.generateHandoffUrl).toHaveBeenCalledWith(
        "sub_test123",
        {
          kind: "system",
          id: "system",
          name: "System",
        }
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should return 404 when submission not found", async () => {
      const mockManager = {
        generateHandoffUrl: vi.fn().mockRejectedValue(new SubmissionNotFoundError("sub_notfound")),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_notfound" },
        body: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.generateHandoff(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Submission not found: sub_notfound",
      });
    });

    it("should return 400 when submission ID is missing", async () => {
      const mockManager = {} as unknown as SubmissionManager;
      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: {}, // No id
        body: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.generateHandoff(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing submission ID",
      });
    });

    it("should pass unknown errors to next middleware", async () => {
      const unknownError = new Error("Database connection failed");

      const mockManager = {
        generateHandoffUrl: vi.fn().mockRejectedValue(unknownError),
        getSubmission: vi.fn().mockResolvedValue(null),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.generateHandoff(mockReq as any, mockRes as any, mockNext);

      // Unknown errors should be passed to next()
      expect(mockNext).toHaveBeenCalledWith(unknownError);
    });
  });

  describe("GET /submissions/resume/:resumeToken", () => {
    it("should return submission data for valid resume token", async () => {
      const mockSubmission: Submission = {
        id: "sub_test123",
        intakeId: "intake_test",
        state: "in_progress",
        resumeToken: "rtok_valid123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        fields: { companyName: "Acme Corp", taxId: "12-3456789" },
        fieldAttribution: {
          companyName: { kind: "agent", id: "agent_1", name: "Agent" },
        },
        createdBy: { kind: "agent", id: "agent_1", name: "Agent" },
        updatedBy: { kind: "agent", id: "agent_1", name: "Agent" },
        events: [],
      };

      const mockManager = {
        getSubmissionByResumeToken: vi.fn().mockResolvedValue(mockSubmission),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { resumeToken: "rtok_valid123" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.getByResumeToken(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.getSubmissionByResumeToken).toHaveBeenCalledWith("rtok_valid123");
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        id: mockSubmission.id,
        state: mockSubmission.state,
        fields: mockSubmission.fields,
        fieldAttribution: mockSubmission.fieldAttribution,
        expiresAt: mockSubmission.expiresAt,
      });
    });

    it("should return 404 for invalid resume token", async () => {
      const mockManager = {
        getSubmissionByResumeToken: vi.fn().mockResolvedValue(null),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { resumeToken: "rtok_invalid" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.getByResumeToken(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Submission not found. The resume link may be invalid or expired.",
      });
    });

    it("should return 403 for expired submission", async () => {
      const mockSubmission: Submission = {
        id: "sub_test123",
        intakeId: "intake_test",
        state: "in_progress",
        resumeToken: "rtok_expired",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago (expired)
        fields: {},
        fieldAttribution: {},
        createdBy: { kind: "agent", id: "agent_1", name: "Agent" },
        updatedBy: { kind: "agent", id: "agent_1", name: "Agent" },
        events: [],
      };

      const mockManager = {
        getSubmissionByResumeToken: vi.fn().mockResolvedValue(mockSubmission),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { resumeToken: "rtok_expired" },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.getByResumeToken(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "This resume link has expired.",
      });
    });

    it("should return 400 for missing resume token", async () => {
      const mockManager = {} as unknown as SubmissionManager;
      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: {}, // No resumeToken
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.getByResumeToken(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Missing resume token",
      });
    });
  });

  describe("POST /submissions/resume/:resumeToken/resumed", () => {
    it("should emit HANDOFF_RESUMED event for valid token", async () => {
      const mockManager = {
        emitHandoffResumed: vi.fn().mockResolvedValue("evt_123456"),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { resumeToken: "rtok_valid123" },
        body: {
          actor: {
            kind: "human",
            id: "user_123",
            name: "John Doe",
          },
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.emitResumed(mockReq as any, mockRes as any, mockNext);

      expect(mockManager.emitHandoffResumed).toHaveBeenCalledWith(
        "rtok_valid123",
        mockReq.body.actor
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        eventId: "evt_123456",
      });
    });

    it("should return 404 for invalid resume token", async () => {
      const mockManager = {
        emitHandoffResumed: vi.fn().mockRejectedValue(
          new SubmissionNotFoundError("rtok_invalid")
        ),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { resumeToken: "rtok_invalid" },
        body: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.emitResumed(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Submission not found: rtok_invalid",
      });
    });

    it("should return 403 for expired submission", async () => {
      const mockManager = {
        emitHandoffResumed: vi.fn().mockRejectedValue(
          new SubmissionExpiredError()
        ),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { resumeToken: "rtok_expired" },
        body: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.emitResumed(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "This resume link has expired",
      });
    });

    it("should use default human actor when actor not provided", async () => {
      const mockManager = {
        emitHandoffResumed: vi.fn().mockResolvedValue("evt_123456"),
      } as unknown as SubmissionManager;

      const routes = createSubmissionRoutes(mockManager);

      const mockReq = {
        params: { resumeToken: "rtok_valid123" },
        body: {}, // No actor provided
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      await routes.emitResumed(mockReq as any, mockRes as any, mockNext);

      // Verify default human actor was used
      expect(mockManager.emitHandoffResumed).toHaveBeenCalledWith(
        "rtok_valid123",
        {
          kind: "human",
          id: "human-unknown",
          name: "Human User",
        }
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
