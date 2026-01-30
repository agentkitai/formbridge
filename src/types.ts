/**
 * Core FormBridge types
 */

import type { Actor, SubmissionState, IntakeEvent } from "./types/intake-contract";

// Re-export types that other modules import from this file
export type {
  Actor,
  SubmissionState,
  IntakeEvent,
  IntakeEventType,
  FieldError,
  NextAction,
  IntakeError,
  IntakeDefinition,
  ApprovalGate,
  Destination,
} from "./types/intake-contract";

/**
 * Simplified JSON Schema type.
 */
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean | JSONSchema;
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  // File-specific constraints (for format: 'binary')
  maxSize?: number;
  allowedTypes?: string[];
  maxCount?: number;
}

/**
 * Field-level error codes for validation failures.
 */
export type FieldErrorCode =
  | 'required'
  | 'invalid_type'
  | 'invalid_format'
  | 'invalid_value'
  | 'too_long'
  | 'too_short'
  | 'file_required'
  | 'file_too_large'
  | 'file_wrong_type'
  | 'custom';

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
