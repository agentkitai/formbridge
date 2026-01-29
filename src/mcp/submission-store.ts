/**
 * Submission State Management
 *
 * This module implements in-memory submission state tracking with
 * resumeToken-based access and idempotency key support.
 */

import { randomBytes } from 'crypto';
import { SubmissionState, type Actor } from '../types/intake-contract.js';

/**
 * Submission state entry stored in memory
 */
export interface SubmissionEntry {
  /** Unique submission identifier */
  submissionId: string;
  /** Resume token for this submission */
  resumeToken: string;
  /** Intake form ID */
  intakeId: string;
  /** Current submission data */
  data: Record<string, unknown>;
  /** Current submission state */
  state: SubmissionState;
  /** Optional idempotency key */
  idempotencyKey?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Actor who created the submission */
  actor?: Actor;
}

/**
 * In-memory submission store
 *
 * Tracks active submission sessions with resumeToken-based access.
 * In production, this should be replaced with a persistent store.
 */
export class SubmissionStore {
  private submissions = new Map<string, SubmissionEntry>();
  private idempotencyKeys = new Map<string, string>(); // idempotencyKey -> resumeToken

  /**
   * Creates a new submission entry
   */
  create(
    intakeId: string,
    data: Record<string, unknown> = {},
    idempotencyKey?: string,
    actor?: Actor
  ): SubmissionEntry {
    const submissionId = this.generateId();
    const resumeToken = this.generateToken();

    const entry: SubmissionEntry = {
      submissionId,
      resumeToken,
      intakeId,
      data,
      state: SubmissionState.CREATED,
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
      actor
    };

    this.submissions.set(resumeToken, entry);

    if (idempotencyKey) {
      this.idempotencyKeys.set(idempotencyKey, resumeToken);
    }

    return entry;
  }

  /**
   * Gets a submission by resume token
   */
  get(resumeToken: string): SubmissionEntry | undefined {
    return this.submissions.get(resumeToken);
  }

  /**
   * Gets a submission by idempotency key
   */
  getByIdempotencyKey(idempotencyKey: string): SubmissionEntry | undefined {
    const resumeToken = this.idempotencyKeys.get(idempotencyKey);
    return resumeToken ? this.submissions.get(resumeToken) : undefined;
  }

  /**
   * Updates a submission entry
   */
  update(resumeToken: string, updates: Partial<SubmissionEntry>): SubmissionEntry | undefined {
    const entry = this.submissions.get(resumeToken);
    if (!entry) {
      return undefined;
    }

    const updated = {
      ...entry,
      ...updates,
      updatedAt: new Date()
    };

    this.submissions.set(resumeToken, updated);
    return updated;
  }

  /**
   * Deletes a submission entry
   */
  delete(resumeToken: string): boolean {
    const entry = this.submissions.get(resumeToken);
    if (entry?.idempotencyKey) {
      this.idempotencyKeys.delete(entry.idempotencyKey);
    }
    return this.submissions.delete(resumeToken);
  }

  /**
   * Generates a unique submission ID
   */
  private generateId(): string {
    return `sub_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Generates a secure resume token
   */
  private generateToken(): string {
    return `tok_${randomBytes(16).toString('hex')}`;
  }
}
