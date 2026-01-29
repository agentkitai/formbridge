/**
 * Tests for FormBridgeForm component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FormBridgeForm } from './FormBridgeForm';
import { IntakeSchema, Actor, FormData, SubmissionError } from '../types';
import { FormBridgeApiClient } from '../api/client';

// Mock the API client
vi.mock('../api/client', () => ({
  FormBridgeApiClient: vi.fn(),
  createApiClient: vi.fn(() => ({
    createSubmission: vi.fn(),
    submit: vi.fn(),
  })),
}));

// Helper to create a basic schema
const createSchema = (overrides: Partial<IntakeSchema> = {}): IntakeSchema => ({
  intakeId: 'test-intake',
  title: 'Test Form',
  description: 'A test form',
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Name',
    },
    email: {
      type: 'string',
      format: 'email',
      title: 'Email',
    },
  },
  required: ['name'],
  ...overrides,
});

// Helper to create an actor
const createActor = (overrides: Partial<Actor> = {}): Actor => ({
  kind: 'human',
  id: 'test-user',
  name: 'Test User',
  ...overrides,
});

describe('FormBridgeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders form with title', () => {
      const schema = createSchema({ title: 'Vendor Onboarding' });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      expect(screen.getByText('Vendor Onboarding')).toBeInTheDocument();
    });

    it('renders form with description', () => {
      const schema = createSchema({ description: 'Fill out your information' });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      expect(screen.getByText('Fill out your information')).toBeInTheDocument();
    });

    it('renders form without title if not provided', () => {
      const schema = createSchema({ title: undefined });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      // Form should render, but without h2 heading
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    });

    it('renders submit button with default text', () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });

    it('renders submit button with custom text', () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          submitText="Send Application"
        />
      );

      expect(screen.getByRole('button', { name: 'Send Application' })).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const schema = createSchema();
      const { container } = render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          className="custom-form"
        />
      );

      const form = container.querySelector('form');
      expect(form).toHaveClass('formbridge-form', 'custom-form');
    });
  });

  describe('Field Rendering', () => {
    it('renders string fields', () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      expect(screen.getByLabelText('Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('renders number fields', () => {
      const schema = createSchema({
        properties: {
          age: {
            type: 'number',
            title: 'Age',
            minimum: 0,
            maximum: 120,
          },
        },
      });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      const input = screen.getByLabelText('Age') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'number');
    });

    it('renders boolean fields', () => {
      const schema = createSchema({
        properties: {
          subscribe: {
            type: 'boolean',
            title: 'Subscribe to newsletter',
          },
        },
      });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      const checkbox = screen.getByLabelText('Subscribe to newsletter') as HTMLInputElement;
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toHaveAttribute('type', 'checkbox');
    });

    it('renders enum fields as select', () => {
      const schema = createSchema({
        properties: {
          size: {
            type: 'string',
            title: 'Size',
            enum: ['small', 'medium', 'large', 'xlarge', 'xxlarge', 'xxxlarge'],
          },
        },
      });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      const select = screen.getByLabelText('Size') as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(select.tagName).toBe('SELECT');
    });

    it('renders array fields', () => {
      const schema = createSchema({
        properties: {
          tags: {
            type: 'array',
            title: 'Tags',
            items: { type: 'string' },
          },
        },
      });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
    });

    it('renders object fields', () => {
      const schema = createSchema({
        properties: {
          address: {
            type: 'object',
            title: 'Address',
            properties: {
              street: { type: 'string', title: 'Street' },
              city: { type: 'string', title: 'City' },
            },
          },
        },
      });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      expect(screen.getByText('Address')).toBeInTheDocument();
      expect(screen.getByLabelText('Street')).toBeInTheDocument();
      expect(screen.getByLabelText('City')).toBeInTheDocument();
    });

    it('renders fields with initial data', () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe', email: 'john@example.com' }}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      const emailInput = screen.getByLabelText('Email') as HTMLInputElement;

      expect(nameInput.value).toBe('John Doe');
      expect(emailInput.value).toBe('john@example.com');
    });
  });

  describe('Form State Management', () => {
    it('updates field value on change', () => {
      const schema = createSchema();
      const onChange = vi.fn();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          onChange={onChange}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });

      expect(nameInput.value).toBe('Jane Doe');
    });

    it('calls onChange callback with updated data', async () => {
      const schema = createSchema();
      const onChange = vi.fn();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          onChange={onChange}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('maintains separate field values', () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      const emailInput = screen.getByLabelText('Email') as HTMLInputElement;

      fireEvent.change(nameInput, { target: { value: 'John Doe' } });
      fireEvent.change(emailInput, { target: { value: 'john@example.com' } });

      expect(nameInput.value).toBe('John Doe');
      expect(emailInput.value).toBe('john@example.com');
    });
  });

  describe('Validation', () => {
    it('validates on blur when validateOnBlur is true', async () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          validateOnBlur={true}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;

      // Blur without entering value (required field)
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(screen.queryByText(/required/i)).toBeInTheDocument();
      });
    });

    it('does not validate on blur when validateOnBlur is false', async () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          validateOnBlur={false}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;

      // Blur without entering value (required field)
      fireEvent.blur(nameInput);

      // Should not show validation error
      await waitFor(() => {
        expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('validates on change when validateOnChange is true', async () => {
      const schema = createSchema({
        properties: {
          email: {
            type: 'string',
            format: 'email',
            title: 'Email',
          },
        },
        required: ['email'],
      });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          validateOnChange={true}
        />
      );

      const emailInput = screen.getByLabelText('Email') as HTMLInputElement;

      // Enter invalid email
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      await waitFor(() => {
        // Note: actual error message depends on validation implementation
        expect(screen.queryByText(/email/i)).toBeInTheDocument();
      });
    });

    it('calls onValidate callback', async () => {
      const schema = createSchema();
      const onValidate = vi.fn();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          onValidate={onValidate}
          validateOnBlur={true}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(onValidate).toHaveBeenCalled();
      });
    });
  });

  describe('Form Submission', () => {
    it('submits form on button click', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'draft',
        resumeToken: 'token-123',
        schema,
      });
      const mockSubmit = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'submitted',
        resumeToken: 'token-456',
      });

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: mockSubmit,
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe', email: 'john@example.com' }}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateSubmission).toHaveBeenCalled();
      });
    });

    it('shows loading state during submission', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/submitting/i)).toBeInTheDocument();
      });
    });

    it('disables submit button during submission', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
    });

    it('calls onSuccess callback on successful submission', async () => {
      const schema = createSchema();
      const onSuccess = vi.fn();
      const mockCreateSubmission = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'draft',
        resumeToken: 'token-123',
        schema,
      });
      const mockSubmit = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'submitted',
        resumeToken: 'token-456',
      });

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: mockSubmit,
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe', email: 'john@example.com' }}
          onSuccess={onSuccess}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'John Doe', email: 'john@example.com' }),
          'sub-123'
        );
      });
    });

    it('calls onError callback on submission error', async () => {
      const schema = createSchema();
      const onError = vi.fn();
      const mockCreateSubmission = vi.fn().mockRejectedValue(new Error('Network error'));

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
          onError={onError}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });

    it('displays error message on submission error', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockRejectedValue(new Error('Network error'));

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows success message after successful submission', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'draft',
        resumeToken: 'token-123',
        schema,
      });
      const mockSubmit = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'submitted',
        resumeToken: 'token-456',
      });

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: mockSubmit,
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe', email: 'john@example.com' }}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/submitted successfully/i)).toBeInTheDocument();
      });
    });
  });

  describe('Customization', () => {
    it('renders custom loading component', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
          loadingComponent={<span>Custom Loading...</span>}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Custom Loading...')).toBeInTheDocument();
      });
    });

    it('renders custom error component', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockRejectedValue(new Error('Network error'));

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      const errorComponent = (error: SubmissionError) => (
        <div>Custom Error: {error.message}</div>
      );

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
          errorComponent={errorComponent}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Custom Error:/)).toBeInTheDocument();
      });
    });

    it('renders custom success component', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'draft',
        resumeToken: 'token-123',
        schema,
      });
      const mockSubmit = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'submitted',
        resumeToken: 'token-456',
      });

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: mockSubmit,
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      const successComponent = (submissionId: string) => (
        <div>Custom Success! ID: {submissionId}</div>
      );

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe', email: 'john@example.com' }}
          successComponent={successComponent}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Custom Success! ID: sub-123/)).toBeInTheDocument();
      });
    });
  });

  describe('Disabled State', () => {
    it('disables all fields when disabled prop is true', () => {
      const schema = createSchema();
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          disabled={true}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: 'Submit' });

      expect(nameInput).toBeDisabled();
      expect(emailInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Actor Configuration', () => {
    it('uses provided actor', async () => {
      const schema = createSchema();
      const actor = createActor({ kind: 'agent', id: 'agent-123', name: 'Test Agent' });
      const mockCreateSubmission = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'draft',
        resumeToken: 'token-123',
        schema,
      });

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe', email: 'john@example.com' }}
          actor={actor}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateSubmission).toHaveBeenCalledWith(
          expect.objectContaining({
            actor: expect.objectContaining({
              kind: 'agent',
              id: 'agent-123',
              name: 'Test Agent',
            }),
          })
        );
      });
    });

    it('uses default actor if not provided', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'draft',
        resumeToken: 'token-123',
        schema,
      });

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe', email: 'john@example.com' }}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateSubmission).toHaveBeenCalledWith(
          expect.objectContaining({
            actor: expect.objectContaining({
              kind: 'human',
              id: 'anonymous',
            }),
          })
        );
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty schema', () => {
      const schema = createSchema({ properties: {} });
      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
        />
      );

      // Should render form with just submit button
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });

    it('handles form submission with preventDefault', () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockResolvedValue({
        ok: true,
        submissionId: 'sub-123',
        state: 'draft',
        resumeToken: 'token-123',
        schema,
      });

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      const { container } = render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
        />
      );

      const form = container.querySelector('form')!;
      const event = new Event('submit', { cancelable: true, bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      form.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('prevents double submission', async () => {
      const schema = createSchema();
      const mockCreateSubmission = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const mockApiClient = {
        createSubmission: mockCreateSubmission,
        submit: vi.fn(),
      };

      vi.mocked(require('../api/client').createApiClient).mockReturnValue(mockApiClient);

      render(
        <FormBridgeForm
          schema={schema}
          endpoint="https://api.example.com"
          initialData={{ name: 'John Doe' }}
        />
      );

      const submitButton = screen.getByRole('button', { name: 'Submit' });

      // Click multiple times
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);

      await waitFor(() => {
        // Should only be called once
        expect(mockCreateSubmission).toHaveBeenCalledTimes(1);
      });
    });
  });
});
