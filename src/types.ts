/**
 * Core FormBridge types
 */

import type { Actor, SubmissionState, IntakeEvent } from "./types/intake-contract";

/**
 * Field-level actor attribution
 * Maps field paths to the actor who filled them
 */
export interface FieldAttribution {
  [fieldPath: string]: Actor;
}

/**
 * Submission record with field-level attribution tracking
 */
export interface Submission {
  id: string;
  intakeId: string;
  state: SubmissionState;
  resumeToken: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;

  /**
   * Current field values
   */
  fields: Record<string, unknown>;

  /**
   * Field-level attribution - tracks which actor filled each field
   * Enables mixed-mode workflows where agents fill some fields and humans fill others
   */
  fieldAttribution: FieldAttribution;

  /**
   * Actor who created this submission
   */
  createdBy: Actor;

  /**
   * Most recent actor to update this submission
   */
  updatedBy: Actor;

  /**
   * Idempotency key used for creation (if any)
   */
  idempotencyKey?: string;

  /**
   * Event history for this submission
   */
  events: IntakeEvent[];

  /**
   * TTL in milliseconds
   */
  ttlMs?: number;
}

/**
 * Submission entry stored in submission store
 */
export interface SubmissionEntry {
  submission: Submission;
  resumeToken: string;
}
