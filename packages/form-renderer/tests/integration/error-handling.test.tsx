/**
 * Integration tests for error handling
 * Tests server-side errors, network errors, and error recovery
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { FormBridgeForm } from '../../src/components/FormBridgeForm';
import {
  IntakeSchema,
  Actor,
  CreateSubmissionResponse,
} from '../../src/types';
import { IntakeError } from '../../src/types/error';

describe('Error Handling Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const endpoint = 'https://api.formbridge.test';

  const testActor: Actor = {
    kind: 'human',
    id: 'test-user-123',
    name: 'Test User',
  };

  const testSchema: IntakeSchema = {
    intakeId: 'error-test',
    title: 'Error Test Form',
    type: 'object',
    properties: {
      companyName: {
        type: 'string',
        title: 'Company Name',
      },
      email: {
        type: 'string',
        format: 'email',
        title: 'Email',
      },
      taxId: {
        type: 'string',
        title: 'Tax ID',
      },
    },
    required: ['companyName', 'email'],
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  describe('Server-side validation errors (IntakeError)', () => {
    it('displays field-specific errors from server', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();

      // Mock IntakeError with field errors
      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Invalid fields provided',
          fields: [
            {
              path: 'email',
              code: 'invalid_format',
              message: 'Email domain is not allowed',
            },
            {
              path: 'taxId',
              code: 'invalid_value',
              message: 'Tax ID format is invalid for this country',
            },
          ],
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          onError={onError}
        />
      );

      // Fill and submit form
      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@blocked-domain.com');
      await user.type(screen.getByLabelText(/tax id/i), 'INVALID');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Wait for server errors to be displayed
      await waitFor(() => {
        expect(screen.getByText(/email domain is not allowed/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/tax id format is invalid/i)).toBeInTheDocument();

      // Verify onError was called
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid fields provided',
          retryable: true,
        })
      );
    });

    it('displays general error message when no field errors', async () => {
      const user = userEvent.setup();

      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Form cannot be processed at this time',
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/form cannot be processed at this time/i)).toBeInTheDocument();
      });
    });

    it('handles missing field error from server', async () => {
      const user = userEvent.setup();

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

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Submit with missing required field
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/company name is required/i)).toBeInTheDocument();
      });
    });

    it('shows retry indicator for retryable errors', async () => {
      const user = userEvent.setup();

      const intakeError: IntakeError = {
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
              code: 'invalid_value',
              message: 'Email already exists',
            },
          ],
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'duplicate@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/email already exists/i)).toBeInTheDocument();
      });

      // Verify submit button is still enabled for retry
      expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
    });

    it('allows fixing and resubmitting after server error', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      // First request fails, second succeeds
      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Invalid email',
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

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve(intakeError),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              submissionId: 'sub_456',
              state: 'in_progress',
              resumeToken: 'resume_def',
              schema: testSchema,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              submissionId: 'sub_456',
              state: 'submitted',
              resumeToken: 'resume_ghi',
            }),
        });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
        />
      );

      // First submission attempt
      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'bad-email');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/email format is invalid/i)).toBeInTheDocument();
      });

      // Fix the email
      const emailInput = screen.getByLabelText(/email/i);
      await user.clear(emailInput);
      await user.type(emailInput, 'good@example.com');

      // Retry submission
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      // Error should be cleared
      expect(screen.queryByText(/email format is invalid/i)).not.toBeInTheDocument();
    });
  });

  describe('Network errors', () => {
    it('displays error when network request fails', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();

      // Mock network failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          onError={onError}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      expect(onError).toHaveBeenCalled();
    });

    it('displays error when server returns 500', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          onError={onError}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });

    it('allows retry after network error', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      // First request fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              submissionId: 'sub_456',
              state: 'in_progress',
              resumeToken: 'resume_abc',
              schema: testSchema,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              submissionId: 'sub_456',
              state: 'submitted',
              resumeToken: 'resume_def',
            }),
        });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Retry
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('Timeout errors', () => {
    it('handles request timeout', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();

      // Mock timeout by rejecting with AbortError
      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        });
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          onError={onError}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(
        () => {
          expect(onError).toHaveBeenCalled();
        },
        { timeout: 5000 }
      );
    });
  });

  describe('Error display customization', () => {
    it('uses custom error component when provided', async () => {
      const user = userEvent.setup();

      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Custom error message',
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      const CustomError = ({ message }: { message: string }) => (
        <div data-testid="custom-error">Custom: {message}</div>
      );

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          errorComponent={(error) => <CustomError message={error.message} />}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByTestId('custom-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/custom: custom error message/i)).toBeInTheDocument();
    });
  });

  describe('Error recovery', () => {
    it('clears errors when form is modified after error', async () => {
      const user = userEvent.setup();

      const intakeError: IntakeError = {
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
              code: 'invalid_value',
              message: 'Email already in use',
            },
          ],
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'taken@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/email already in use/i)).toBeInTheDocument();
      });

      // Mock successful submission for next attempt
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              submissionId: 'sub_456',
              state: 'in_progress',
              resumeToken: 'resume_def',
              schema: testSchema,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              submissionId: 'sub_456',
              state: 'submitted',
              resumeToken: 'resume_ghi',
            }),
        });

      // Change the email
      const emailInput = screen.getByLabelText(/email/i);
      await user.clear(emailInput);
      await user.type(emailInput, 'available@example.com');

      // Resubmit
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Error should be cleared after successful submission
      await waitFor(() => {
        expect(screen.queryByText(/email already in use/i)).not.toBeInTheDocument();
      });
    });

    it('preserves form data when error occurs', async () => {
      const user = userEvent.setup();

      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Server validation failed',
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Fill form
      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/tax id/i), '12-3456789');

      // Submit and get error
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/server validation failed/i)).toBeInTheDocument();
      });

      // Verify all form data is preserved
      expect(screen.getByLabelText(/company name/i)).toHaveValue('Test Corp');
      expect(screen.getByLabelText(/email/i)).toHaveValue('test@example.com');
      expect(screen.getByLabelText(/tax id/i)).toHaveValue('12-3456789');
    });
  });

  describe('Error edge cases', () => {
    it('handles malformed error response', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ unexpected: 'format' }),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
          onError={onError}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });

    it('handles error with no message', async () => {
      const user = userEvent.setup();

      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          // No message field
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should handle gracefully without crashing
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
      });
    });

    it('handles empty field errors array', async () => {
      const user = userEvent.setup();

      const intakeError: IntakeError = {
        ok: false,
        submissionId: 'sub_123',
        state: 'awaiting_input',
        resumeToken: 'resume_abc',
        error: {
          type: 'invalid',
          message: 'Validation failed',
          fields: [], // Empty array
          retryable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(intakeError),
      });

      render(
        <FormBridgeForm
          schema={testSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
      });

      // Should only show general error message
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });
});
