/**
 * FormBridge API Client
 * Handles communication with the backend API including event emission
 */

import type { Actor } from '../types';

/**
 * Field-level comment for request_changes action
 */
export interface FieldComment {
  fieldPath: string;
  comment: string;
  suggestedValue?: unknown;
}

/**
 * Event emission response
 */
export interface EmitEventResponse {
  ok: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Approval action response
 */
export interface ApprovalResponse {
  ok: boolean;
  submissionId?: string;
  state?: string;
  resumeToken?: string;
  error?: string;
}

/**
 * API client configuration options
 */
export interface ApiClientOptions {
  /** Base URL for the API (default: http://localhost:3000) */
  endpoint?: string;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

/**
 * FormBridge API Client
 *
 * Provides methods for interacting with the FormBridge backend API,
 * including event emission for the agent-to-human handoff workflow
 * and approval actions for the review workflow.
 *
 * @example
 * ```typescript
 * const client = new FormBridgeApiClient({
 *   endpoint: 'https://api.formbridge.example.com'
 * });
 *
 * // Emit HANDOFF_RESUMED event when human opens resume URL
 * await client.emitHandoffResumed('rtok_abc123', {
 *   kind: 'human',
 *   id: 'user-123',
 *   name: 'John Doe'
 * });
 *
 * // Approve a submission
 * await client.approve('sub_123', 'rtok_abc123', {
 *   kind: 'human',
 *   id: 'reviewer-1',
 *   name: 'Jane Doe'
 * }, 'Approved');
 * ```
 */
export class FormBridgeApiClient {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(options: ApiClientOptions = {}) {
    this.endpoint = options.endpoint || 'http://localhost:3000';
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Emit HANDOFF_RESUMED event when a human opens a resume URL
   *
   * This notifies the backend that a human has resumed working on a submission
   * that was previously started by an agent. The backend will emit a handoff.resumed
   * event for audit trail purposes.
   *
   * @param resumeToken - The resume token from the URL
   * @param actor - The actor (human) who is resuming the form
   * @returns Response indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await client.emitHandoffResumed('rtok_abc123', {
   *   kind: 'human',
   *   id: 'user-123',
   *   name: 'John Doe'
   * });
   *
   * if (result.ok) {
   *   console.log('Event emitted:', result.eventId);
   * } else {
   *   console.error('Failed to emit event:', result.error);
   * }
   * ```
   */
  async emitHandoffResumed(
    resumeToken: string,
    actor: Actor
  ): Promise<EmitEventResponse> {
    try {
      const url = `${this.endpoint}/submissions/resume/${encodeURIComponent(resumeToken)}/resumed`;

      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ actor }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          ok: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        ok: true,
        eventId: data.eventId,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Fetch submission by resume token
   *
   * @param resumeToken - The resume token from the URL
   * @returns Submission data or null if not found
   */
  async getSubmissionByResumeToken(resumeToken: string): Promise<any> {
    const url = `${this.endpoint}/submissions/resume/${encodeURIComponent(resumeToken)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Submission not found. The resume link may be invalid or expired.');
      }
      if (response.status === 403) {
        throw new Error('Access denied. This resume link may have already been used.');
      }
      throw new Error(`Failed to fetch submission: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Approve a submission that is in needs_review state
   *
   * @param submissionId - The submission ID to approve
   * @param resumeToken - The resume token for verification
   * @param actor - The actor (reviewer) performing the approval
   * @param comment - Optional approval comment
   * @returns Response indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await client.approve('sub_123', 'rtok_abc123', {
   *   kind: 'human',
   *   id: 'reviewer-1',
   *   name: 'Jane Doe'
   * }, 'Looks good!');
   *
   * if (result.ok) {
   *   console.log('Approved:', result.submissionId, result.state);
   * } else {
   *   console.error('Failed to approve:', result.error);
   * }
   * ```
   */
  async approve(
    submissionId: string,
    resumeToken: string,
    actor: Actor,
    comment?: string
  ): Promise<ApprovalResponse> {
    try {
      const url = `${this.endpoint}/api/submissions/${encodeURIComponent(submissionId)}/approve`;

      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ resumeToken, actor, comment }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          ok: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        ok: true,
        submissionId: data.submissionId,
        state: data.state,
        resumeToken: data.resumeToken,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Reject a submission that is in needs_review state
   *
   * @param submissionId - The submission ID to reject
   * @param resumeToken - The resume token for verification
   * @param actor - The actor (reviewer) performing the rejection
   * @param reason - Required rejection reason
   * @param comment - Optional additional comment
   * @returns Response indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await client.reject('sub_123', 'rtok_abc123', {
   *   kind: 'human',
   *   id: 'reviewer-1',
   *   name: 'Jane Doe'
   * }, 'Missing required documents');
   *
   * if (result.ok) {
   *   console.log('Rejected:', result.submissionId, result.state);
   * } else {
   *   console.error('Failed to reject:', result.error);
   * }
   * ```
   */
  async reject(
    submissionId: string,
    resumeToken: string,
    actor: Actor,
    reason: string,
    comment?: string
  ): Promise<ApprovalResponse> {
    try {
      const url = `${this.endpoint}/api/submissions/${encodeURIComponent(submissionId)}/reject`;

      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ resumeToken, actor, reason, comment }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          ok: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        ok: true,
        submissionId: data.submissionId,
        state: data.state,
        resumeToken: data.resumeToken,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Request changes on a submission that is in needs_review state
   *
   * @param submissionId - The submission ID to request changes on
   * @param resumeToken - The resume token for verification
   * @param actor - The actor (reviewer) requesting changes
   * @param fieldComments - Array of field-level comments with suggested changes
   * @param comment - Optional overall comment
   * @returns Response indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await client.requestChanges('sub_123', 'rtok_abc123', {
   *   kind: 'human',
   *   id: 'reviewer-1',
   *   name: 'Jane Doe'
   * }, [
   *   { fieldPath: 'vendorName', comment: 'Please provide full legal name' },
   *   { fieldPath: 'email', comment: 'Invalid email format', suggestedValue: 'user@example.com' }
   * ]);
   *
   * if (result.ok) {
   *   console.log('Changes requested:', result.submissionId, result.state);
   * } else {
   *   console.error('Failed to request changes:', result.error);
   * }
   * ```
   */
  async requestChanges(
    submissionId: string,
    resumeToken: string,
    actor: Actor,
    fieldComments: FieldComment[],
    comment?: string
  ): Promise<ApprovalResponse> {
    try {
      const url = `${this.endpoint}/api/submissions/${encodeURIComponent(submissionId)}/request-changes`;

      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ resumeToken, actor, fieldComments, comment }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          ok: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        ok: true,
        submissionId: data.submissionId,
        state: data.state,
        resumeToken: data.resumeToken,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

/**
 * Create a new FormBridge API client instance
 *
 * @param options - Client configuration options
 * @returns New API client instance
 *
 * @example
 * ```typescript
 * const client = createApiClient({
 *   endpoint: 'https://api.formbridge.example.com'
 * });
 * ```
 */
export function createApiClient(options?: ApiClientOptions): FormBridgeApiClient {
  return new FormBridgeApiClient(options);
}

/**
 * Default API client instance using default options
 */
export const defaultApiClient = new FormBridgeApiClient();
