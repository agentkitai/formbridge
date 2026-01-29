/**
 * In-memory submission store implementation
 * Stores submissions with field attribution for mixed-mode agent-human collaboration
 */

import type { Submission, SubmissionEntry } from "../types";
import type { SubmissionStore as ISubmissionStore } from "../core/submission-manager";

/**
 * In-memory implementation of SubmissionStore
 * Uses SubmissionEntry to store submissions with field attribution tracking
 */
export class InMemorySubmissionStore implements ISubmissionStore {
  private submissions: Map<string, SubmissionEntry> = new Map();
  private resumeTokenIndex: Map<string, string> = new Map();

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
    const entry: SubmissionEntry = {
      submission,
      resumeToken: submission.resumeToken,
    };

    this.submissions.set(submission.id, entry);
    this.resumeTokenIndex.set(submission.resumeToken, submission.id);
  }

  /**
   * Get submission by resume token
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
   * Clear all submissions (useful for testing)
   */
  clear(): void {
    this.submissions.clear();
    this.resumeTokenIndex.clear();
  }

  /**
   * Get all submissions (useful for debugging)
   */
  getAll(): SubmissionEntry[] {
    return Array.from(this.submissions.values());
  }
}
