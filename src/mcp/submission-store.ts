/**
 * InMemorySubmissionStore — the SubmissionStore used by SubmissionManager for
 * field-attribution tracking (resume-token + idempotency-key indexed).
 *
 * The former MCP-only `MCPSessionStore` was removed: the MCP transport now runs
 * on the same shared SubmissionManager lifecycle as HTTP, so there is no
 * parallel data-only store.
 */

import type { Submission, SubmissionEntry } from "../submission-types";
import type { SubmissionStore as ISubmissionStore } from "../core/submission-manager.js";
import { timingSafeTokenCompare } from "../core/errors.js";

/**
 * In-memory implementation of SubmissionStore interface
 * Used by SubmissionManager for field attribution tracking
 */
export class InMemorySubmissionStore implements ISubmissionStore {
  private submissions: Map<string, SubmissionEntry> = new Map();
  private resumeTokenIndex: Map<string, string> = new Map(); // resumeToken -> submissionId
  private idempotencyKeyIndex: Map<string, string> = new Map(); // idempotencyKey -> submissionId
  private lastKnownToken: Map<string, string> = new Map(); // submissionId -> last saved token

  /**
   * Get submission by ID
   */
  async get(submissionId: string): Promise<Submission | null> {
    const entry = this.submissions.get(submissionId);
    return entry ? entry.submission : null;
  }

  /**
   * Save submission
   * Stores submission with field attribution for audit trail
   */
  async save(submission: Submission): Promise<void> {
    // O(1) stale token cleanup using reverse index
    const oldToken = this.lastKnownToken.get(submission.id);
    if (oldToken && !timingSafeTokenCompare(oldToken, submission.resumeToken)) {
      this.resumeTokenIndex.delete(oldToken);
    }

    const entry: SubmissionEntry = {
      submission,
      resumeToken: submission.resumeToken,
    };

    this.submissions.set(submission.id, entry);
    this.resumeTokenIndex.set(submission.resumeToken, submission.id);
    this.lastKnownToken.set(submission.id, submission.resumeToken);
    if (submission.idempotencyKey) {
      this.idempotencyKeyIndex.set(submission.idempotencyKey, submission.id);
    }
  }

  /**
   * Get submission by resume token — O(1) via index
   */
  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    const submissionId = this.resumeTokenIndex.get(resumeToken);
    if (!submissionId) {
      return null;
    }

    const entry = this.submissions.get(submissionId);
    return entry ? entry.submission : null;
  }

  /**
   * Get submission by idempotency key — O(1) via index
   */
  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    const submissionId = this.idempotencyKeyIndex.get(key);
    if (!submissionId) return null;
    const entry = this.submissions.get(submissionId);
    return entry ? entry.submission : null;
  }

  /**
   * Clear all submissions (useful for testing)
   */
  clear(): void {
    this.submissions.clear();
    this.resumeTokenIndex.clear();
    this.idempotencyKeyIndex.clear();
    this.lastKnownToken.clear();
  }

  /**
   * Get all submissions (useful for debugging)
   */
  getAll(): SubmissionEntry[] {
    return Array.from(this.submissions.values());
  }
}
