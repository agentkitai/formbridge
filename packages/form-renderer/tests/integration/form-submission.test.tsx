/**
 * Integration tests for complete form submission flow
 * Tests the entire lifecycle: render → fill → validate → submit
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
  SubmitResponse,
} from '../../src/types';

describe('Form Submission Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const endpoint = 'https://api.formbridge.test';

  const testActor: Actor = {
    kind: 'human',
    id: 'test-user-123',
    name: 'Test User',
  };

  const vendorSchema: IntakeSchema = {
    intakeId: 'vendor-onboarding',
    title: 'Vendor Onboarding',
    description: 'Submit your vendor information',
    type: 'object',
    properties: {
      companyName: {
        type: 'string',
        title: 'Company Name',
        description: 'Legal company name',
      },
      email: {
        type: 'string',
        format: 'email',
        title: 'Contact Email',
      },
      employeeCount: {
        type: 'number',
        title: 'Number of Employees',
        minimum: 1,
      },
      agreeToTerms: {
        type: 'boolean',
        title: 'I agree to the terms and conditions',
      },
    },
    required: ['companyName', 'email', 'agreeToTerms'],
  };

  const createSubmissionResponse: CreateSubmissionResponse = {
    ok: true,
    submissionId: 'sub_test_123',
    state: 'in_progress',
    resumeToken: 'resume_abc',
    schema: vendorSchema,
  };

  const submitResponse: SubmitResponse = {
    ok: true,
    submissionId: 'sub_test_123',
    state: 'submitted',
    resumeToken: 'resume_def',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  describe('Successful submission flow', () => {
    beforeEach(() => {
      // Mock successful API responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/submissions') && url.match(/\/intakes\/[^/]+\/submissions$/)) {
          // Create submission
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(createSubmissionResponse),
          });
        }
        if (url.match(/\/submissions\/[^/]+\/submit$/)) {
          // Submit submission
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(submitResponse),
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
    });

    it('completes full submission flow with all fields filled', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onError = vi.fn();

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
          onError={onError}
        />
      );

      // Verify form renders
      expect(screen.getByText('Vendor Onboarding')).toBeInTheDocument();
      expect(screen.getByText('Submit your vendor information')).toBeInTheDocument();

      // Fill out all fields
      const companyNameInput = screen.getByLabelText(/company name/i);
      const emailInput = screen.getByLabelText(/contact email/i);
      const employeeCountInput = screen.getByLabelText(/number of employees/i);
      const agreeCheckbox = screen.getByLabelText(/agree to the terms/i);

      await user.type(companyNameInput, 'Acme Corporation');
      await user.type(emailInput, 'contact@acme.com');
      await user.type(employeeCountInput, '50');
      await user.click(agreeCheckbox);

      // Verify values are set
      expect(companyNameInput).toHaveValue('Acme Corporation');
      expect(emailInput).toHaveValue('contact@acme.com');
      expect(employeeCountInput).toHaveValue(50);
      expect(agreeCheckbox).toBeChecked();

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Wait for submission to complete
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });

      // Verify API calls
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify create submission call
      const createCall = mockFetch.mock.calls[0];
      expect(createCall[0]).toContain('/intakes/vendor-onboarding/submissions');
      const createBody = JSON.parse(createCall[1].body);
      expect(createBody.actor).toEqual(testActor);
      expect(createBody.initialFields).toEqual({
        companyName: 'Acme Corporation',
        email: 'contact@acme.com',
        employeeCount: 50,
        agreeToTerms: true,
      });

      // Verify submit call
      const submitCall = mockFetch.mock.calls[1];
      expect(submitCall[0]).toContain('/submissions/sub_test_123/submit');

      // Verify success callback
      expect(onSuccess).toHaveBeenCalledWith(
        {
          companyName: 'Acme Corporation',
          email: 'contact@acme.com',
          employeeCount: 50,
          agreeToTerms: true,
        },
        'sub_test_123'
      );
      expect(onError).not.toHaveBeenCalled();
    });

    it('handles submission with partial data (optional fields empty)', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
        />
      );

      // Fill only required fields
      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/contact email/i), 'test@example.com');
      await user.click(screen.getByLabelText(/agree to the terms/i));

      // Submit
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      // Verify employeeCount (optional) was not included in submission
      const createBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(createBody.initialFields).toEqual({
        companyName: 'Test Corp',
        email: 'test@example.com',
        agreeToTerms: true,
      });
      expect(createBody.initialFields.employeeCount).toBeUndefined();
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();

      // Delay the API response
      mockFetch.mockImplementation((url: string) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (url.includes('/submissions') && url.match(/\/intakes\/[^/]+\/submissions$/)) {
              resolve({
                ok: true,
                json: () => Promise.resolve(createSubmissionResponse),
              });
            } else if (url.match(/\/submissions\/[^/]+\/submit$/)) {
              resolve({
                ok: true,
                json: () => Promise.resolve(submitResponse),
              });
            }
          }, 100);
        });
      });

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Fill required fields
      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/contact email/i), 'test@example.com');
      await user.click(screen.getByLabelText(/agree to the terms/i));

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Verify button is disabled during submission
      expect(submitButton).toBeDisabled();

      // Wait for completion
      await waitFor(
        () => {
          expect(submitButton).not.toBeDisabled();
        },
        { timeout: 3000 }
      );
    });

    it('allows resubmission after successful submit', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
        />
      );

      // First submission
      await user.type(screen.getByLabelText(/company name/i), 'First Corp');
      await user.type(screen.getByLabelText(/contact email/i), 'first@example.com');
      await user.click(screen.getByLabelText(/agree to the terms/i));
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });

      // Clear and fill with new data
      const companyNameInput = screen.getByLabelText(/company name/i);
      const emailInput = screen.getByLabelText(/contact email/i);

      await user.clear(companyNameInput);
      await user.clear(emailInput);
      await user.type(companyNameInput, 'Second Corp');
      await user.type(emailInput, 'second@example.com');

      // Second submission
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(2);
      });

      // Verify both submissions were made
      expect(mockFetch).toHaveBeenCalledTimes(4); // 2 create + 2 submit calls
    });
  });

  describe('Form with complex fields', () => {
    const complexSchema: IntakeSchema = {
      intakeId: 'complex-form',
      title: 'Complex Form',
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Name',
        },
        category: {
          type: 'string',
          enum: ['tech', 'finance', 'retail'],
          title: 'Category',
        },
        tags: {
          type: 'array',
          title: 'Tags',
          items: {
            type: 'string',
          },
        },
        address: {
          type: 'object',
          title: 'Address',
          properties: {
            street: {
              type: 'string',
              title: 'Street',
            },
            city: {
              type: 'string',
              title: 'City',
            },
          },
          required: ['city'],
        },
      },
      required: ['name', 'category'],
    };

    beforeEach(() => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/submissions') && url.match(/\/intakes\/[^/]+\/submissions$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              ...createSubmissionResponse,
              schema: complexSchema,
            }),
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

    it('submits form with enum field', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      render(
        <FormBridgeForm
          schema={complexSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
        />
      );

      await user.type(screen.getByLabelText(/^name$/i), 'Test Company');

      // Select enum value
      const categorySelect = screen.getByLabelText(/category/i);
      await user.selectOptions(categorySelect, 'tech');

      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      const createBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(createBody.initialFields.category).toBe('tech');
    });

    it('submits form with nested object field', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      render(
        <FormBridgeForm
          schema={complexSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
        />
      );

      await user.type(screen.getByLabelText(/^name$/i), 'Test Company');
      await user.selectOptions(screen.getByLabelText(/category/i), 'finance');

      // Fill nested object fields
      await user.type(screen.getByLabelText(/street/i), '123 Main St');
      await user.type(screen.getByLabelText(/city/i), 'San Francisco');

      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      const createBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(createBody.initialFields.address).toEqual({
        street: '123 Main St',
        city: 'San Francisco',
      });
    });

    it('submits form with array field', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      render(
        <FormBridgeForm
          schema={complexSchema}
          endpoint={endpoint}
          actor={testActor}
          onSuccess={onSuccess}
        />
      );

      await user.type(screen.getByLabelText(/^name$/i), 'Test Company');
      await user.selectOptions(screen.getByLabelText(/category/i), 'retail');

      // Add array items
      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);
      await user.click(addButton);

      // Fill array items
      const inputs = screen.getAllByRole('textbox', { name: /item/i });
      await user.type(inputs[0], 'tag1');
      await user.type(inputs[1], 'tag2');

      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      const createBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(createBody.initialFields.tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('Form with initial data', () => {
    beforeEach(() => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/submissions') && url.match(/\/intakes\/[^/]+\/submissions$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(createSubmissionResponse),
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

    it('pre-fills form with initial data', async () => {
      const user = userEvent.setup();
      const initialData = {
        companyName: 'Pre-filled Corp',
        email: 'prefilled@example.com',
        employeeCount: 100,
      };

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
          initialData={initialData}
        />
      );

      // Verify fields are pre-filled
      expect(screen.getByLabelText(/company name/i)).toHaveValue('Pre-filled Corp');
      expect(screen.getByLabelText(/contact email/i)).toHaveValue('prefilled@example.com');
      expect(screen.getByLabelText(/number of employees/i)).toHaveValue(100);
    });

    it('allows modifying pre-filled data before submission', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const initialData = {
        companyName: 'Original Corp',
        email: 'original@example.com',
      };

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
          initialData={initialData}
          onSuccess={onSuccess}
        />
      );

      // Modify pre-filled data
      const companyNameInput = screen.getByLabelText(/company name/i);
      await user.clear(companyNameInput);
      await user.type(companyNameInput, 'Modified Corp');

      // Complete required fields
      await user.click(screen.getByLabelText(/agree to the terms/i));

      // Submit
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      // Verify modified data was submitted
      const createBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(createBody.initialFields.companyName).toBe('Modified Corp');
      expect(createBody.initialFields.email).toBe('original@example.com');
    });
  });

  describe('Callbacks', () => {
    beforeEach(() => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/submissions') && url.match(/\/intakes\/[^/]+\/submissions$/)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(createSubmissionResponse),
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

    it('fires onChange callback when field values change', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
          onChange={onChange}
        />
      );

      await user.type(screen.getByLabelText(/company name/i), 'A');

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });

      // Verify onChange was called with form data
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.companyName).toBe('A');
    });

    it('fires onValidate callback during submission', async () => {
      const user = userEvent.setup();
      const onValidate = vi.fn();

      render(
        <FormBridgeForm
          schema={vendorSchema}
          endpoint={endpoint}
          actor={testActor}
          onValidate={onValidate}
        />
      );

      // Fill required fields
      await user.type(screen.getByLabelText(/company name/i), 'Test Corp');
      await user.type(screen.getByLabelText(/contact email/i), 'test@example.com');
      await user.click(screen.getByLabelText(/agree to the terms/i));

      // Submit
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onValidate).toHaveBeenCalled();
      });

      // Verify validation result
      expect(onValidate).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: true,
        })
      );
    });
  });
});
