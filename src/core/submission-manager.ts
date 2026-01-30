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
import { Validator } from "../validation/validator.js";
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
  private validator: Validator;

  constructor(
    private store: SubmissionStore,
    private eventEmitter: EventEmitter,
    private baseUrl: string = "http://localhost:3000",
    private storageBackend?: StorageBackend
  ) {
    // Initialize validator with event emitter for audit trail
    this.validator = new Validator(eventEmitter);
  }

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

    // Update state if still in draft
    if (submission.state === "draft") {
      submission.state = "in_progress";
    }

    await this.store.save(submission);

    // Emit field.updated event for each field
    for (const fieldUpdate of fieldUpdates) {
      const event: IntakeEvent = {
        eventId: `evt_${randomUUID()}`,
        type: "field.updated",
        submissionId: submission.id,
        ts: now,
        actor: request.actor,
        state: submission.state,
        payload: {
          fieldPath: fieldUpdate.fieldPath,
          oldValue: fieldUpdate.oldValue,
          newValue: fieldUpdate.newValue,
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
      submission.state = "awaiting_upload";
    }

    // Generate new resume token
    const newResumeToken = `rtok_${randomUUID()}`;
    submission.resumeToken = newResumeToken;

    await this.store.save(submission);

    // Emit upload requested event
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

    submission.events.push(event);
    await this.eventEmitter.emit(event);
    await this.store.save(submission);

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
        submission.state = "in_progress";
      }

      // Rotate resume token only after successful verification
      const newResumeToken = `rtok_${randomUUID()}`;
      submission.resumeToken = newResumeToken;

      await this.store.save(submission);

      // Emit upload completed event
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

      submission.events.push(event);
      await this.eventEmitter.emit(event);
      await this.store.save(submission);

      return {
        ok: true,
        submissionId: submission.id,
        state: submission.state,
        resumeToken: newResumeToken,
        field: uploadStatus.field,
      };
    } else {
      await this.store.save(submission);

      // Emit upload failed event (do NOT rotate resume token on failure)
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

      submission.events.push(event);
      await this.eventEmitter.emit(event);
      await this.store.save(submission);

      throw new Error(
        `Upload verification failed: ${verificationResult.error ?? "Unknown error"}`
      );
    }
  }

  /**
   * Submit a submission for processing
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

    // Update state
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
   * Get events for a submission
   * Returns the full event stream for audit trail purposes
   */
  async getEvents(submissionId: string): Promise<IntakeEvent[]> {
    const submission = await this.store.get(submissionId);

    if (!submission) {
      throw new SubmissionNotFoundError(submissionId);
    }

    return submission.events || [];
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
