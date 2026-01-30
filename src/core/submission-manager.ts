/**
 * SubmissionManager - Core business logic for managing submission lifecycle
 *
 * Implements:
 * - In-memory submission storage (Map<submissionId, Submission>)
 * - State machine transitions per §2.2 of INTAKE_CONTRACT_SPEC
 * - Resume token generation and validation
 * - Idempotency key tracking
 * - Event stream recording
 *
 * Based on INTAKE_CONTRACT_SPEC.md v0.1.0-draft
 */

import { randomBytes } from 'crypto';
import type {
  Submission,
  SubmissionState,
  IntakeDefinition,
  Actor,
  IntakeEvent,
  CreateSubmissionInput,
  CreateSubmissionOutput,
  SetFieldsInput,
  SetFieldsOutput,
  GetSubmissionInput,
  GetSubmissionOutput,
  FieldError,
  NextAction,
  IntakeEventType,
  RequestUploadInput,
  RequestUploadOutput,
  ConfirmUploadInput,
  ConfirmUploadOutput,
  UploadStatus,
} from '../types.js';
import type { StorageBackend } from '../storage/storage-backend.js';

/**
 * Configuration options for SubmissionManager
 */
export interface SubmissionManagerConfig {
  /** Default TTL for submissions in milliseconds (default: 7 days) */
  defaultTtlMs?: number;
  /** Storage backend for file uploads (required for upload operations) */
  storageBackend?: StorageBackend;
}

/**
 * SubmissionManager handles the lifecycle of all submissions.
 *
 * Responsibilities:
 * - Creating new submissions (with idempotency)
 * - Updating submission fields
 * - Managing state transitions
 * - Tracking events
 * - Enforcing resume token validation
 */
export class SubmissionManager {
  private submissions: Map<string, Submission> = new Map();
  private events: Map<string, IntakeEvent[]> = new Map();
  private idempotencyKeys: Map<string, string> = new Map();
  private readonly config: Required<Omit<SubmissionManagerConfig, 'storageBackend'>>;
  private readonly storageBackend?: StorageBackend;

  constructor(config: SubmissionManagerConfig = {}) {
    this.config = {
      defaultTtlMs: config.defaultTtlMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    this.storageBackend = config.storageBackend;
  }

  /**
   * Creates a new submission for the given intake definition.
   * Implements §4.1 of the spec.
   *
   * @param input - CreateSubmission operation input
   * @param intakeDefinition - The intake definition to use
   * @returns CreateSubmissionOutput or throws an error
   */
  createSubmission(
    input: CreateSubmissionInput,
    intakeDefinition: IntakeDefinition
  ): CreateSubmissionOutput {
    // Check idempotency key
    if (input.idempotencyKey) {
      const existingSubmissionId = this.idempotencyKeys.get(input.idempotencyKey);
      if (existingSubmissionId) {
        const existing = this.submissions.get(existingSubmissionId);
        if (existing) {
          // Return existing submission
          return {
            ok: true,
            submissionId: existing.id,
            state: existing.state as 'draft' | 'in_progress',
            resumeToken: existing.resumeToken,
            schema: intakeDefinition.schema,
            missingFields: this.findMissingFields(existing.fields, intakeDefinition.schema),
          };
        }
      }
      // Register idempotency key
      this.idempotencyKeys.set(input.idempotencyKey, this.generateSubmissionId());
    }

    // Generate IDs
    const submissionId = input.idempotencyKey
      ? this.idempotencyKeys.get(input.idempotencyKey)!
      : this.generateSubmissionId();
    const resumeToken = this.generateResumeToken();

    // Determine initial state
    const hasInitialFields = input.initialFields && Object.keys(input.initialFields).length > 0;
    const initialState: SubmissionState = hasInitialFields ? 'in_progress' : 'draft';

    // Calculate expiration
    const now = new Date().toISOString();
    const ttlMs = input.ttlMs ?? intakeDefinition.ttlMs ?? this.config.defaultTtlMs;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    // Create submission
    const submission: Submission = {
      id: submissionId,
      intakeId: input.intakeId,
      state: initialState,
      resumeToken,
      fields: input.initialFields ?? {},
      metadata: {
        createdAt: now,
        updatedAt: now,
        createdBy: input.actor,
        expiresAt,
        idempotencyKeys: input.idempotencyKey ? [input.idempotencyKey] : [],
      },
      uploads: {},
    };

    // Store submission
    this.submissions.set(submissionId, submission);

    // Emit creation event
    this.emitEvent({
      eventId: this.generateEventId(),
      type: 'submission.created',
      submissionId,
      ts: now,
      actor: input.actor,
      state: initialState,
      payload: {
        intakeId: input.intakeId,
        hasInitialFields,
      },
    });

    // Emit field update event if there are initial fields
    if (hasInitialFields) {
      this.emitEvent({
        eventId: this.generateEventId(),
        type: 'field.updated',
        submissionId,
        ts: now,
        actor: input.actor,
        state: initialState,
        payload: {
          fields: Object.keys(input.initialFields!),
        },
      });
    }

    return {
      ok: true,
      submissionId,
      state: initialState,
      resumeToken,
      schema: intakeDefinition.schema,
      missingFields: hasInitialFields
        ? this.findMissingFields(submission.fields, intakeDefinition.schema)
        : undefined,
    };
  }

  /**
   * Sets or updates fields on an existing submission.
   * Implements §4.2 of the spec.
   *
   * @param input - SetFields operation input
   * @param intakeDefinition - The intake definition for validation
   * @returns SetFieldsOutput or throws an error
   */
  setFields(
    input: SetFieldsInput,
    intakeDefinition: IntakeDefinition
  ): SetFieldsOutput {
    // Get submission and validate resume token
    const submission = this.getAndValidateSubmission(input.submissionId, input.resumeToken);

    // Update fields
    const updatedFields = { ...submission.fields, ...input.fields };
    submission.fields = updatedFields;
    submission.metadata.updatedAt = new Date().toISOString();

    // Update state if transitioning from draft
    if (submission.state === 'draft') {
      submission.state = 'in_progress';
    }

    // Generate new resume token
    const newResumeToken = this.generateResumeToken();
    submission.resumeToken = newResumeToken;

    // Emit field update event
    this.emitEvent({
      eventId: this.generateEventId(),
      type: 'field.updated',
      submissionId: input.submissionId,
      ts: submission.metadata.updatedAt,
      actor: input.actor,
      state: submission.state,
      payload: {
        fields: Object.keys(input.fields),
      },
    });

    // Validate and determine next actions
    const { errors, nextActions } = this.validateFields(updatedFields, intakeDefinition);

    return {
      ok: true,
      submissionId: input.submissionId,
      state: submission.state,
      resumeToken: newResumeToken,
      fields: updatedFields,
      errors: errors.length > 0 ? errors : undefined,
      nextActions: nextActions.length > 0 ? nextActions : undefined,
    };
  }

  /**
   * Retrieves a submission by ID.
   * Implements §4.9 of the spec.
   *
   * @param input - GetSubmission operation input
   * @param intakeDefinition - The intake definition for validation
   * @returns GetSubmissionOutput or throws an error
   */
  getSubmission(
    input: GetSubmissionInput,
    intakeDefinition: IntakeDefinition
  ): GetSubmissionOutput {
    const submission = this.submissions.get(input.submissionId);
    if (!submission) {
      throw new Error(`Submission not found: ${input.submissionId}`);
    }

    // Check if expired
    if (submission.metadata.expiresAt) {
      const now = Date.now();
      const expiresAt = new Date(submission.metadata.expiresAt).getTime();
      if (now > expiresAt && submission.state !== 'finalized' && submission.state !== 'cancelled') {
        this.transitionState(submission, 'expired', {
          kind: 'system',
          id: 'submission-manager',
          name: 'System',
        });
      }
    }

    // Validate and get current errors
    const { errors } = this.validateFields(submission.fields, intakeDefinition);

    return {
      ok: true,
      submissionId: submission.id,
      state: submission.state,
      resumeToken: submission.resumeToken,
      intakeId: submission.intakeId,
      fields: submission.fields,
      metadata: submission.metadata,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Requests a signed upload URL for a file field.
   * Implements §4.4 of the spec.
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
      throw new Error('Storage backend not configured');
    }

    // Get submission and validate resume token
    const submission = this.getAndValidateSubmission(input.submissionId, input.resumeToken);

    // TODO: Validate field exists in intakeDefinition.schema and is a file field
    // For now, we trust the caller to provide valid field names
    void intakeDefinition;

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
    const uploadStatus: UploadStatus = {
      uploadId: signedUrl.uploadId,
      field: input.field,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: 'pending',
    };

    if (!submission.uploads) {
      submission.uploads = {};
    }
    submission.uploads[signedUrl.uploadId] = uploadStatus;
    submission.metadata.updatedAt = new Date().toISOString();

    // Update state to awaiting_upload if currently in draft or in_progress
    if (submission.state === 'draft' || submission.state === 'in_progress') {
      submission.state = 'awaiting_upload';
    }

    // Generate new resume token
    const newResumeToken = this.generateResumeToken();
    submission.resumeToken = newResumeToken;

    // Emit upload requested event
    this.emitEvent({
      eventId: this.generateEventId(),
      type: 'upload.requested',
      submissionId: submission.id,
      ts: submission.metadata.updatedAt,
      actor: input.actor,
      state: submission.state,
      payload: {
        uploadId: signedUrl.uploadId,
        field: input.field,
        filename: input.filename,
        sizeBytes: input.sizeBytes,
      },
    });

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
   * Implements §4.5 of the spec.
   *
   * @param input - ConfirmUpload operation input
   * @returns ConfirmUploadOutput or throws an error
   */
  async confirmUpload(
    input: ConfirmUploadInput
  ): Promise<ConfirmUploadOutput> {
    // Validate storage backend is configured
    if (!this.storageBackend) {
      throw new Error('Storage backend not configured');
    }

    // Get submission and validate resume token
    const submission = this.getAndValidateSubmission(input.submissionId, input.resumeToken);

    // Find upload in submission
    const uploadStatus = submission.uploads?.[input.uploadId];
    if (!uploadStatus) {
      throw new Error(`Upload not found: ${input.uploadId}`);
    }

    // Verify upload with storage backend
    const verificationResult = await this.storageBackend.verifyUpload(input.uploadId);

    // Map storage backend status to submission upload status
    // Note: storage backend 'expired' status is mapped to 'failed'
    let mappedStatus: 'pending' | 'completed' | 'failed';
    if (verificationResult.status === 'expired') {
      mappedStatus = 'failed';
    } else {
      mappedStatus = verificationResult.status;
    }

    // Update upload status based on verification
    uploadStatus.status = mappedStatus;
    if (verificationResult.file) {
      uploadStatus.uploadedAt = verificationResult.file.uploadedAt;
      uploadStatus.url = verificationResult.file.storageKey;
    }
    submission.metadata.updatedAt = new Date().toISOString();

    // Generate new resume token
    const newResumeToken = this.generateResumeToken();
    submission.resumeToken = newResumeToken;

    // Update submission state based on upload result
    if (mappedStatus === 'completed') {
      // Check if there are any remaining pending uploads
      const hasPendingUploads = Object.values(submission.uploads || {}).some(
        u => u.status === 'pending'
      );

      // If no more pending uploads, transition back to in_progress
      if (!hasPendingUploads && submission.state === 'awaiting_upload') {
        submission.state = 'in_progress';
      }

      // Emit upload completed event
      this.emitEvent({
        eventId: this.generateEventId(),
        type: 'upload.completed',
        submissionId: submission.id,
        ts: submission.metadata.updatedAt,
        actor: input.actor,
        state: submission.state,
        payload: {
          uploadId: input.uploadId,
          field: uploadStatus.field,
          filename: uploadStatus.filename,
          sizeBytes: uploadStatus.sizeBytes,
        },
      });
    } else {
      // Emit upload failed event
      this.emitEvent({
        eventId: this.generateEventId(),
        type: 'upload.failed',
        submissionId: submission.id,
        ts: submission.metadata.updatedAt,
        actor: input.actor,
        state: submission.state,
        payload: {
          uploadId: input.uploadId,
          field: uploadStatus.field,
          error: verificationResult.error,
        },
      });

      throw new Error(
        `Upload verification failed: ${verificationResult.error ?? 'Unknown error'}`
      );
    }

    return {
      ok: true,
      submissionId: submission.id,
      state: submission.state,
      resumeToken: newResumeToken,
      field: uploadStatus.field,
    };
  }

  /**
   * Updates the state of a submission.
   * Enforces state machine transitions per §2.2 and §2.3.
   *
   * @param submissionId - The submission ID
   * @param newState - The target state
   * @param actor - Who is performing the state change
   * @param eventType - Optional event type (defaults based on state)
   * @param payload - Optional event payload
   */
  updateState(
    submissionId: string,
    newState: SubmissionState,
    actor: Actor,
    eventType?: IntakeEventType,
    payload?: Record<string, unknown>
  ): void {
    const submission = this.submissions.get(submissionId);
    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    this.transitionState(submission, newState, actor, eventType, payload);
  }

  /**
   * Gets events for a submission.
   *
   * @param submissionId - The submission ID
   * @param afterEventId - Optional cursor for pagination
   * @param limit - Maximum number of events to return
   * @returns Array of events
   */
  getEvents(submissionId: string, afterEventId?: string, limit?: number): IntakeEvent[] {
    const events = this.events.get(submissionId) ?? [];

    let startIndex = 0;
    if (afterEventId) {
      const afterIndex = events.findIndex(e => e.eventId === afterEventId);
      if (afterIndex !== -1) {
        startIndex = afterIndex + 1;
      }
    }

    const result = events.slice(startIndex);
    return limit ? result.slice(0, limit) : result;
  }

  /**
   * Checks if a submission exists.
   */
  hasSubmission(submissionId: string): boolean {
    return this.submissions.has(submissionId);
  }

  /**
   * Gets a submission without validation (internal use).
   */
  private getAndValidateSubmission(submissionId: string, resumeToken: string): Submission {
    const submission = this.submissions.get(submissionId);
    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    if (submission.resumeToken !== resumeToken) {
      throw new Error('Invalid resume token');
    }

    return submission;
  }

  /**
   * Transitions a submission to a new state.
   * Emits appropriate event and rotates resume token.
   */
  private transitionState(
    submission: Submission,
    newState: SubmissionState,
    actor: Actor,
    eventType?: IntakeEventType,
    payload?: Record<string, unknown>
  ): void {
    const oldState = submission.state;
    submission.state = newState;
    submission.metadata.updatedAt = new Date().toISOString();

    // Rotate resume token on state change
    submission.resumeToken = this.generateResumeToken();

    // Determine event type if not provided
    const type = eventType ?? this.getEventTypeForStateTransition(oldState, newState);

    this.emitEvent({
      eventId: this.generateEventId(),
      type,
      submissionId: submission.id,
      ts: submission.metadata.updatedAt,
      actor,
      state: newState,
      payload: {
        ...payload,
        previousState: oldState,
      },
    });
  }

  /**
   * Determines the appropriate event type for a state transition.
   */
  private getEventTypeForStateTransition(
    _oldState: SubmissionState,
    newState: SubmissionState
  ): IntakeEventType {
    if (newState === 'submitted') return 'submission.submitted';
    if (newState === 'needs_review') return 'review.requested';
    if (newState === 'approved') return 'review.approved';
    if (newState === 'rejected') return 'review.rejected';
    if (newState === 'finalized') return 'submission.finalized';
    if (newState === 'cancelled') return 'submission.cancelled';
    if (newState === 'expired') return 'submission.expired';
    return 'field.updated'; // default fallback
  }

  /**
   * Emits an event and stores it in the event stream.
   */
  private emitEvent(event: IntakeEvent): void {
    const events = this.events.get(event.submissionId) ?? [];
    events.push(event);
    this.events.set(event.submissionId, events);
  }

  /**
   * Validates fields against the intake schema.
   * Returns validation errors and suggested next actions.
   */
  private validateFields(
    fields: Record<string, unknown>,
    intakeDefinition: IntakeDefinition
  ): { errors: FieldError[]; nextActions: NextAction[] } {
    const errors: FieldError[] = [];
    const nextActions: NextAction[] = [];
    const schema = intakeDefinition.schema;

    // Check required fields
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in fields) || fields[requiredField] === undefined || fields[requiredField] === null) {
          errors.push({
            path: requiredField,
            code: 'required',
            message: `Field '${requiredField}' is required`,
            expected: 'a value',
            received: undefined,
          });

          nextActions.push({
            action: 'collect_field',
            field: requiredField,
            hint: `Please provide a value for '${requiredField}'`,
          });
        }
      }
    }

    // TODO: Add type validation, format validation, etc.
    // For now, this is a basic implementation

    return { errors, nextActions };
  }

  /**
   * Finds missing required fields.
   */
  private findMissingFields(
    fields: Record<string, unknown>,
    schema: { required?: string[] }
  ): string[] | undefined {
    if (!schema.required) {
      return undefined;
    }

    const missing = schema.required.filter(
      field => !(field in fields) || fields[field] === undefined || fields[field] === null
    );

    return missing.length > 0 ? missing : undefined;
  }

  /**
   * Generates a unique submission ID.
   */
  private generateSubmissionId(): string {
    return `sub_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Generates a cryptographically secure resume token.
   */
  private generateResumeToken(): string {
    return `rtok_${randomBytes(32).toString('hex')}`;
  }

  /**
   * Generates a unique event ID.
   */
  private generateEventId(): string {
    return `evt_${randomBytes(16).toString('hex')}`;
  }
}
