/**
 * Approval Routes Tests
 * Verify HTTP endpoint handlers for approval operations
 */

import { describe, it, expect, vi } from "vitest";
import { createApprovalRoutes } from "../approvals";
import type { ApprovalManager } from "../../core/approval-manager";

describe("Approval Routes", () => {
  describe("POST /submissions/:id/approve", () => {
    it("should approve a submission successfully", async () => {
      // Mock ApprovalManager
      const mockManager = {
        approve: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "approved",
          resumeToken: "rtok_test",
        }),
      } as unknown as ApprovalManager;

      // Create routes
      const routes = createApprovalRoutes(mockManager);

      // Mock Express request and response
      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_test",
          actor: {
            kind: "human",
            id: "reviewer_1",
          },
          comment: "Approved",
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      // Call the handler
      await routes.approve(mockReq as any, mockRes as any, mockNext);

      // Verify approve was called with correct params
      expect(mockManager.approve).toHaveBeenCalledWith({
        submissionId: "sub_test123",
        resumeToken: "rtok_test",
        actor: mockReq.body.actor,
        comment: "Approved",
      });

      // Verify response
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        submissionId: "sub_test123",
        state: "approved",
        resumeToken: "rtok_test",
      });
    });

    it("should return 400 if resumeToken is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          actor: { kind: "human", id: "reviewer_1" },
        },
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
  });

  describe("POST /submissions/:id/reject", () => {
    it("should reject a submission successfully", async () => {
      const mockManager = {
        reject: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "rejected",
          resumeToken: "rtok_test",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_test",
          actor: {
            kind: "human",
            id: "reviewer_1",
          },
          reason: "Invalid data",
          comment: "Please fix",
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
        resumeToken: "rtok_test",
        actor: mockReq.body.actor,
        reason: "Invalid data",
        comment: "Please fix",
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        submissionId: "sub_test123",
        state: "rejected",
        resumeToken: "rtok_test",
      });
    });

    it("should return 400 if reason is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_test",
          actor: { kind: "human", id: "reviewer_1" },
        },
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
  });

  describe("POST /submissions/:id/request-changes", () => {
    it("should request changes on a submission successfully", async () => {
      const mockManager = {
        requestChanges: vi.fn().mockResolvedValue({
          ok: true,
          submissionId: "sub_test123",
          state: "draft",
          resumeToken: "rtok_test",
        }),
      } as unknown as ApprovalManager;

      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_test",
          actor: {
            kind: "human",
            id: "reviewer_1",
          },
          fieldComments: [
            {
              fieldPath: "email",
              comment: "Please use company email",
            },
          ],
          comment: "Please update email field",
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
        resumeToken: "rtok_test",
        actor: mockReq.body.actor,
        fieldComments: mockReq.body.fieldComments,
        comment: "Please update email field",
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        submissionId: "sub_test123",
        state: "draft",
        resumeToken: "rtok_test",
      });
    });

    it("should return 400 if fieldComments is missing", async () => {
      const mockManager = {} as unknown as ApprovalManager;
      const routes = createApprovalRoutes(mockManager);

      const mockReq = {
        params: { id: "sub_test123" },
        body: {
          resumeToken: "rtok_test",
          actor: { kind: "human", id: "reviewer_1" },
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
        error:
          "Missing or invalid fieldComments in request body (required array)",
      });
    });
  });
});
