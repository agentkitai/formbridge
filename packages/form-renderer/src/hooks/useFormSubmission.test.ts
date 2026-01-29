/**
 * Tests for useFormSubmission hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFormSubmission, UseFormSubmissionConfig } from './useFormSubmission';
import { FormBridgeApiClient, ApiClientConfig } from '../api/client';
import {
  IntakeSchema,
  FormData,
  Actor,
  CreateSubmissionResponse,
  SubmitResponse,
  UseValidationReturn,
} from '../types';
import { IntakeError, ValidationResult } from '../types/error';

describe('useFormSubmission', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let apiClient: FormBridgeApiClient;
  let mockValidation: UseValidationReturn;
  let config: UseFormSubmissionConfig;

  const testSchema: IntakeSchema = {
    type: 'object',
    properties: {
      companyName: {
        type: 'string',
        description: 'Company name',
      },
      email: {
        type: 'string',
        format: 'email',
        description: 'Email address',
      },
    },
    required: ['companyName', 'email'],
  };

  const testData: FormData = {
    companyName: 'Acme Corp',
    email: 'contact@acme.com',
  };

  const testActor: Actor = {
    kind: 'human',
    id: 'user_123',
    name: 'Test User',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    const clientConfig: ApiClientConfig = {
      baseUrl: 'https://api.formbridge.dev',
      fetch: mockFetch,
    };
    apiClient = new FormBridgeApiClient(clientConfig);

    // Mock validation hook
    mockValidation = {
      errors: {},
      validate: vi.fn().mockResolvedValue({ valid: true }),
      validateField: vi.fn().mockResolvedValue(true),
      clearErrors: vi.fn(),
      clearFieldError: vi.fn(),
      setFieldError: vi.fn(),
      isValidating: false,
    };

    config = {
      schema: testSchema,
      data: testData,
      validation: mockValidation,
      apiClient,
      intakeId: 'intake_vendor_onboarding',
      actor: testActor,
    };
  });

  describe('initialization', () => {
    it('initializes with idle state', () => {
      const { result } = renderHook(() => useFormSubmission(config));

      expect(result.current.state).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.submissionId).toBeNull();
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('provides submit and reset methods', () => {
      const { result } = renderHook(() => useFormSubmission(config));

      expect(typeof result.current.submit).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('successful submission', () => {
    const createResponse: CreateSubmissionResponse = {
      ok: true,
      submissionId: 'sub_123',
      state: 'in_progress',
      resumeToken: 'resume_abc',
      schema: testSchema,
    };

    const submitResponse: SubmitResponse = {
      ok: true,
      submissionId: 'sub_123',
      state: 'submitted',
      resumeToken: 'resume_def',
    };

    beforeEach(() => {
      // Mock successful API responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/submissions')) {
          // Create submission
          if (url.match(/\/intakes\/[^/]+\/submissions$/)) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(createResponse),
            });
          }
          // Submit submission
          if (url.match(/\/submissions\/[^/]+\/submit$/)) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(submitResponse),
            });
          }
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
    });

    it('transitions through states correctly', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      expect(result.current.state).toBe('idle');

      // Start submission
      act(() => {
        result.current.submit();
      });

      // Should be validating
      await waitFor(() => {
        expect(result.current.state).toBe('validating');
        expect(result.current.isSubmitting).toBe(true);
      });

      // Wait for completion
      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.isError).toBe(false);
      expect(result.current.submissionId).toBe('sub_123');
      expect(result.current.error).toBeNull();
    });

    it('calls validation before submitting', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      await act(async () => {
        await result.current.submit();
      });

      expect(mockValidation.validate).toHaveBeenCalledTimes(1);
    });

    it('calls API client methods in correct order', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      // Should have called fetch twice: create and submit
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: create submission
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[0]).toContain('/intakes/intake_vendor_onboarding/submissions');
      expect(firstCall[1].method).toBe('POST');

      // Second call: submit submission
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[0]).toContain('/submissions/sub_123/submit');
      expect(secondCall[1].method).toBe('POST');
    });

    it('calls onSuccess callback', async () => {
      const onSuccess = vi.fn();
      const configWithCallback = { ...config, onSuccess };
      const { result } = renderHook(() => useFormSubmission(configWithCallback));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      expect(onSuccess).toHaveBeenCalledWith('sub_123');
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('includes initial data in create request', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      // Check the first call (create submission)
      const firstCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(firstCall[1].body);
      expect(requestBody.initialFields).toEqual(testData);
      expect(requestBody.actor).toEqual(testActor);
      expect(requestBody.idempotencyKey).toBeDefined();
    });

    it('includes actor in submit request', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      // Check the second call (submit)
      const secondCall = mockFetch.mock.calls[1];
      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.actor).toEqual(testActor);
      expect(requestBody.resumeToken).toBe('resume_abc');
      expect(requestBody.idempotencyKey).toBeDefined();
    });
  });

  describe('validation errors', () => {
    beforeEach(() => {
      // Mock validation failure
      mockValidation.validate = vi.fn().mockResolvedValue({
        valid: false,
        errors: [
          {
            path: 'email',
            code: 'invalid_format',
            message: 'Invalid email format',
          },
        ],
      });
    });

    it('stops submission on validation error', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('error');
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.message).toContain('validation errors');
      expect(result.current.error?.fieldErrors).toBeDefined();
      expect(result.current.error?.retryable).toBe(true);

      // Should not have called API
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('calls onError callback on validation error', async () => {
      const onError = vi.fn();
      const configWithCallback = { ...config, onError };
      const { result } = renderHook(() => useFormSubmission(configWithCallback));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('error');
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain('validation errors');
    });
  });

  describe('API errors', () => {
    describe('IntakeError from create', () => {
      const intakeError: IntakeError = {
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

      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: () => Promise.resolve(intakeError),
        });
      });

      it('handles IntakeError from create submission', async () => {
        const { result } = renderHook(() => useFormSubmission(config));

        await act(async () => {
          await result.current.submit();
        });

        await waitFor(() => {
          expect(result.current.state).toBe('error');
        });

        expect(result.current.error).not.toBeNull();
        expect(result.current.error?.message).toBe('Required fields are missing');
        expect(result.current.error?.fieldErrors).toEqual(intakeError.error.fields);
        expect(result.current.error?.retryable).toBe(true);
      });

      it('calls onError callback with IntakeError', async () => {
        const onError = vi.fn();
        const configWithCallback = { ...config, onError };
        const { result } = renderHook(() => useFormSubmission(configWithCallback));

        await act(async () => {
          await result.current.submit();
        });

        await waitFor(() => {
          expect(result.current.state).toBe('error');
        });

        expect(onError).toHaveBeenCalledTimes(1);
        const errorArg = onError.mock.calls[0][0];
        expect(errorArg.message).toBe('Required fields are missing');
        expect(errorArg.fieldErrors).toEqual(intakeError.error.fields);
      });
    });

    describe('IntakeError from submit', () => {
      const createResponse: CreateSubmissionResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'in_progress',
        resumeToken: 'resume_abc',
        schema: testSchema,
      };

      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_def',
        error: {
          type: 'invalid',
          message: 'Invalid field values',
          fields: [
            {
              path: 'email',
              code: 'invalid_format',
              message: 'Email format is invalid',
            },
          ],
          retryable: true,
        },
      };

      beforeEach(() => {
        mockFetch.mockImplementation((url: string) => {
          if (url.match(/\/intakes\/[^/]+\/submissions$/)) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(createResponse),
            });
          }
          if (url.match(/\/submissions\/[^/]+\/submit$/)) {
            return Promise.resolve({
              ok: false,
              json: () => Promise.resolve(intakeError),
            });
          }
          return Promise.reject(new Error('Unexpected URL'));
        });
      });

      it('handles IntakeError from submit', async () => {
        const { result } = renderHook(() => useFormSubmission(config));

        await act(async () => {
          await result.current.submit();
        });

        await waitFor(() => {
          expect(result.current.state).toBe('error');
        });

        expect(result.current.submissionId).toBe('sub_123');
        expect(result.current.error).not.toBeNull();
        expect(result.current.error?.message).toBe('Invalid field values');
        expect(result.current.error?.fieldErrors).toEqual(intakeError.error.fields);
      });
    });

    describe('Network errors', () => {
      beforeEach(() => {
        mockFetch.mockRejectedValue(new Error('Network error'));
      });

      it('handles network errors', async () => {
        const { result } = renderHook(() => useFormSubmission(config));

        await act(async () => {
          await result.current.submit();
        });

        await waitFor(() => {
          expect(result.current.state).toBe('error');
        });

        expect(result.current.error).not.toBeNull();
        expect(result.current.error?.message).toContain('Network error');
        expect(result.current.error?.retryable).toBe(true);
      });
    });

    describe('Timeout errors', () => {
      beforeEach(() => {
        mockFetch.mockImplementation(() => {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 100);
          });
        });
      });

      it('handles timeout errors', async () => {
        const { result } = renderHook(() => useFormSubmission(config));

        await act(async () => {
          await result.current.submit();
        });

        await waitFor(() => {
          expect(result.current.state).toBe('error');
        });

        expect(result.current.error).not.toBeNull();
        expect(result.current.error?.retryable).toBe(true);
      });
    });
  });

  describe('reset', () => {
    const createResponse: CreateSubmissionResponse = {
      ok: true,
      submissionId: 'sub_123',
      state: 'in_progress',
      resumeToken: 'resume_abc',
      schema: testSchema,
    };

    const submitResponse: SubmitResponse = {
      ok: true,
      submissionId: 'sub_123',
      state: 'submitted',
      resumeToken: 'resume_def',
    };

    beforeEach(() => {
      mockFetch.mockImplementation((url: string) => {
        if (url.match(/\/intakes\/[^/]+\/submissions$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(createResponse),
          });
        }
        if (url.match(/\/submissions\/[^/]+\/submit$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(submitResponse),
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
    });

    it('resets state after successful submission', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      expect(result.current.submissionId).toBe('sub_123');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.submissionId).toBeNull();
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('resets state after error', async () => {
      // Mock validation failure
      mockValidation.validate = vi.fn().mockResolvedValue({
        valid: false,
        errors: [{ path: 'email', code: 'required', message: 'Required' }],
      });

      const { result } = renderHook(() => useFormSubmission(config));

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('error');
      });

      expect(result.current.error).not.toBeNull();

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.submissionId).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles empty data', async () => {
      const emptyConfig = { ...config, data: {} };
      const { result } = renderHook(() => useFormSubmission(emptyConfig));

      expect(result.current.state).toBe('idle');

      // Should still call validation and API
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            submissionId: 'sub_123',
            state: 'in_progress',
            resumeToken: 'resume_abc',
            schema: testSchema,
          }),
      });

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(mockValidation.validate).toHaveBeenCalled();
      });
    });

    it('handles missing optional callbacks', async () => {
      const minimalConfig = {
        schema: testSchema,
        data: testData,
        validation: mockValidation,
        apiClient,
        intakeId: 'test_intake',
        actor: testActor,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            submissionId: 'sub_123',
            state: 'submitted',
            resumeToken: 'resume_abc',
          }),
      });

      const { result } = renderHook(() => useFormSubmission(minimalConfig));

      // Should not throw even without callbacks
      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });
    });

    it('handles rapid submit calls', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    ok: true,
                    submissionId: 'sub_123',
                    state: 'submitted',
                    resumeToken: 'resume_abc',
                  }),
              }),
            100
          );
        });
      });

      const { result } = renderHook(() => useFormSubmission(config));

      // Call submit multiple times rapidly
      act(() => {
        result.current.submit();
        result.current.submit();
        result.current.submit();
      });

      // Should eventually reach a final state
      await waitFor(
        () => {
          expect(['success', 'error']).toContain(result.current.state);
        },
        { timeout: 5000 }
      );
    });

    it('generates unique idempotency keys', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            submissionId: 'sub_123',
            state: 'submitted',
            resumeToken: 'resume_abc',
            schema: testSchema,
          }),
      });

      // First submission
      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      const firstCallKey = JSON.parse(mockFetch.mock.calls[0][1].body).idempotencyKey;

      // Reset and submit again
      act(() => {
        result.current.reset();
      });

      mockFetch.mockClear();

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });

      const secondCallKey = JSON.parse(mockFetch.mock.calls[0][1].body).idempotencyKey;

      // Keys should be different
      expect(firstCallKey).not.toBe(secondCallKey);
    });

    it('handles special characters in intakeId', async () => {
      const specialConfig = { ...config, intakeId: 'intake_with-special/chars' };
      const { result } = renderHook(() => useFormSubmission(specialConfig));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            submissionId: 'sub_123',
            state: 'submitted',
            resumeToken: 'resume_abc',
            schema: testSchema,
          }),
      });

      await act(async () => {
        await result.current.submit();
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Check that intakeId was properly encoded in URL
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain(encodeURIComponent('intake_with-special/chars'));
    });
  });

  describe('state transitions', () => {
    it('tracks isSubmitting correctly during validating state', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      mockFetch.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    ok: true,
                    submissionId: 'sub_123',
                    state: 'submitted',
                    resumeToken: 'resume_abc',
                  }),
              }),
            100
          );
        });
      });

      act(() => {
        result.current.submit();
      });

      // During validation, isSubmitting should be true
      await waitFor(() => {
        expect(result.current.state).toBe('validating');
      });
      expect(result.current.isSubmitting).toBe(true);

      // Wait for completion
      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });
      expect(result.current.isSubmitting).toBe(false);
    });

    it('tracks isSubmitting correctly during submitting state', async () => {
      const { result } = renderHook(() => useFormSubmission(config));

      mockFetch.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    ok: true,
                    submissionId: 'sub_123',
                    state: 'submitted',
                    resumeToken: 'resume_abc',
                  }),
              }),
            100
          );
        });
      });

      act(() => {
        result.current.submit();
      });

      // During submitting, isSubmitting should be true
      await waitFor(() => {
        expect(result.current.state).toBe('submitting');
      });
      expect(result.current.isSubmitting).toBe(true);

      // Wait for completion
      await waitFor(() => {
        expect(result.current.state).toBe('success');
      });
      expect(result.current.isSubmitting).toBe(false);
    });
  });
});
