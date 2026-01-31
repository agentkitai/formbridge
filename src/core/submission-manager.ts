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
  IntakeDefinition,
} from "../types/intake-contract";
import type { Submission, FieldAttribution } from "../types";
import type { StorageBackend } from "../storage/storage-backend.js";
import type { UploadStatus } from "./validator.js";
import type { EventStore } from "./event-store.js";
import { InMemoryEventStore } from "./event-store.js";
import { assertValidTransition } from "./state-machine.js";
import { randomUUID } from "crypto";

import {
  SubmissionNotFoundError,
  SubmissionExpiredError,
  InvalidResumeTokenError,
} from "./errors.js";

// Re-export for backward compatibility — consumers import from here
export { SubmissionNotFoundError, SubmissionExpiredError, InvalidResumeTokenError };

/** Reserved field names that cannot be set via the API */
const RESERVED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype', '__uploads']);

export interface SubmissionStore {
  get(submissionId: string): Promise<Submission | null>;
  save(submission: Submission): Promise<void>;
  getByResumeToken(resumeToken: string): Promise<Submission | null>;
  getByIdempotencyKey(key: string): Promise<Submission | null>;
}

export interface EventEmitter {
  emit(event: IntakeEvent): Promise<void>;
}

export interface IntakeRegistry {
  getIntake(intakeId: string): IntakeDefinition;
}

/**
 * Request input for file upload URL generation
 */
export interface RequestUploadInput {
  submissionId: string;
  resumeToken: string;
  field: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  actor: Actor;
}

/**
 * Response from requestUpload
 */
export interface RequestUploadOutput {
  ok: true;
  uploadId: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  expiresInMs: number;
  constraints: {
    accept: string[];
    maxBytes: number;
  };
}

/**
 * Request input for confirming a file upload
 */
export interface ConfirmUploadInput {
  submissionId: string;
  resumeToken: string;
  uploadId: string;
  actor: Actor;
}

/**
 * Response from confirmUpload
 */
export interface ConfirmUploadOutput {
  ok: true;
  submissionId: string;
  state: string;
  resumeToken: string;
  field: string;
}

/**
 * SubmissionManager orchestrates the submission lifecycle
 * with field-level actor attribution for audit trails
 */
export class SubmissionManager {
  private eventStore: EventStore;

  constructor(
    private store: SubmissionStore,
    private _eventEmitter: EventEmitter,
    private intakeRegistry?: IntakeRegistry,
    private baseUrl: string = "http://localhost:3000",
    private storageBackend?: StorageBackend,
    eventStore?: EventStore
  ) {
    // Initialize event store (defaults to in-memory implementation)
    this.eventStore = eventStore ?? new InMemoryEventStore();
  }

  /**
   * Record an event using the triple-write pattern:
   * 1. Append to submission.events array (in-memory)
   * 2. Emit via event emitter + append to persistent event store (parallel)
   * 3. Save submission to store
   */
  private async recordEvent(
    submission: Submission,
    event: IntakeEvent
  ): Promise<void> {
    submission.events.push(event);
    // Emit and append are independent — run in parallel
    await Promise.all([
      this._eventEmitter.emit(event),
      this.eventStore.appendEvent(event),
    ]);
    await this.store.save(submission);
  }

  /**
   * Create a new submission
   */
  async createSubmission(
    request: CreateSubmissionRequest
  ): Promise<CreateSubmissionResponse> {
    // Idempotency check: return existing submission if key matches
    if (request.idempotencyKey) {
      const existing = await this.store.getByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        return {
          ok: true,
          submissionId: existing.id,
          state: existing.state as "draft" | "in_progress",
          resumeToken: existing.resumeToken,
          schema: {},
          missingFields: [],
        };
      }
    }

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

    // Emit submission.created event (recordEvent will save the submission)
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

    await this.recordEvent(submission, event);

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

    // Reject reserved field names
    for (const fieldPath of Object.keys(request.fields)) {
      if (RESERVED_FIELD_NAMES.has(fieldPath)) {
        return {
          ok: false,
          submissionId: submission.id,
          state: submission.state,
          resumeToken: submission.resumeToken,
          error: {
            type: "invalid",
            message: `Reserved field name '${fieldPath}' cannot be used`,
            retryable: false,
          },
        } as IntakeError;
      }
    }

    // Update fields and record actor attribution
    const now = new Date().toISOString();
    const fieldUpdates: Array<{
      fieldPath: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];

    Object.entries(request.fields).forEach(([fieldPath, value]) => {
      const oldValue = submission!.fields[fieldPath];
      submission!.fields[fieldPath] = value;
      submission!.fieldAttribution[fieldPath] = request.actor;
      fieldUpdates.push({ fieldPath, oldValue, newValue: value });
    });

    // Update metadata
    submission.updatedAt = now;
    submission.updatedBy = request.actor;

    // Rotate resume token on every state-changing operation
    submission.resumeToken = `rtok_${randomUUID()}`;

    // Update state if still in draft
    if (submission.state === "draft") {
      assertValidTransition(submission.state, "in_progress");
      submission.state = "in_progress";
    }

    // Build structured diffs array (recordEvent will save the submission)
    const diffs = fieldUpdates.map((u) => ({
      fieldPath: u.fieldPath,
      previousValue: u.oldValue,
      newValue: u.newValue,
    }));

    // Emit a single batch fields.updated event for all field changes
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "fields.updated",
      submissionId: submission.id,
      ts: now,
      actor: request.actor,
      state: submission.state,
      payload: {
        diffs,
      },
    };

    await this.recordEvent(submission, event);

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
   * Requests a signed upload URL for a file field.
   * Implements the file upload negotiation protocol.
   *
   * @param input - RequestUpload operation input
   * @param intakeDefinition - The intake definition for field validation
   * @returns RequestUploadOutput or throws an error
   */
  async requestUpload(
    input: RequestUploadInput,
    intakeDefinition: IntakeDefinition
  ): Promise<RequestUploadOutput> {
    // Validate storage backend is configured
    if (!this.storageBackend) {
      throw new Error("Storage backend not configured");
    }

    // Get submission
    const submission = await this.store.get(input.submissionId);
    if (!submission) {
      throw new SubmissionNotFoundError(input.submissionId);
    }

    // Verify resume token
    if (submission.resumeToken !== input.resumeToken) {
      throw new InvalidResumeTokenError();
    }

    // Check if submission is expired
    if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
      throw new SubmissionExpiredError();
    }

    // Validate field exists in the schema
    const schemaObj = intakeDefinition.schema as Record<string, unknown> | undefined;
    const properties = (schemaObj as { properties?: Record<string, unknown> })?.properties;
    const fieldSchema = properties?.[input.field];
    if (!fieldSchema) {
      throw new Error(`Field '${input.field}' not found in intake schema`);
    }

    // Generate signed upload URL from storage backend
    const signedUrl = await this.storageBackend.generateUploadUrl({
      intakeId: submission.intakeId,
      submissionId: submission.id,
      fieldPath: input.field,
      filename: input.filename,
      mimeType: input.mimeType,
      constraints: {
        maxSize: input.sizeBytes,
        allowedTypes: [input.mimeType],
        maxCount: 1,
      },
    });

    // Store upload status in submission
    // We store upload tracking data in the fields object under a special key
    const uploadStatus: UploadStatus = {
      uploadId: signedUrl.uploadId,
      field: input.field,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: "pending",
    };

    // Track uploads in the submission's fields under __uploads
    const uploads = (submission.fields.__uploads as Record<string, UploadStatus>) || {};
    uploads[signedUrl.uploadId] = uploadStatus;
    submission.fields.__uploads = uploads;

    const now = new Date().toISOString();
    submission.updatedAt = now;

    // Update state to awaiting_upload if currently in draft or in_progress
    if (submission.state === "draft" || submission.state === "in_progress") {
      assertValidTransition(submission.state, "awaiting_upload");
      submission.state = "awaiting_upload";
    }

    // Generate new resume token
    const newResumeToken = `rtok_${randomUUID()}`;
    submission.resumeToken = newResumeToken;

    // Emit upload requested event (recordEvent will save the submission)
    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type: "upload.requested",
      submissionId: submission.id,
      ts: now,
      actor: input.actor,
      state: submission.state,
      payload: {
        uploadId: signedUrl.uploadId,
        field: input.field,
        filename: input.filename,
        sizeBytes: input.sizeBytes,
      },
    };

    await this.recordEvent(submission, event);

    // Calculate expiration in milliseconds
    const expiresInMs = new Date(signedUrl.expiresAt).getTime() - Date.now();

    return {
      ok: true,
      uploadId: signedUrl.uploadId,
      method: signedUrl.method,
      url: signedUrl.url,
      headers: signedUrl.headers,
      expiresInMs,
      constraints: {
        accept: signedUrl.constraints.allowedTypes,
        maxBytes: signedUrl.constraints.maxSize,
      },
    };
  }

  /**
   * Confirms that a file upload has been completed.
   * Implements the file upload confirmation protocol.
   *
   * @param input - ConfirmUpload operation input
   * @returns ConfirmUploadOutput or throws an error
   */
  async confirmUpload(
    input: ConfirmUploadInput
  ): Promise<ConfirmUploadOutput> {
    // Validate storage backend is configured
    if (!this.storageBackend) {
      throw new Error("Storage backend not configured");
    }

    // Get submission
    const submission = await this.store.get(input.submissionId);
    if (!submission) {
      throw new SubmissionNotFoundError(input.submissionId);
    }

    // Verify resume token
    if (submission.resumeToken !== input.resumeToken) {
      throw new InvalidResumeTokenError();
    }

    // Find upload in submission
    const uploads = (submission.fields.__uploads as Record<string, UploadStatus>) || {};
    const uploadStatus = uploads[input.uploadId];
    if (!uploadStatus) {
      throw new Error(`Upload not found: ${input.uploadId}`);
    }

    // Verify upload with storage backend
    const verificationResult = await this.storageBackend.verifyUpload(input.uploadId);

    // Map storage backend status to submission upload status
    // Note: storage backend 'expired' status is mapped to 'failed'
    let mappedStatus: "pending" | "completed" | "failed";
    if (verificationResult.status === "expired") {
      mappedStatus = "failed";
    } else {
      mappedStatus = verificationResult.status as "pending" | "completed" | "failed";
    }

    // Update upload status based on verification
    uploadStatus.status = mappedStatus;
    if (verificationResult.file) {
      uploadStatus.uploadedAt = verificationResult.file.uploadedAt;
      uploadStatus.url = verificationResult.file.storageKey;
    }

    const now = new Date().toISOString();
    submission.updatedAt = now;
    submission.fields.__uploads = uploads;

    // Update submission state based on upload result
    if (mappedStatus === "completed") {
      // Check if there are any remaining pending uploads
      const hasPendingUploads = Object.values(uploads).some(
        (u) => u.status === "pending"
      );

      // If no more pending uploads, transition back to in_progress
      if (!hasPendingUploads && submission.state === "awaiting_upload") {
        assertValidTransition(submission.state, "in_progress");
        submission.state = "in_progress";
      }

      // Rotate resume token only after successful verification
      const newResumeToken = `rtok_${randomUUID()}`;
      submission.resumeToken = newResumeToken;

      // Emit upload completed event (recordEvent will save the submission)
      const event: IntakeEvent = {
        eventId: `evt_${randomUUID()}`,
        type: "upload.completed",
        submissionId: submission.id,
        ts: now,
        actor: input.actor,
        state: submission.state,
        payload: {
          uploadId: input.uploadId,
          field: uploadStatus.field,
          filename: uploadStatus.filename,
          sizeBytes: uploadStatus.sizeBytes,
        },
      };

      await this.recordEvent(submission, event);

      return {
        ok: true,
        submissionId: submission.id,
        state: submission.state,
        resumeToken: newResumeToken,
        field: uploadStatus.field,
      };
    } else {
      // Emit upload failed event (do NOT rotate resume token on failure)
      // recordEvent will save the submission
      const event: IntakeEvent = {
        eventId: `evt_${randomUUID()}`,
        type: "upload.failed",
        submissionId: submission.id,
        ts: now,
        actor: input.actor,
        state: submission.state,
        payload: {
          uploadId: input.uploadId,
          field: uploadStatus.field,
          error: verificationResult.error,
        },
      };

      await this.recordEvent(submission, event);

      throw new Error(
        `Upload verification failed: ${verificationResult.error ?? "Unknown error"}`
      );
    }
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
      assertValidTransition(submission.state, "needs_review");
      submission.state = "needs_review";
      submission.updatedAt = now;
      submission.updatedBy = request.actor;

      // Emit review.requested event (recordEvent will save the submission)
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

      await this.recordEvent(submission, reviewEvent);

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
    assertValidTransition(submission.state, "submitted");
    submission.state = "submitted";
    submission.updatedAt = now;
    submission.updatedBy = request.actor;

    // Emit submission.submitted event (recordEvent will save the submission)
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

    await this.recordEvent(submission, event);

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
   * Get intake details for a submission (schema and metadata)
   */
  async getIntakeDetailsForSubmission(submission: Submission): Promise<{ schema: unknown; intakeDefinition?: IntakeDefinition }> {
    // If intake registry is available, get the full intake definition
    if (this.intakeRegistry) {
      try {
        const intakeDefinition = this.intakeRegistry.getIntake(submission.intakeId);
        return {
          schema: intakeDefinition.schema,
          intakeDefinition
        };
      } catch {
        // If intake not found in registry, return empty schema
        return { schema: { type: 'object', properties: {} } };
      }
    }
    
    // Fallback to empty schema if no intake registry
    return { schema: { type: 'object', properties: {} } };
  }

  /**
   * Get events for a submission
   * Returns the event stream from the EventStore for audit trail purposes
   */
  async getEvents(
    submissionId: string,
    filters?: import("./event-store.js").EventFilters
  ): Promise<IntakeEvent[]> {
    const submission = await this.store.get(submissionId);
    if (!submission) {
      throw new SubmissionNotFoundError(submissionId);
    }
    return this.eventStore.getEvents(submissionId, filters);
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

    await this.recordEvent(submission, event);

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

    await this.recordEvent(submission, event);

    return event.eventId;
  }
}
