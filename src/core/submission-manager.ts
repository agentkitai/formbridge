/**
 * SubmissionManager - Core business logic for submission lifecycle
 * Handles field attribution tracking for mixed-mode agent-human collaboration
 */

import type {
  Actor,
  IntakeEvent,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  SetFieldsRequest,
  SubmitRequest,
  IntakeError,
} from "../types/intake-contract";
import type { Submission, FieldAttribution } from "../types";
import { randomUUID } from "crypto";

export class SubmissionNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Submission not found: ${identifier}`);
    this.name = "SubmissionNotFoundError";
  }
}

export class SubmissionExpiredError extends Error {
  constructor(message = "This resume link has expired") {
    super(message);
    this.name = "SubmissionExpiredError";
  }
}

export class InvalidResumeTokenError extends Error {
  constructor() {
    super("Invalid resume token");
    this.name = "InvalidResumeTokenError";
  }
}

export interface SubmissionStore {
  get(submissionId: string): Promise<Submission | null>;
  save(submission: Submission): Promise<void>;
  getByResumeToken(resumeToken: string): Promise<Submission | null>;
}

export interface EventEmitter {
  emit(event: IntakeEvent): Promise<void>;
}

export interface IntakeRegistry {
  getIntake(intakeId: string): { approvalGates?: unknown[] };
}

/**
 * SubmissionManager orchestrates the submission lifecycle
 * with field-level actor attribution for audit trails
 */
export class SubmissionManager {
  constructor(
    private store: SubmissionStore,
    private eventEmitter: EventEmitter,
    private intakeRegistry?: IntakeRegistry,
    private baseUrl: string = "http://localhost:3000"
  ) {}

  /**
   * Create a new submission
   */
  async createSubmission(
    request: CreateSubmissionRequest
  ): Promise<CreateSubmissionResponse> {
    const submissionId = `sub_${randomUUID()}`;
    const resumeToken = `rtok_${randomUUID()}`;
    const now = new Date().toISOString();

    const fieldAttribution: FieldAttribution = {};
    const fields: Record<string, unknown> = {};

    // If initial fields provided, record actor attribution
    if (request.initialFields) {
      Object.entries(request.initialFields).forEach(([key, value]) => {
        fields[key] = value;
        fieldAttribution[key] = request.actor;
      });
    }

    const submission: Submission = {
      id: submissionId,
      intakeId: request.intakeId,
      state: "draft",
      resumeToken,
      createdAt: now,
      updatedAt: now,
      fields,
      fieldAttribution,
      createdBy: request.actor,
      updatedBy: request.actor,
      idempotencyKey: request.idempotencyKey,
      events: [],
      ttlMs: request.ttlMs,
    };

    if (request.ttlMs) {
      submission.expiresAt = new Date(
        Date.now() + request.ttlMs
      ).toISOString();
    }

    await this.store.save(submission);

    // Emit submission.created event
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "submission.created",
      submissionId,
      ts: now,
      actor: request.actor,
      state: "draft",
      payload: {
        intakeId: request.intakeId,
        initialFields: request.initialFields,
      },
    };

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

    return {
      ok: true,
      submissionId,
      state: "draft",
      resumeToken,
      schema: {}, // TODO: Load from intake definition
      missingFields: [], // TODO: Calculate from schema
    };
  }

  /**
   * Set fields on a submission with actor attribution
   * Records which actor filled each field for audit purposes
   */
  async setFields(
    request: SetFieldsRequest
  ): Promise<CreateSubmissionResponse | IntakeError> {
    // Get submission by ID or resume token
    let submission = await this.store.get(request.submissionId);

    if (!submission) {
      submission = await this.store.getByResumeToken(request.resumeToken);
    }

    if (!submission) {
      throw new SubmissionNotFoundError(request.submissionId);
    }

    // Check if submission is in a terminal state
    if (
      ["submitted", "finalized", "cancelled", "expired"].includes(
        submission.state
      )
    ) {
      return {
        ok: false,
        submissionId: submission.id,
        state: submission.state,
        resumeToken: submission.resumeToken,
        error: {
          type: "conflict",
          message: "Cannot modify fields in current state",
          retryable: false,
        },
      } as IntakeError;
    }

    // Verify resume token matches
    if (submission.resumeToken !== request.resumeToken) {
      throw new InvalidResumeTokenError();
    }

    // Check if submission is expired
    if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
      const error: IntakeError = {
        ok: false,
        submissionId: submission.id,
        state: "expired",
        resumeToken: submission.resumeToken,
        error: {
          type: "expired",
          message: "Submission has expired",
          retryable: false,
        },
      };
      return error;
    }

    // Update fields and record actor attribution
    const now = new Date().toISOString();
    const updatedFields: string[] = [];

    Object.entries(request.fields).forEach(([fieldPath, value]) => {
      submission!.fields[fieldPath] = value;
      submission!.fieldAttribution[fieldPath] = request.actor;
      updatedFields.push(fieldPath);
    });

    // Update metadata
    submission.updatedAt = now;
    submission.updatedBy = request.actor;

    // Update state if still in draft
    if (submission.state === "draft") {
      submission.state = "in_progress";
    }

    await this.store.save(submission);

    // Emit field.updated event for each field
    for (const fieldPath of updatedFields) {
      const event: IntakeEvent = {
        eventId: `evt_${randomUUID()}`,
        type: "field.updated",
        submissionId: submission.id,
        ts: now,
        actor: request.actor,
        state: submission.state,
        payload: {
          fieldPath,
          value: request.fields[fieldPath],
        },
      };

      submission.events.push(event);
      await this.eventEmitter.emit(event);
    }

    await this.store.save(submission);

    return {
      ok: true,
      submissionId: submission.id,
      state: submission.state as "draft" | "in_progress",
      resumeToken: submission.resumeToken,
      schema: {}, // TODO: Load from intake definition
      missingFields: [], // TODO: Calculate from schema
    };
  }

  /**
   * Submit a submission for processing
   * If approval gates are configured, transitions to needs_review instead of submitted
   */
  async submit(
    request: SubmitRequest
  ): Promise<CreateSubmissionResponse | IntakeError> {
    const submission = await this.store.get(request.submissionId);

    if (!submission) {
      throw new SubmissionNotFoundError(request.submissionId);
    }

    // Verify resume token
    if (submission.resumeToken !== request.resumeToken) {
      throw new InvalidResumeTokenError();
    }

    // Check if already submitted
    if (submission.state === "submitted" || submission.state === "finalized") {
      const error: IntakeError = {
        ok: false,
        submissionId: submission.id,
        state: submission.state,
        resumeToken: submission.resumeToken,
        error: {
          type: "conflict",
          message: "Submission already submitted",
          retryable: false,
        },
      };
      return error;
    }

    const now = new Date().toISOString();

    // Check if approval is required for this intake
    let requiresApproval = false;
    if (this.intakeRegistry) {
      try {
        const intake = this.intakeRegistry.getIntake(submission.intakeId);
        requiresApproval = Boolean(
          intake.approvalGates && intake.approvalGates.length > 0
        );
      } catch {
        // If intake not found, proceed without approval check
        requiresApproval = false;
      }
    }

    // If approval is required, transition to needs_review and return needs_approval error
    if (requiresApproval) {
      submission.state = "needs_review";
      submission.updatedAt = now;
      submission.updatedBy = request.actor;

      await this.store.save(submission);

      // Emit review.requested event
      const reviewEvent: IntakeEvent = {
        eventId: `evt_${randomUUID()}`,
        type: "review.requested",
        submissionId: submission.id,
        ts: now,
        actor: request.actor,
        state: "needs_review",
        payload: {
          idempotencyKey: request.idempotencyKey,
        },
      };

      submission.events.push(reviewEvent);
      await this.eventEmitter.emit(reviewEvent);
      await this.store.save(submission);

      // Return needs_approval error with next action guidance
      const error: IntakeError = {
        ok: false,
        submissionId: submission.id,
        state: "needs_review",
        resumeToken: submission.resumeToken,
        error: {
          type: "needs_approval",
          message:
            "Submission requires human review before it can be finalized",
          retryable: false,
          nextActions: [
            {
              action: "wait_for_review",
              hint: "A human reviewer will approve or reject this submission",
            },
          ],
        },
      };
      return error;
    }

    // Normal submission flow - no approval required
    submission.state = "submitted";
    submission.updatedAt = now;
    submission.updatedBy = request.actor;

    await this.store.save(submission);

    // Emit submission.submitted event
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "submission.submitted",
      submissionId: submission.id,
      ts: now,
      actor: request.actor,
      state: "submitted",
      payload: {
        idempotencyKey: request.idempotencyKey,
      },
    };

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

    return {
      ok: true,
      submissionId: submission.id,
      state: submission.state as "draft" | "in_progress" | "submitted",
      resumeToken: submission.resumeToken,
      schema: {},
      missingFields: [],
    };
  }

  /**
   * Get a submission by ID
   */
  async getSubmission(submissionId: string): Promise<Submission | null> {
    return this.store.get(submissionId);
  }

  /**
   * Get a submission by resume token
   */
  async getSubmissionByResumeToken(
    resumeToken: string
  ): Promise<Submission | null> {
    return this.store.getByResumeToken(resumeToken);
  }

  /**
   * Generate a handoff URL for agent-to-human collaboration
   * Returns a shareable resume URL that allows a human to continue filling the form
   */
  async generateHandoffUrl(
    submissionId: string,
    actor: Actor
  ): Promise<string> {
    const submission = await this.store.get(submissionId);

    if (!submission) {
      throw new SubmissionNotFoundError(submissionId);
    }

    // Generate the resume URL with the token
    const resumeUrl = `${this.baseUrl}/resume?token=${encodeURIComponent(submission.resumeToken)}`;

    const now = new Date().toISOString();

    // Emit handoff.link_issued event
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "handoff.link_issued",
      submissionId: submission.id,
      ts: now,
      actor,
      state: submission.state,
      payload: {
        url: resumeUrl,
        resumeToken: submission.resumeToken,
      },
    };

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

    return resumeUrl;
  }

  /**
   * Emit HANDOFF_RESUMED event when human opens the resume form
   * This notifies the agent that the human has started working on the form
   */
  async emitHandoffResumed(
    resumeToken: string,
    actor: Actor
  ): Promise<string> {
    const submission = await this.store.getByResumeToken(resumeToken);

    if (!submission) {
      throw new SubmissionNotFoundError(resumeToken);
    }

    // Check if submission is expired
    if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
      throw new SubmissionExpiredError();
    }

    const now = new Date().toISOString();

    // Create handoff.resumed event
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "handoff.resumed",
      submissionId: submission.id,
      ts: now,
      actor,
      state: submission.state,
      payload: {
        resumeToken: submission.resumeToken,
      },
    };

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

    return event.eventId;
  }
}
