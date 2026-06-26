/**
 * Shared error classes for FormBridge core services.
 *
 * Centralized here to avoid instanceof checks failing when
 * error classes are defined in multiple modules.
 */

import type { SubmissionState } from "../types/intake-contract.js";
import { timingSafeEqual } from "crypto";

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

export class InvalidStateError extends Error {
  constructor(currentState: SubmissionState, requiredState: SubmissionState) {
    super(
      `Submission is in state '${currentState}', must be '${requiredState}' for this operation`
    );
    this.name = "InvalidStateError";
  }
}

/**
 * Constant-time string comparison for resume tokens.
 * Prevents timing attacks that could leak token characters.
 */
export function timingSafeTokenCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Requested receipt does not exist (#15). */
export class ReceiptNotFoundError extends Error {
  constructor(submissionId: string) {
    super(`Receipt not found for submission: ${submissionId}`);
    this.name = "ReceiptNotFoundError";
  }
}

/** A receipt JWT failed verification (#15). */
export class ReceiptVerificationError extends Error {
  constructor(message = "Receipt verification failed") {
    super(message);
    this.name = "ReceiptVerificationError";
  }
}

/** Receipt signing/verification attempted with no signing key configured (#15). */
export class ReceiptSigningDisabledError extends Error {
  constructor(message = "Receipt signing is not configured (no signing key)") {
    super(message);
    this.name = "ReceiptSigningDisabledError";
  }
}
