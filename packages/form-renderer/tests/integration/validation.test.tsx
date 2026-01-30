/**
 * Integration tests for validation scenarios
 * Tests client-side validation, blur validation, and validation feedback
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

describe('Validation Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const endpoint = 'https://api.formbridge.test';

  const testActor: Actor = {
    kind: 'human',
    id: 'test-user-123',
    name: 'Test User',
  };

  const validationSchema: IntakeSchema = {
    intakeId: 'validation-test',
    title: 'Validation Test Form',
    type: 'object',
    properties: {
      username: {
        type: 'string',
        title: 'Username',
        minLength: 3,
        maxLength: 20,
      },
      email: {
        type: 'string',
        format: 'email',
        title: 'Email',
      },
      age: {
        type: 'number',
        title: 'Age',
        minimum: 18,
        maximum: 100,
      },
      website: {
        type: 'string',
        format: 'uri',
        title: 'Website',
      },
      bio: {
        type: 'string',
        title: 'Bio',
        maxLength: 500,
      },
      acceptTerms: {
        type: 'boolean',
        title: 'Accept Terms',
      },
    },
    required: ['username', 'email', 'acceptTerms'],
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  describe('Required field validation', () => {
    it('shows error when submitting without required fields', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          onError={onError}
        />
      );

      // Try to submit without filling required fields
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Wait for validation errors to appear
      await waitFor(() => {
        expect(screen.getByText(/must have required property 'username'/i)).toBeInTheDocument();
      });

      // Verify error messages for all required fields
      expect(screen.getByText(/must have required property 'email'/i)).toBeInTheDocument();
      expect(screen.getByText(/must have required property 'acceptTerms'/i)).toBeInTheDocument();

      // Verify form was not submitted
      expect(mockFetch).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('clears error when required field is filled', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Submit to trigger validation
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/must have required property 'username'/i)).toBeInTheDocument();
      });

      // Fill the field
      await user.type(screen.getByLabelText(/username/i), 'testuser');

      // Try to submit again
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Wait for username error to disappear
      await waitFor(() => {
        expect(screen.queryByText(/must have required property 'username'/i)).not.toBeInTheDocument();
      });

      // Other required field errors should still be present
      expect(screen.getByText(/must have required property 'email'/i)).toBeInTheDocument();
      expect(screen.getByText(/must have required property 'acceptTerms'/i)).toBeInTheDocument();
    });

    it('shows required indicators on required fields', () => {
      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Check that required fields have asterisk or required indicator
      const usernameLabel = screen.getByText(/username/i).closest('label');
      const emailLabel = screen.getByText(/email/i).closest('label');
      const termsLabel = screen.getByText(/accept terms/i).closest('label');

      expect(usernameLabel).toHaveTextContent('*');
      expect(emailLabel).toHaveTextContent('*');
      expect(termsLabel).toHaveTextContent('*');
    });
  });

  describe('String validation', () => {
    it('validates minLength constraint', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter string that's too short
      await user.type(screen.getByLabelText(/username/i), 'ab');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must NOT have fewer than 3 characters/i)).toBeInTheDocument();
      });
    });

    it('validates maxLength constraint', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter string that's too long
      const longBio = 'a'.repeat(501);
      await user.type(screen.getByLabelText(/bio/i), longBio);
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must NOT have more than 500 characters/i)).toBeInTheDocument();
      });
    });

    it('validates email format', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter invalid email
      await user.type(screen.getByLabelText(/email/i), 'not-an-email');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument();
      });
    });

    it('accepts valid email format', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter valid email
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Email error should not appear (only other required fields)
      await waitFor(() => {
        expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
      });
    });

    it('validates URI format', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter invalid URI
      await user.type(screen.getByLabelText(/website/i), 'not a url');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must match format "uri"/i)).toBeInTheDocument();
      });
    });
  });

  describe('Number validation', () => {
    it('validates minimum constraint', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter number below minimum
      await user.type(screen.getByLabelText(/age/i), '17');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must be >= 18/i)).toBeInTheDocument();
      });
    });

    it('validates maximum constraint', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter number above maximum
      await user.type(screen.getByLabelText(/age/i), '101');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must be <= 100/i)).toBeInTheDocument();
      });
    });

    it('accepts valid number within range', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter valid number
      await user.type(screen.getByLabelText(/age/i), '25');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Age error should not appear
      await waitFor(() => {
        const ageErrors = screen.queryByText(/age.*must be/i);
        expect(ageErrors).not.toBeInTheDocument();
      });
    });
  });

  describe('Blur validation', () => {
    it('validates field on blur when validateOnBlur is true', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          validateOnBlur={true}
        />
      );

      const emailInput = screen.getByLabelText(/email/i);

      // Enter invalid email and blur
      await user.type(emailInput, 'invalid');
      await user.tab(); // Trigger blur

      // Error should appear without submitting
      await waitFor(() => {
        expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument();
      });

      // Form should not have been submitted
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not validate on blur when validateOnBlur is false', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          validateOnBlur={false}
        />
      );

      const emailInput = screen.getByLabelText(/email/i);

      // Enter invalid email and blur
      await user.type(emailInput, 'invalid');
      await user.tab();

      // Wait a bit to ensure no error appears
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error should not appear
      expect(screen.queryByText(/must match format "email"/i)).not.toBeInTheDocument();
    });

    it('clears error when field becomes valid after blur', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          validateOnBlur={true}
        />
      );

      const emailInput = screen.getByLabelText(/email/i);

      // Enter invalid email and blur
      await user.type(emailInput, 'invalid');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument();
      });

      // Fix the email
      await user.clear(emailInput);
      await user.type(emailInput, 'valid@example.com');
      await user.tab();

      // Error should disappear
      await waitFor(() => {
        expect(screen.queryByText(/must match format "email"/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Change validation', () => {
    it('validates on change when validateOnChange is true', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          validateOnChange={true}
        />
      );

      const usernameInput = screen.getByLabelText(/username/i);

      // Type single character (below minLength)
      await user.type(usernameInput, 'a');

      // Error should appear immediately
      await waitFor(() => {
        expect(screen.getByText(/must NOT have fewer than 3 characters/i)).toBeInTheDocument();
      });
    });

    it('does not validate on change when validateOnChange is false', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          validateOnChange={false}
        />
      );

      const usernameInput = screen.getByLabelText(/username/i);

      // Type single character
      await user.type(usernameInput, 'a');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error should not appear
      expect(screen.queryByText(/must NOT have fewer than 3 characters/i)).not.toBeInTheDocument();
    });
  });

  describe('Multiple validation errors', () => {
    it('shows all validation errors for a field', async () => {
      const multiErrorSchema: IntakeSchema = {
        intakeId: 'multi-error-test',
        title: 'Multi Error Test',
        type: 'object',
        properties: {
          code: {
            type: 'string',
            title: 'Code',
            minLength: 5,
            maxLength: 10,
            pattern: '^[A-Z0-9]+$',
          },
        },
        required: ['code'],
      };

      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={multiErrorSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Enter value that violates multiple constraints
      await user.type(screen.getByLabelText(/code/i), 'abc'); // too short and lowercase
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should show minLength error (first constraint checked)
      await waitFor(() => {
        expect(screen.getByText(/must NOT have fewer than 5 characters/i)).toBeInTheDocument();
      });
    });

    it('shows errors for multiple fields', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Fill some fields with invalid data
      await user.type(screen.getByLabelText(/username/i), 'ab'); // too short
      await user.type(screen.getByLabelText(/email/i), 'invalid'); // invalid format
      await user.type(screen.getByLabelText(/age/i), '15'); // below minimum

      await user.click(screen.getByRole('button', { name: /submit/i }));

      // All errors should be shown
      await waitFor(() => {
        expect(screen.getByText(/must NOT have fewer than 3 characters/i)).toBeInTheDocument();
        expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument();
        expect(screen.getByText(/must be >= 18/i)).toBeInTheDocument();
      });
    });
  });

  describe('Validation with nested fields', () => {
    const nestedSchema: IntakeSchema = {
      intakeId: 'nested-validation',
      title: 'Nested Validation',
      type: 'object',
      properties: {
        user: {
          type: 'object',
          title: 'User',
          properties: {
            name: {
              type: 'string',
              title: 'Name',
              minLength: 2,
            },
            contact: {
              type: 'object',
              title: 'Contact',
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  title: 'Email',
                },
              },
              required: ['email'],
            },
          },
          required: ['name'],
        },
      },
      required: ['user'],
    };

    it('validates nested object fields', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={nestedSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Try to submit without filling nested required fields
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must have required property 'name'/i)).toBeInTheDocument();
        expect(screen.getByText(/must have required property 'email'/i)).toBeInTheDocument();
      });
    });

    it('validates nested field constraints', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={nestedSchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Fill nested fields with invalid data
      await user.type(screen.getByLabelText(/^name$/i), 'A'); // too short
      await user.type(screen.getByLabelText(/email/i), 'not-email'); // invalid format

      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must NOT have fewer than 2 characters/i)).toBeInTheDocument();
        expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument();
      });
    });
  });

  describe('Validation with array fields', () => {
    const arraySchema: IntakeSchema = {
      intakeId: 'array-validation',
      title: 'Array Validation',
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          title: 'Emails',
          items: {
            type: 'string',
            format: 'email',
          },
          minItems: 1,
          maxItems: 3,
        },
      },
      required: ['emails'],
    };

    it('validates array item constraints', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={arraySchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Add an item with invalid email
      await user.click(screen.getByRole('button', { name: /add/i }));
      const input = screen.getByRole('textbox', { name: /item/i });
      await user.type(input, 'invalid-email');

      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument();
      });
    });

    it('validates minItems constraint', async () => {
      const user = userEvent.setup();

      render(
        <FormBridgeForm
          schema={arraySchema}
          endpoint={endpoint}
          actor={testActor}
        />
      );

      // Try to submit without adding any items
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/must NOT have fewer than 1 items/i)).toBeInTheDocument();
      });
    });
  });

  describe('Validation callback', () => {
    it('calls onValidate with validation result', async () => {
      const user = userEvent.setup();
      const onValidate = vi.fn();

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          onValidate={onValidate}
        />
      );

      // Submit with invalid data
      await user.type(screen.getByLabelText(/username/i), 'ab');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onValidate).toHaveBeenCalled();
      });

      // Verify validation result has errors
      const validationResult = onValidate.mock.calls[0][0];
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toBeDefined();
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });

    it('calls onValidate with valid result when form is valid', async () => {
      const user = userEvent.setup();
      const onValidate = vi.fn();

      // Mock successful API
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, submissionId: 'sub_123' }),
      });

      render(
        <FormBridgeForm
          schema={validationSchema}
          endpoint={endpoint}
          actor={testActor}
          onValidate={onValidate}
        />
      );

      // Fill all required fields with valid data
      await user.type(screen.getByLabelText(/username/i), 'validuser');
      await user.type(screen.getByLabelText(/email/i), 'valid@example.com');
      await user.click(screen.getByLabelText(/accept terms/i));

      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onValidate).toHaveBeenCalled();
      });

      // Verify validation result is valid
      const validationResult = onValidate.mock.calls[0][0];
      expect(validationResult.valid).toBe(true);
    });
  });
});
