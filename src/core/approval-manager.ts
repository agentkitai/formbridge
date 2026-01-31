/**
 * ApprovalManager - Core business logic for approval workflow
 * Handles review decisions (approve, reject, request changes) for submissions
 */

import type {
  Actor,
  IntakeEvent,
  IntakeError,
  SubmissionState,
} from "../types/intake-contract";
import type { Submission } from "../types";
import { assertValidTransition } from "./state-machine.js";
import { randomUUID } from "crypto";
import {
  SubmissionNotFoundError,
  InvalidResumeTokenError,
  InvalidStateError,
} from "./errors.js";

// Re-export for backward compatibility — consumers import from here
export { SubmissionNotFoundError, InvalidResumeTokenError, InvalidStateError };

/**
 * Review decision actions available to reviewers
 */
export enum ApprovalAction {
  APPROVE = "approve",
  REJECT = "reject",
  REQUEST_CHANGES = "request_changes",
}

/**
 * Field-level comment for request_changes action
 */
export interface FieldComment {
  fieldPath: string;
  comment: string;
  suggestedValue?: unknown;
}

/**
 * A review decision made by a reviewer
 */
export interface ReviewDecision {
  action: ApprovalAction;
  actor: Actor;
  timestamp: string;
  comment?: string;
  reason?: string;
  fieldComments?: FieldComment[];
}

export interface SubmissionStore {
  get(submissionId: string): Promise<Submission | null>;
  save(submission: Submission): Promise<void>;
  getByResumeToken(resumeToken: string): Promise<Submission | null>;
}

export interface EventEmitter {
  emit(event: IntakeEvent): Promise<void>;
}

/**
 * Notification payload sent to reviewers when submission needs review
 */
export interface ReviewerNotification {
  submissionId: string;
  intakeId: string;
  state: SubmissionState;
  fields: Record<string, unknown>;
  createdBy: Actor;
  reviewerIds: string[];
  reviewUrl?: string;
}

/**
 * Webhook notifier for sending notifications to reviewers
 */
export interface WebhookNotifier {
  notifyReviewers(notification: ReviewerNotification): Promise<void>;
}

export interface ApproveRequest {
  submissionId: string;
  resumeToken: string;
  actor: Actor;
  comment?: string;
}

export interface RejectRequest {
  submissionId: string;
  resumeToken: string;
  actor: Actor;
  reason: string;
  comment?: string;
}

export interface RequestChangesRequest {
  submissionId: string;
  resumeToken: string;
  actor: Actor;
  fieldComments: FieldComment[];
  comment?: string;
}

export interface ApprovalResponse {
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
}

/**
 * ApprovalManager orchestrates the approval workflow
 * with review decisions for approval gates
 */
export class ApprovalManager {
  constructor(
    private store: SubmissionStore,
    private eventEmitter: EventEmitter,
    private webhookNotifier?: WebhookNotifier
  ) {}

  /**
   * Approve a submission
   * Transitions from needs_review to approved
   */
  async approve(
    request: ApproveRequest
  ): Promise<ApprovalResponse | IntakeError> {
    // Get submission by ID
    const submission = await this.store.get(request.submissionId);

    if (!submission) {
      throw new SubmissionNotFoundError(request.submissionId);
    }

    // Verify resume token matches
    if (submission.resumeToken !== request.resumeToken) {
      throw new InvalidResumeTokenError();
    }

    // Check if submission is in needs_review state
    if (submission.state !== "needs_review") {
      return {
        ok: false,
        submissionId: submission.id,
        state: submission.state,
        resumeToken: submission.resumeToken,
        error: {
          type: "conflict",
          message: `Cannot approve submission in state '${submission.state}'`,
          retryable: false,
        },
      } as IntakeError;
    }

    const now = new Date().toISOString();

    // Create review decision
    const reviewDecision: ReviewDecision = {
      action: ApprovalAction.APPROVE,
      actor: request.actor,
      timestamp: now,
      comment: request.comment,
    };

    // Update submission state
    assertValidTransition(submission.state, "approved");
    submission.state = "approved";
    submission.updatedAt = now;
    submission.updatedBy = request.actor;

    // Store review decision in submission metadata
    if (!(submission as any).reviewDecisions) {
      (submission as any).reviewDecisions = [];
    }
    (submission as any).reviewDecisions.push(reviewDecision);

    // Emit review.approved event
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "review.approved",
      submissionId: submission.id,
      ts: now,
      actor: request.actor,
      state: "approved",
      payload: {
        comment: request.comment,
      },
    };

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

    return {
      ok: true,
      submissionId: submission.id,
      state: submission.state,
      resumeToken: submission.resumeToken,
    };
  }

  /**
   * Reject a submission
   * Transitions from needs_review to rejected
   */
  async reject(
    request: RejectRequest
  ): Promise<ApprovalResponse | IntakeError> {
    // Get submission by ID
    const submission = await this.store.get(request.submissionId);

    if (!submission) {
      throw new SubmissionNotFoundError(request.submissionId);
    }

    // Verify resume token matches
    if (submission.resumeToken !== request.resumeToken) {
      throw new InvalidResumeTokenError();
    }

    // Check if submission is in needs_review state
    if (submission.state !== "needs_review") {
      return {
        ok: false,
        submissionId: submission.id,
        state: submission.state,
        resumeToken: submission.resumeToken,
        error: {
          type: "conflict",
          message: `Cannot reject submission in state '${submission.state}'`,
          retryable: false,
        },
      } as IntakeError;
    }

    const now = new Date().toISOString();

    // Create review decision
    const reviewDecision: ReviewDecision = {
      action: ApprovalAction.REJECT,
      actor: request.actor,
      timestamp: now,
      reason: request.reason,
      comment: request.comment,
    };

    // Update submission state
    assertValidTransition(submission.state, "rejected");
    submission.state = "rejected";
    submission.updatedAt = now;
    submission.updatedBy = request.actor;

    // Store review decision in submission metadata
    if (!(submission as any).reviewDecisions) {
      (submission as any).reviewDecisions = [];
    }
    (submission as any).reviewDecisions.push(reviewDecision);

    // Emit review.rejected event
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "review.rejected",
      submissionId: submission.id,
      ts: now,
      actor: request.actor,
      state: "rejected",
      payload: {
        reason: request.reason,
        comment: request.comment,
      },
    };

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

    return {
      ok: true,
      submissionId: submission.id,
      state: submission.state,
      resumeToken: submission.resumeToken,
    };
  }

  /**
   * Request changes on a submission
   * Transitions from needs_review back to draft with field-level comments
   */
  async requestChanges(
    request: RequestChangesRequest
  ): Promise<ApprovalResponse | IntakeError> {
    // Get submission by ID
    const submission = await this.store.get(request.submissionId);

    if (!submission) {
      throw new SubmissionNotFoundError(request.submissionId);
    }

    // Verify resume token matches
    if (submission.resumeToken !== request.resumeToken) {
      throw new InvalidResumeTokenError();
    }

    // Check if submission is in needs_review state
    if (submission.state !== "needs_review") {
      return {
        ok: false,
        submissionId: submission.id,
        state: submission.state,
        resumeToken: submission.resumeToken,
        error: {
          type: "conflict",
          message: `Cannot request changes on submission in state '${submission.state}'`,
          retryable: false,
        },
      } as IntakeError;
    }

    const now = new Date().toISOString();

    // Create review decision
    const reviewDecision: ReviewDecision = {
      action: ApprovalAction.REQUEST_CHANGES,
      actor: request.actor,
      timestamp: now,
      fieldComments: request.fieldComments,
      comment: request.comment,
    };

    // Update submission state back to draft
    assertValidTransition(submission.state, "draft");
    submission.state = "draft";
    submission.updatedAt = now;
    submission.updatedBy = request.actor;

    // Store review decision in submission metadata
    if (!(submission as any).reviewDecisions) {
      (submission as any).reviewDecisions = [];
    }
    (submission as any).reviewDecisions.push(reviewDecision);

    // Emit field.updated event (custom event type for changes requested)
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "field.updated",
      submissionId: submission.id,
      ts: now,
      actor: request.actor,
      state: "draft",
      payload: {
        action: "request_changes",
        fieldComments: request.fieldComments,
        comment: request.comment,
      },
    };

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

    return {
      ok: true,
      submissionId: submission.id,
      state: submission.state,
      resumeToken: submission.resumeToken,
    };
  }

  /**
   * Notify reviewers that a submission needs review
   * Sends webhook notification to configured reviewers
   */
  async notifyReviewers(
    submission: Submission,
    reviewerIds: string[],
    reviewUrl?: string
  ): Promise<void> {
    if (!this.webhookNotifier) {
      // Webhook notifier not configured, skip notification
      return;
    }

    const notification: ReviewerNotification = {
      submissionId: submission.id,
      intakeId: submission.intakeId,
      state: submission.state,
      fields: submission.fields,
      createdBy: submission.createdBy,
      reviewerIds,
      reviewUrl,
    };

    await this.webhookNotifier.notifyReviewers(notification);
  }
}
