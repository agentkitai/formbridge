/**
 * ApprovalManager tests - verify approval workflow logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ApprovalManager,
  ApprovalAction,
  SubmissionNotFoundError,
  InvalidResumeTokenError,
} from "../approval-manager";
import type {
  ApproveRequest,
  RejectRequest,
  RequestChangesRequest,
  FieldComment,
} from "../approval-manager";
import type { Actor, IntakeEvent, IntakeError } from "../../types/intake-contract";
import type { Submission } from "../../types";

// Mock in-memory store
class MockSubmissionStore {
  private submissions = new Map<string, Submission>();
  private submissionsByToken = new Map<string, Submission>();

  async get(submissionId: string): Promise<Submission | null> {
    return this.submissions.get(submissionId) || null;
  }

  async save(submission: Submission): Promise<void> {
    this.submissions.set(submission.id, submission);
    this.submissionsByToken.set(submission.resumeToken, submission);
  }

  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    return this.submissionsByToken.get(resumeToken) || null;
  }

  clear() {
    this.submissions.clear();
    this.submissionsByToken.clear();
  }
}

// Mock event emitter
class MockEventEmitter {
  public events: IntakeEvent[] = [];

  async emit(event: IntakeEvent): Promise<void> {
    this.events.push(event);
  }

  clear() {
    this.events = [];
  }
}

// Mock webhook notifier
class MockWebhookNotifier {
  public notifications: any[] = [];

  async notifyReviewers(notification: any): Promise<void> {
    this.notifications.push(notification);
  }

  clear() {
    this.notifications = [];
  }
}

describe("ApprovalManager", () => {
  let manager: ApprovalManager;
  let store: MockSubmissionStore;
  let eventEmitter: MockEventEmitter;

  const reviewerActor: Actor = {
    kind: "human",
    id: "reviewer-001",
    name: "Jane Reviewer",
  };

  const agentActor: Actor = {
    kind: "agent",
    id: "agent-001",
    name: "Onboarding Agent",
  };

  beforeEach(() => {
    store = new MockSubmissionStore();
    eventEmitter = new MockEventEmitter();
    manager = new ApprovalManager(store, eventEmitter);
  });

  // Helper to create a submission in needs_review state
  const createSubmissionInReview = async (): Promise<Submission> => {
    const submission: Submission = {
      id: "sub_test_123",
      intakeId: "intake_vendor_onboarding",
      state: "needs_review",
      resumeToken: "rtok_test_456",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fields: {
        companyName: "Acme Corp",
        taxId: "12-3456789",
      },
      fieldAttribution: {
        companyName: agentActor,
        taxId: agentActor,
      },
      createdBy: agentActor,
      updatedBy: agentActor,
      events: [],
    };

    await store.save(submission);
    return submission;
  };

  describe("approve", () => {
    it("should approve a submission in needs_review state", async () => {
      const submission = await createSubmissionInReview();

      const request: ApproveRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        comment: "All vendor information looks correct",
      };

      const response = await manager.approve(request);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.submissionId).toBe(submission.id);
        expect(response.state).toBe("approved");
        expect(response.resumeToken).toBe(submission.resumeToken);
      }

      // Verify submission was updated
      const updated = await store.get(submission.id);
      expect(updated).toBeDefined();
      expect(updated!.state).toBe("approved");
      expect(updated!.updatedBy).toEqual(reviewerActor);

      // Verify review decision was stored
      expect((updated as any).reviewDecisions).toBeDefined();
      expect((updated as any).reviewDecisions).toHaveLength(1);
      expect((updated as any).reviewDecisions[0].action).toBe(
        ApprovalAction.APPROVE
      );
      expect((updated as any).reviewDecisions[0].actor).toEqual(reviewerActor);
      expect((updated as any).reviewDecisions[0].comment).toBe(
        "All vendor information looks correct"
      );

      // Verify event was emitted
      expect(eventEmitter.events).toHaveLength(1);
      expect(eventEmitter.events[0].type).toBe("review.approved");
      expect(eventEmitter.events[0].actor).toEqual(reviewerActor);
      expect(eventEmitter.events[0].state).toBe("approved");
    });

    it("should approve without a comment", async () => {
      const submission = await createSubmissionInReview();

      const request: ApproveRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
      };

      const response = await manager.approve(request);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.state).toBe("approved");
      }

      const updated = await store.get(submission.id);
      expect((updated as any).reviewDecisions[0].comment).toBeUndefined();
    });

    it("should throw SubmissionNotFoundError for non-existent submission", async () => {
      const request: ApproveRequest = {
        submissionId: "sub_nonexistent",
        resumeToken: "rtok_test",
        actor: reviewerActor,
      };

      await expect(manager.approve(request)).rejects.toThrow(
        SubmissionNotFoundError
      );
    });

    it("should throw InvalidResumeTokenError for wrong resume token", async () => {
      const submission = await createSubmissionInReview();

      const request: ApproveRequest = {
        submissionId: submission.id,
        resumeToken: "rtok_wrong",
        actor: reviewerActor,
      };

      await expect(manager.approve(request)).rejects.toThrow(
        InvalidResumeTokenError
      );
    });

    it("should return error for submission not in needs_review state", async () => {
      const submission = await createSubmissionInReview();
      submission.state = "draft";
      await store.save(submission);

      const request: ApproveRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
      };

      const response = await manager.approve(request);

      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error.type).toBe("conflict");
        expect(response.error.message).toContain("Cannot approve");
      }
    });
  });

  describe("reject", () => {
    it("should reject a submission with a reason", async () => {
      const submission = await createSubmissionInReview();

      const request: RejectRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        reason: "Tax ID format is invalid",
        comment: "Please provide a valid EIN format (XX-XXXXXXX)",
      };

      const response = await manager.reject(request);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.submissionId).toBe(submission.id);
        expect(response.state).toBe("rejected");
      }

      // Verify submission was updated
      const updated = await store.get(submission.id);
      expect(updated).toBeDefined();
      expect(updated!.state).toBe("rejected");
      expect(updated!.updatedBy).toEqual(reviewerActor);

      // Verify review decision was stored
      expect((updated as any).reviewDecisions).toBeDefined();
      expect((updated as any).reviewDecisions).toHaveLength(1);
      expect((updated as any).reviewDecisions[0].action).toBe(
        ApprovalAction.REJECT
      );
      expect((updated as any).reviewDecisions[0].reason).toBe(
        "Tax ID format is invalid"
      );
      expect((updated as any).reviewDecisions[0].comment).toBe(
        "Please provide a valid EIN format (XX-XXXXXXX)"
      );

      // Verify event was emitted
      expect(eventEmitter.events).toHaveLength(1);
      expect(eventEmitter.events[0].type).toBe("review.rejected");
      expect(eventEmitter.events[0].state).toBe("rejected");
    });

    it("should reject with only a reason (no comment)", async () => {
      const submission = await createSubmissionInReview();

      const request: RejectRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        reason: "Incomplete information",
      };

      const response = await manager.reject(request);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.state).toBe("rejected");
      }

      const updated = await store.get(submission.id);
      expect((updated as any).reviewDecisions[0].reason).toBe(
        "Incomplete information"
      );
      expect((updated as any).reviewDecisions[0].comment).toBeUndefined();
    });

    it("should throw SubmissionNotFoundError for non-existent submission", async () => {
      const request: RejectRequest = {
        submissionId: "sub_nonexistent",
        resumeToken: "rtok_test",
        actor: reviewerActor,
        reason: "Invalid",
      };

      await expect(manager.reject(request)).rejects.toThrow(
        SubmissionNotFoundError
      );
    });

    it("should throw InvalidResumeTokenError for wrong resume token", async () => {
      const submission = await createSubmissionInReview();

      const request: RejectRequest = {
        submissionId: submission.id,
        resumeToken: "rtok_wrong",
        actor: reviewerActor,
        reason: "Invalid",
      };

      await expect(manager.reject(request)).rejects.toThrow(
        InvalidResumeTokenError
      );
    });

    it("should return error for submission not in needs_review state", async () => {
      const submission = await createSubmissionInReview();
      submission.state = "approved";
      await store.save(submission);

      const request: RejectRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        reason: "Invalid",
      };

      const response = await manager.reject(request);

      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error.type).toBe("conflict");
        expect(response.error.message).toContain("Cannot reject");
      }
    });
  });

  describe("requestChanges", () => {
    it("should request changes with field-level comments", async () => {
      const submission = await createSubmissionInReview();

      const fieldComments: FieldComment[] = [
        {
          fieldPath: "taxId",
          comment: "Please provide a valid EIN format (XX-XXXXXXX)",
          suggestedValue: "12-3456789",
        },
        {
          fieldPath: "companyName",
          comment: "Please use the legal entity name",
        },
      ];

      const request: RequestChangesRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        fieldComments,
        comment: "Several fields need correction",
      };

      const response = await manager.requestChanges(request);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.submissionId).toBe(submission.id);
        expect(response.state).toBe("draft");
      }

      // Verify submission was updated back to draft
      const updated = await store.get(submission.id);
      expect(updated).toBeDefined();
      expect(updated!.state).toBe("draft");
      expect(updated!.updatedBy).toEqual(reviewerActor);

      // Verify review decision was stored
      expect((updated as any).reviewDecisions).toBeDefined();
      expect((updated as any).reviewDecisions).toHaveLength(1);
      expect((updated as any).reviewDecisions[0].action).toBe(
        ApprovalAction.REQUEST_CHANGES
      );
      expect((updated as any).reviewDecisions[0].fieldComments).toEqual(
        fieldComments
      );
      expect((updated as any).reviewDecisions[0].comment).toBe(
        "Several fields need correction"
      );

      // Verify event was emitted
      expect(eventEmitter.events).toHaveLength(1);
      expect(eventEmitter.events[0].type).toBe("field.updated");
      expect(eventEmitter.events[0].state).toBe("draft");
      expect(eventEmitter.events[0].payload).toEqual({
        action: "request_changes",
        fieldComments,
        comment: "Several fields need correction",
      });
    });

    it("should request changes without general comment", async () => {
      const submission = await createSubmissionInReview();

      const fieldComments: FieldComment[] = [
        {
          fieldPath: "taxId",
          comment: "Invalid format",
        },
      ];

      const request: RequestChangesRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        fieldComments,
      };

      const response = await manager.requestChanges(request);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.state).toBe("draft");
      }

      const updated = await store.get(submission.id);
      expect((updated as any).reviewDecisions[0].comment).toBeUndefined();
    });

    it("should handle field comments with suggested values", async () => {
      const submission = await createSubmissionInReview();

      const fieldComments: FieldComment[] = [
        {
          fieldPath: "taxId",
          comment: "Use this format",
          suggestedValue: "12-3456789",
        },
      ];

      const request: RequestChangesRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        fieldComments,
      };

      const response = await manager.requestChanges(request);

      expect(response.ok).toBe(true);

      const updated = await store.get(submission.id);
      expect(
        (updated as any).reviewDecisions[0].fieldComments[0].suggestedValue
      ).toBe("12-3456789");
    });

    it("should throw SubmissionNotFoundError for non-existent submission", async () => {
      const request: RequestChangesRequest = {
        submissionId: "sub_nonexistent",
        resumeToken: "rtok_test",
        actor: reviewerActor,
        fieldComments: [],
      };

      await expect(manager.requestChanges(request)).rejects.toThrow(
        SubmissionNotFoundError
      );
    });

    it("should throw InvalidResumeTokenError for wrong resume token", async () => {
      const submission = await createSubmissionInReview();

      const request: RequestChangesRequest = {
        submissionId: submission.id,
        resumeToken: "rtok_wrong",
        actor: reviewerActor,
        fieldComments: [],
      };

      await expect(manager.requestChanges(request)).rejects.toThrow(
        InvalidResumeTokenError
      );
    });

    it("should return error for submission not in needs_review state", async () => {
      const submission = await createSubmissionInReview();
      submission.state = "finalized";
      await store.save(submission);

      const request: RequestChangesRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        fieldComments: [],
      };

      const response = await manager.requestChanges(request);

      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error.type).toBe("conflict");
        expect(response.error.message).toContain("Cannot request changes");
      }
    });
  });

  describe("multiple review decisions", () => {
    it("should store multiple review decisions in sequence", async () => {
      const submission = await createSubmissionInReview();

      // First, request changes
      const changesRequest: RequestChangesRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        fieldComments: [
          {
            fieldPath: "taxId",
            comment: "Invalid format",
          },
        ],
      };

      await manager.requestChanges(changesRequest);

      // Then move back to needs_review and approve
      const updated = await store.get(submission.id);
      updated!.state = "needs_review";
      await store.save(updated!);

      const approveRequest: ApproveRequest = {
        submissionId: submission.id,
        resumeToken: submission.resumeToken,
        actor: reviewerActor,
        comment: "Fixed - looks good now",
      };

      await manager.approve(approveRequest);

      // Verify both decisions are stored
      const final = await store.get(submission.id);
      expect((final as any).reviewDecisions).toHaveLength(2);
      expect((final as any).reviewDecisions[0].action).toBe(
        ApprovalAction.REQUEST_CHANGES
      );
      expect((final as any).reviewDecisions[1].action).toBe(
        ApprovalAction.APPROVE
      );
    });
  });

  describe("reviewer notifications", () => {
    let webhookNotifier: MockWebhookNotifier;
    let managerWithNotifier: ApprovalManager;

    beforeEach(() => {
      webhookNotifier = new MockWebhookNotifier();
      managerWithNotifier = new ApprovalManager(store, eventEmitter, webhookNotifier);
    });

    it("should send notification to reviewers when notifyReviewers is called", async () => {
      const submission = await createSubmissionInReview();
      const reviewerIds = ["reviewer_1", "reviewer_2"];
      const reviewUrl = "https://example.com/review/sub_test_123";

      await managerWithNotifier.notifyReviewers(
        submission,
        reviewerIds,
        reviewUrl
      );

      expect(webhookNotifier.notifications).toHaveLength(1);
      expect(webhookNotifier.notifications[0]).toEqual({
        submissionId: submission.id,
        intakeId: submission.intakeId,
        state: submission.state,
        fields: submission.fields,
        createdBy: submission.createdBy,
        reviewerIds,
        reviewUrl,
      });
    });

    it("should send notification without reviewUrl", async () => {
      const submission = await createSubmissionInReview();
      const reviewerIds = ["reviewer_1"];

      await managerWithNotifier.notifyReviewers(submission, reviewerIds);

      expect(webhookNotifier.notifications).toHaveLength(1);
      expect(webhookNotifier.notifications[0].reviewerIds).toEqual(reviewerIds);
      expect(webhookNotifier.notifications[0].reviewUrl).toBeUndefined();
    });

    it("should not fail when webhook notifier is not configured", async () => {
      const submission = await createSubmissionInReview();
      const reviewerIds = ["reviewer_1"];

      // Manager without webhook notifier (original manager)
      await expect(
        manager.notifyReviewers(submission, reviewerIds)
      ).resolves.not.toThrow();
    });

    it("should include submission details in notification", async () => {
      const submission = await createSubmissionInReview();
      const reviewerIds = ["reviewer_1", "reviewer_2"];

      await managerWithNotifier.notifyReviewers(submission, reviewerIds);

      const notification = webhookNotifier.notifications[0];
      expect(notification.submissionId).toBe("sub_test_123");
      expect(notification.intakeId).toBe("intake_vendor_onboarding");
      expect(notification.state).toBe("needs_review");
      expect(notification.fields).toEqual({
        companyName: "Acme Corp",
        taxId: "12-3456789",
      });
      expect(notification.createdBy).toEqual(agentActor);
    });
  });
});
