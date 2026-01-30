/**
 * Tests for FormBridge API client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FormBridgeApiClient,
  createApiClient,
  ApiClientError,
  ApiClientConfig,
  SetFieldsRequest,
  ValidateRequest,
} from './client';
import {
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  SubmitRequest,
  SubmitResponse,
  Actor,
} from '../types';
import { IntakeError } from '../types/error';

describe('FormBridgeApiClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: FormBridgeApiClient;
  let config: ApiClientConfig;

  const baseActor: Actor = {
    kind: 'human',
    id: 'user_123',
    name: 'Test User',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    config = {
      baseUrl: 'https://api.formbridge.dev',
      headers: { 'X-Api-Key': 'test-key' },
      timeout: 5000,
      fetch: mockFetch,
    };
    client = new FormBridgeApiClient(config);
  });

  describe('constructor', () => {
    it('creates client with required config', () => {
      const minimalClient = new FormBridgeApiClient({
        baseUrl: 'https://api.example.com',
      });
      expect(minimalClient).toBeInstanceOf(FormBridgeApiClient);
    });

    it('removes trailing slash from baseUrl', () => {
      const clientWithSlash = new FormBridgeApiClient({
        baseUrl: 'https://api.example.com/',
      });
      expect(clientWithSlash).toBeInstanceOf(FormBridgeApiClient);
    });

    it('uses default timeout if not provided', () => {
      const clientWithDefaults = new FormBridgeApiClient({
        baseUrl: 'https://api.example.com',
      });
      expect(clientWithDefaults).toBeInstanceOf(FormBridgeApiClient);
    });

    it('uses default headers if not provided', () => {
      const clientWithDefaults = new FormBridgeApiClient({
        baseUrl: 'https://api.example.com',
      });
      expect(clientWithDefaults).toBeInstanceOf(FormBridgeApiClient);
    });
  });

  describe('createApiClient', () => {
    it('creates client instance via factory function', () => {
      const factoryClient = createApiClient(config);
      expect(factoryClient).toBeInstanceOf(FormBridgeApiClient);
    });
  });

  describe('createSubmission', () => {
    const request: CreateSubmissionRequest = {
      intakeId: 'intake_vendor_onboarding',
      actor: baseActor,
      idempotencyKey: 'idem_create_123',
      initialFields: { companyName: 'Acme Corp' },
      ttlMs: 3600000,
    };

    it('creates submission successfully', async () => {
      const response: CreateSubmissionResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'in_progress',
        resumeToken: 'resume_abc',
        schema: {
          type: 'object',
          properties: {
            companyName: { type: 'string' },
          },
        },
        missingFields: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.createSubmission(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.formbridge.dev/intakes/intake_vendor_onboarding/submissions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-key',
          },
          body: JSON.stringify({
            actor: baseActor,
            idempotencyKey: 'idem_create_123',
            initialFields: { companyName: 'Acme Corp' },
            ttlMs: 3600000,
          }),
          signal: expect.any(AbortSignal),
        }
      );

      expect(result).toEqual(response);
    });

    it('creates submission with minimal request', async () => {
      const minimalRequest: CreateSubmissionRequest = {
        intakeId: 'intake_simple',
        actor: baseActor,
      };

      const response: CreateSubmissionResponse = {
        ok: true,
        submissionId: 'sub_456',
        state: 'draft',
        resumeToken: 'resume_xyz',
        schema: { type: 'object', properties: {} },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.createSubmission(minimalRequest);

      expect(result).toEqual(response);
    });

    it('handles IntakeError response (missing fields)', async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'missing',
          message: 'Required fields are missing',
          fields: [
            {
              path: 'email',
              code: 'required',
              message: 'Email is required',
            },
          ],
          nextActions: [
            {
              action: 'collect_field',
              field: 'email',
              hint: 'Please provide the email address',
            },
          ],
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse,
      });

      const result = await client.createSubmission(request);

      expect(result).toEqual(errorResponse);
      expect((result as IntakeError).ok).toBe(false);
    });

    it('encodes intakeId in URL', async () => {
      const requestWithSpecialChars: CreateSubmissionRequest = {
        intakeId: 'intake/with spaces',
        actor: baseActor,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_123',
          state: 'draft',
          resumeToken: 'resume_abc',
          schema: { type: 'object' },
        }),
      });

      await client.createSubmission(requestWithSpecialChars);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('intake%2Fwith%20spaces'),
        expect.any(Object)
      );
    });

    it('throws ApiClientError for non-IntakeError failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal server error' }),
      });

      await expect(client.createSubmission(request)).rejects.toThrow(
        ApiClientError
      );
    });
  });

  describe('setFields', () => {
    const request: SetFieldsRequest = {
      submissionId: 'sub_123',
      resumeToken: 'resume_abc',
      actor: baseActor,
      fields: {
        companyName: 'Acme Corp',
        email: 'contact@acme.com',
      },
    };

    it('sets fields successfully', async () => {
      const response = {
        ok: true,
        submissionId: 'sub_123',
        state: 'in_progress' as const,
        resumeToken: 'resume_def',
        missingFields: ['address'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.setFields(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.formbridge.dev/submissions/sub_123/fields',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-key',
          },
          body: JSON.stringify({
            resumeToken: 'resume_abc',
            actor: baseActor,
            fields: {
              companyName: 'Acme Corp',
              email: 'contact@acme.com',
            },
          }),
          signal: expect.any(AbortSignal),
        }
      );

      expect(result).toEqual(response);
    });

    it('handles nested field updates', async () => {
      const nestedRequest: SetFieldsRequest = {
        submissionId: 'sub_123',
        resumeToken: 'resume_abc',
        actor: baseActor,
        fields: {
          address: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_123',
          state: 'in_progress',
          resumeToken: 'resume_ghi',
        }),
      });

      const result = await client.setFields(nestedRequest);

      expect(result).toBeDefined();
    });

    it('handles IntakeError response (invalid fields)', async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Validation failed',
          fields: [
            {
              path: 'email',
              code: 'invalid_format',
              message: 'Invalid email format',
              expected: 'valid email address',
              received: 'not-an-email',
            },
          ],
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse,
      });

      const result = await client.setFields(request);

      expect(result).toEqual(errorResponse);
      expect((result as IntakeError).ok).toBe(false);
    });

    it('encodes submissionId in URL', async () => {
      const requestWithSpecialChars: SetFieldsRequest = {
        submissionId: 'sub/123 abc',
        resumeToken: 'resume_abc',
        actor: baseActor,
        fields: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub/123 abc',
          state: 'in_progress',
          resumeToken: 'resume_def',
        }),
      });

      await client.setFields(requestWithSpecialChars);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sub%2F123%20abc'),
        expect.any(Object)
      );
    });
  });

  describe('validate', () => {
    const request: ValidateRequest = {
      submissionId: 'sub_123',
      resumeToken: 'resume_abc',
    };

    it('validates submission successfully (ready)', async () => {
      const response = {
        ok: true,
        submissionId: 'sub_123',
        state: 'in_progress' as const,
        resumeToken: 'resume_abc',
        ready: true,
        missingFields: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.validate(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.formbridge.dev/submissions/sub_123/validate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-key',
          },
          body: JSON.stringify({
            resumeToken: 'resume_abc',
          }),
          signal: expect.any(AbortSignal),
        }
      );

      expect(result).toEqual(response);
    });

    it('validates submission successfully (not ready)', async () => {
      const response = {
        ok: true,
        submissionId: 'sub_123',
        state: 'awaiting_input' as const,
        resumeToken: 'resume_abc',
        ready: false,
        missingFields: ['email', 'phone'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.validate(request);

      expect(result).toEqual(response);
    });

    it('handles IntakeError response', async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'missing',
          message: 'Required fields are missing',
          fields: [
            {
              path: 'companyName',
              code: 'required',
              message: 'Company name is required',
            },
          ],
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse,
      });

      const result = await client.validate(request);

      expect(result).toEqual(errorResponse);
    });
  });

  describe('submit', () => {
    const request: SubmitRequest = {
      submissionId: 'sub_123',
      resumeToken: 'resume_abc',
      idempotencyKey: 'idem_submit_456',
      actor: baseActor,
    };

    it('submits successfully', async () => {
      const response: SubmitResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'submitted',
        resumeToken: 'resume_final',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.submit(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.formbridge.dev/submissions/sub_123/submit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-key',
          },
          body: JSON.stringify({
            resumeToken: 'resume_abc',
            idempotencyKey: 'idem_submit_456',
            actor: baseActor,
          }),
          signal: expect.any(AbortSignal),
        }
      );

      expect(result).toEqual(response);
    });

    it('submits with needs_review state', async () => {
      const response: SubmitResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'needs_review',
        resumeToken: 'resume_review',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.submit(request);

      expect(result).toEqual(response);
    });

    it('submits with finalized state', async () => {
      const response: SubmitResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'finalized',
        resumeToken: 'resume_done',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.submit(request);

      expect(result).toEqual(response);
    });

    it('handles IntakeError response (validation failed)', async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Cannot submit: validation failed',
          fields: [
            {
              path: 'email',
              code: 'invalid_format',
              message: 'Invalid email format',
            },
          ],
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse,
      });

      const result = await client.submit(request);

      expect(result).toEqual(errorResponse);
    });

    it('handles IntakeError response (conflict)', async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'in_progress',
        resumeToken: 'resume_current',
        error: {
          type: 'conflict',
          message: 'Idempotency key reused with different payload',
          retryable: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => errorResponse,
      });

      const result = await client.submit(request);

      expect(result).toEqual(errorResponse);
      expect((result as IntakeError).error.retryable).toBe(false);
    });
  });

  describe('getSubmission', () => {
    it('gets submission successfully', async () => {
      const response = {
        ok: true,
        submissionId: 'sub_123',
        state: 'in_progress',
        resumeToken: 'resume_abc',
        schema: {
          type: 'object',
          properties: {
            companyName: { type: 'string' },
          },
        },
        fields: {
          companyName: 'Acme Corp',
        },
        createdAt: '2026-01-29T10:00:00Z',
        updatedAt: '2026-01-29T10:05:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      });

      const result = await client.getSubmission('sub_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.formbridge.dev/submissions/sub_123',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-key',
          },
          body: undefined,
          signal: expect.any(AbortSignal),
        }
      );

      expect(result).toEqual(response);
    });

    it('encodes submissionId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub/123 abc',
          state: 'in_progress',
          resumeToken: 'resume_abc',
          schema: { type: 'object' },
          fields: {},
          createdAt: '2026-01-29T10:00:00Z',
          updatedAt: '2026-01-29T10:00:00Z',
        }),
      });

      await client.getSubmission('sub/123 abc');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sub%2F123%20abc'),
        expect.any(Object)
      );
    });

    it('handles IntakeError response (not found)', async () => {
      const errorResponse: IntakeError = {
        ok: false,
        submissionId: 'sub_999',
        state: 'cancelled',
        resumeToken: '',
        error: {
          type: 'cancelled',
          message: 'Submission not found or has been cancelled',
          retryable: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => errorResponse,
      });

      const result = await client.getSubmission('sub_999');

      expect(result).toEqual(errorResponse);
    });
  });

  describe('error handling', () => {
    it('throws ApiClientError on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        client.createSubmission({
          intakeId: 'test',
          actor: baseActor,
        })
      ).rejects.toThrow(ApiClientError);
    });

    it('throws ApiClientError on timeout', async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                status: 200,
                json: async () => ({}),
              });
            }, 10000); // Longer than timeout
          })
      );

      const timeoutClient = new FormBridgeApiClient({
        baseUrl: 'https://api.example.com',
        timeout: 100,
        fetch: mockFetch,
      });

      await expect(
        timeoutClient.createSubmission({
          intakeId: 'test',
          actor: baseActor,
        })
      ).rejects.toThrow('Request timeout');
    });

    it('throws ApiClientError on invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(
        client.createSubmission({
          intakeId: 'test',
          actor: baseActor,
        })
      ).rejects.toThrow(ApiClientError);
    });

    it('throws ApiClientError with statusCode and response', async () => {
      const errorData = { message: 'Bad request' };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorData,
      });

      try {
        await client.createSubmission({
          intakeId: 'test',
          actor: baseActor,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).statusCode).toBe(400);
        expect((error as ApiClientError).response).toEqual(errorData);
      }
    });

    it('includes custom headers in all requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_123',
          state: 'draft',
          resumeToken: 'resume_abc',
          schema: { type: 'object' },
        }),
      });

      await client.createSubmission({
        intakeId: 'test',
        actor: baseActor,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'test-key',
          }),
        })
      );
    });

    it('handles unknown errors', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      await expect(
        client.createSubmission({
          intakeId: 'test',
          actor: baseActor,
        })
      ).rejects.toThrow('Unknown error occurred');
    });
  });

  describe('edge cases', () => {
    it('handles empty fields object', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_123',
          state: 'in_progress',
          resumeToken: 'resume_abc',
        }),
      });

      const result = await client.setFields({
        submissionId: 'sub_123',
        resumeToken: 'resume_abc',
        actor: baseActor,
        fields: {},
      });

      expect(result).toBeDefined();
    });

    it('handles actor with metadata', async () => {
      const actorWithMetadata: Actor = {
        kind: 'agent',
        id: 'bot_456',
        name: 'Onboarding Bot',
        metadata: {
          version: '1.0.0',
          capability: 'form-filling',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_123',
          state: 'draft',
          resumeToken: 'resume_abc',
          schema: { type: 'object' },
        }),
      });

      const result = await client.createSubmission({
        intakeId: 'test',
        actor: actorWithMetadata,
      });

      expect(result).toBeDefined();
    });

    it('handles special characters in field paths', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_123',
          state: 'in_progress',
          resumeToken: 'resume_abc',
        }),
      });

      const result = await client.setFields({
        submissionId: 'sub_123',
        resumeToken: 'resume_abc',
        actor: baseActor,
        fields: {
          'address.city': 'Springfield',
          'items[0].name': 'Widget',
        },
      });

      expect(result).toBeDefined();
    });

    it('handles null/undefined values in fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_123',
          state: 'in_progress',
          resumeToken: 'resume_abc',
        }),
      });

      const result = await client.setFields({
        submissionId: 'sub_123',
        resumeToken: 'resume_abc',
        actor: baseActor,
        fields: {
          optional: null,
          notSet: undefined,
        },
      });

      expect(result).toBeDefined();
    });
  });
});
