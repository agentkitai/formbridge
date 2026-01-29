/**
 * API client for FormBridge Intake Contract
 * Implements HTTP/JSON binding as specified in INTAKE_CONTRACT_SPEC.md
 */

import {
  IntakeSchema,
  FormData,
  Actor,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  SubmitRequest,
  SubmitResponse,
} from '../types';
import { IntakeError } from '../types/error';

/**
 * Configuration for API client
 */
export interface ApiClientConfig {
  /** Base URL for the FormBridge API */
  baseUrl: string;
  /** Optional headers to include in all requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Optional fetch implementation (for testing/custom transports) */
  fetch?: typeof fetch;
}

/**
 * Request to set fields on a submission
 */
export interface SetFieldsRequest {
  submissionId: string;
  resumeToken: string;
  actor: Actor;
  fields: FormData;
}

/**
 * Response from setFields operation
 */
export interface SetFieldsResponse {
  ok: true;
  submissionId: string;
  state: 'in_progress' | 'awaiting_input' | 'awaiting_upload';
  resumeToken: string;
  missingFields?: string[];
}

/**
 * Request to validate a submission
 */
export interface ValidateRequest {
  submissionId: string;
  resumeToken: string;
}

/**
 * Response from validate operation
 */
export interface ValidateResponse {
  ok: true;
  submissionId: string;
  state: 'in_progress' | 'awaiting_input' | 'awaiting_upload';
  resumeToken: string;
  ready: boolean;
  missingFields?: string[];
}

/**
 * Response from getSubmission operation
 */
export interface GetSubmissionResponse {
  ok: true;
  submissionId: string;
  state: string;
  resumeToken: string;
  schema: IntakeSchema;
  fields: FormData;
  createdAt: string;
  updatedAt: string;
}

/**
 * API client error
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * API client for FormBridge Intake Contract
 */
export class FormBridgeApiClient {
  private config: Required<ApiClientConfig>;

  constructor(config: ApiClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      headers: config.headers || {},
      timeout: config.timeout || 30000,
      fetch: config.fetch || globalThis.fetch,
    };
  }

  /**
   * Make an HTTP request with timeout and error handling
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | IntakeError> {
    const url = `${this.config.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await this.config.fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      // Check if response is an IntakeError
      if (!response.ok || data.ok === false) {
        // Return IntakeError for structured errors
        if (this.isIntakeError(data)) {
          return data as IntakeError;
        }

        // Throw ApiClientError for other errors
        throw new ApiClientError(
          data.message || `Request failed with status ${response.status}`,
          response.status,
          data
        );
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiClientError(`Request timeout after ${this.config.timeout}ms`);
        }
        throw new ApiClientError(error.message);
      }

      throw new ApiClientError('Unknown error occurred');
    }
  }

  /**
   * Type guard to check if response is an IntakeError
   */
  private isIntakeError(data: unknown): data is IntakeError {
    return (
      typeof data === 'object' &&
      data !== null &&
      'ok' in data &&
      data.ok === false &&
      'submissionId' in data &&
      'state' in data &&
      'resumeToken' in data &&
      'error' in data
    );
  }

  /**
   * Create a new submission
   * POST /intakes/{intakeId}/submissions
   */
  async createSubmission(
    request: CreateSubmissionRequest
  ): Promise<CreateSubmissionResponse | IntakeError> {
    const { intakeId, ...body } = request;
    return this.request<CreateSubmissionResponse>(
      'POST',
      `/intakes/${encodeURIComponent(intakeId)}/submissions`,
      body
    );
  }

  /**
   * Set or update fields on a submission
   * PATCH /submissions/{submissionId}/fields
   */
  async setFields(
    request: SetFieldsRequest
  ): Promise<SetFieldsResponse | IntakeError> {
    const { submissionId, ...body } = request;
    return this.request<SetFieldsResponse>(
      'PATCH',
      `/submissions/${encodeURIComponent(submissionId)}/fields`,
      body
    );
  }

  /**
   * Validate a submission without submitting
   * POST /submissions/{submissionId}/validate
   */
  async validate(
    request: ValidateRequest
  ): Promise<ValidateResponse | IntakeError> {
    const { submissionId, ...body } = request;
    return this.request<ValidateResponse>(
      'POST',
      `/submissions/${encodeURIComponent(submissionId)}/validate`,
      body
    );
  }

  /**
   * Submit a submission for finalization
   * POST /submissions/{submissionId}/submit
   */
  async submit(request: SubmitRequest): Promise<SubmitResponse | IntakeError> {
    const { submissionId, ...body } = request;
    return this.request<SubmitResponse>(
      'POST',
      `/submissions/${encodeURIComponent(submissionId)}/submit`,
      body
    );
  }

  /**
   * Get current submission state
   * GET /submissions/{submissionId}
   */
  async getSubmission(
    submissionId: string
  ): Promise<GetSubmissionResponse | IntakeError> {
    return this.request<GetSubmissionResponse>(
      'GET',
      `/submissions/${encodeURIComponent(submissionId)}`
    );
  }
}

/**
 * Create a new API client instance
 */
export function createApiClient(config: ApiClientConfig): FormBridgeApiClient {
  return new FormBridgeApiClient(config);
}
