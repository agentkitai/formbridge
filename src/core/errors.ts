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
