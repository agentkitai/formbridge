/**
 * Tests for ErrorDisplay component
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorDisplay } from './ErrorDisplay';
import { SubmissionError, FieldError } from '../types/error';

describe('ErrorDisplay', () => {
  describe('Basic Rendering', () => {
    it('renders nothing when error is null', () => {
      const { container } = render(<ErrorDisplay error={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders error message when provided', () => {
      const error: SubmissionError = {
        message: 'Something went wrong',
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders default title', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Submission Error')).toBeInTheDocument();
    });

    it('renders custom title when provided', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      render(<ErrorDisplay error={error} title="Custom Error Title" />);

      expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
      expect(screen.queryByText('Submission Error')).not.toBeInTheDocument();
    });

    it('renders without message if message is undefined', () => {
      const error: SubmissionError = {
        message: undefined,
      };

      const { container } = render(<ErrorDisplay error={error} />);

      expect(container.querySelector('.formbridge-error-display__message')).not.toBeInTheDocument();
    });

    it('renders with empty message', () => {
      const error: SubmissionError = {
        message: '',
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const messageElement = container.querySelector('.formbridge-error-display__message');
      expect(messageElement).toBeInTheDocument();
      expect(messageElement).toHaveTextContent('');
    });
  });

  describe('Retry Indicator', () => {
    it('displays retry indicator when retryable is true', () => {
      const error: SubmissionError = {
        message: 'Test error',
        retryable: true,
      };

      render(<ErrorDisplay error={error} />);

      const retryableElement = screen.getByLabelText('retryable');
      expect(retryableElement).toBeInTheDocument();
      expect(retryableElement).toHaveTextContent('(Can retry)');
    });

    it('does not display retry indicator when retryable is false', () => {
      const error: SubmissionError = {
        message: 'Test error',
        retryable: false,
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.queryByLabelText('retryable')).not.toBeInTheDocument();
    });

    it('does not display retry indicator when retryable is undefined', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.queryByLabelText('retryable')).not.toBeInTheDocument();
    });
  });

  describe('Field Errors', () => {
    it('renders field errors list', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
        { path: 'age', code: 'invalid_value', message: 'Age must be positive' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Field Errors:')).toBeInTheDocument();
      expect(screen.getByText('email:')).toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('age:')).toBeInTheDocument();
      expect(screen.getByText('Age must be positive')).toBeInTheDocument();
    });

    it('renders field error codes', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      render(<ErrorDisplay error={error} />);

      const codeElement = screen.getByLabelText('error code: required');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement).toHaveTextContent('(required)');
    });

    it('does not render field errors when showFieldErrors is false', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      render(<ErrorDisplay error={error} showFieldErrors={false} />);

      expect(screen.queryByText('Field Errors:')).not.toBeInTheDocument();
      expect(screen.queryByText('email:')).not.toBeInTheDocument();
    });

    it('does not render field errors section when fieldErrors is undefined', () => {
      const error: SubmissionError = {
        message: 'Validation failed',
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.queryByText('Field Errors:')).not.toBeInTheDocument();
    });

    it('does not render field errors section when fieldErrors is empty array', () => {
      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors: [],
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.queryByText('Field Errors:')).not.toBeInTheDocument();
    });

    it('handles multiple field errors for same path', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
        { path: 'email', code: 'invalid_format', message: 'Email format is invalid' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const errorItems = container.querySelectorAll('[data-field-path="email"]');
      expect(errorItems).toHaveLength(2);
    });

    it('sets data-field-path attribute on error items', () => {
      const fieldErrors: FieldError[] = [
        { path: 'user.email', code: 'required', message: 'Email is required' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const errorItem = container.querySelector('[data-field-path="user.email"]');
      expect(errorItem).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role="alert" for screen readers', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const alertElement = container.querySelector('[role="alert"]');
      expect(alertElement).toBeInTheDocument();
    });

    it('has aria-live="assertive" for immediate announcement', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const errorDisplay = container.querySelector('.formbridge-error-display');
      expect(errorDisplay).toHaveAttribute('aria-live', 'assertive');
    });

    it('has aria-atomic="true" for complete reading', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const errorDisplay = container.querySelector('.formbridge-error-display');
      expect(errorDisplay).toHaveAttribute('aria-atomic', 'true');
    });

    it('uses semantic heading elements', () => {
      const error: SubmissionError = {
        message: 'Test error',
        fieldErrors: [
          { path: 'email', code: 'required', message: 'Email is required' },
        ],
      };

      render(<ErrorDisplay error={error} />);

      const h3 = screen.getByRole('heading', { level: 3 });
      expect(h3).toHaveTextContent('Submission Error');

      const h4 = screen.getByRole('heading', { level: 4 });
      expect(h4).toHaveTextContent('Field Errors:');
    });

    it('uses list markup for field errors', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
        { path: 'age', code: 'invalid_value', message: 'Age must be positive' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const list = container.querySelector('ul');
      expect(list).toBeInTheDocument();

      const listItems = container.querySelectorAll('li');
      expect(listItems).toHaveLength(2);
    });

    it('provides aria-label for error codes', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'invalid_format', message: 'Invalid email format' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      render(<ErrorDisplay error={error} />);

      const codeElement = screen.getByLabelText('error code: invalid_format');
      expect(codeElement).toBeInTheDocument();
    });
  });

  describe('CSS Classes', () => {
    it('applies default CSS classes', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      const { container } = render(<ErrorDisplay error={error} />);

      expect(container.querySelector('.formbridge-error-display')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__header')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__title')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__message')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      const { container } = render(<ErrorDisplay error={error} className="custom-error" />);

      const errorDisplay = container.querySelector('.formbridge-error-display');
      expect(errorDisplay).toHaveClass('custom-error');
    });

    it('applies field error CSS classes', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      const { container } = render(<ErrorDisplay error={error} />);

      expect(container.querySelector('.formbridge-error-display__fields')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__fields-title')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__fields-list')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__field-error')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__field-path')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__field-message')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__field-code')).toBeInTheDocument();
    });

    it('applies retryable CSS class', () => {
      const error: SubmissionError = {
        message: 'Test error',
        retryable: true,
      };

      const { container } = render(<ErrorDisplay error={error} />);

      expect(container.querySelector('.formbridge-error-display__retryable')).toBeInTheDocument();
    });
  });

  describe('Complex Scenarios', () => {
    it('handles error with message, field errors, and retryable flag', () => {
      const error: SubmissionError = {
        message: 'The submission could not be processed',
        fieldErrors: [
          { path: 'email', code: 'invalid_format', message: 'Invalid email format' },
          { path: 'age', code: 'invalid_value', message: 'Age must be at least 18' },
        ],
        retryable: true,
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('The submission could not be processed')).toBeInTheDocument();
      expect(screen.getByLabelText('retryable')).toBeInTheDocument();
      expect(screen.getByText('Field Errors:')).toBeInTheDocument();
      expect(screen.getByText('email:')).toBeInTheDocument();
      expect(screen.getByText('age:')).toBeInTheDocument();
    });

    it('handles error with only message', () => {
      const error: SubmissionError = {
        message: 'Network error occurred',
      };

      const { container } = render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
      expect(container.querySelector('.formbridge-error-display__fields')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('retryable')).not.toBeInTheDocument();
    });

    it('handles error with only field errors', () => {
      const error: SubmissionError = {
        message: undefined,
        fieldErrors: [
          { path: 'email', code: 'required', message: 'Email is required' },
        ],
      };

      const { container } = render(<ErrorDisplay error={error} />);

      expect(container.querySelector('.formbridge-error-display__message')).not.toBeInTheDocument();
      expect(screen.getByText('Field Errors:')).toBeInTheDocument();
      expect(screen.getByText('email:')).toBeInTheDocument();
    });

    it('handles nested field paths', () => {
      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors: [
          { path: 'user.profile.email', code: 'required', message: 'Email is required' },
          { path: 'addresses[0].city', code: 'required', message: 'City is required' },
        ],
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('user.profile.email:')).toBeInTheDocument();
      expect(screen.getByText('addresses[0].city:')).toBeInTheDocument();
    });

    it('handles field errors without codes', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByLabelText('error code: required')).toBeInTheDocument();
    });

    it('handles long error messages', () => {
      const longMessage = 'This is a very long error message that contains a lot of text to test how the component handles lengthy error descriptions. It should display properly without breaking the layout or causing any accessibility issues.';

      const error: SubmissionError = {
        message: longMessage,
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('handles special characters in field paths and messages', () => {
      const error: SubmissionError = {
        message: 'Error with "quotes" and <brackets>',
        fieldErrors: [
          {
            path: 'field.with.dots[0].and[1].brackets',
            code: 'invalid_value',
            message: 'Message with special chars: & < > " \'',
          },
        ],
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Error with "quotes" and <brackets>')).toBeInTheDocument();
      expect(screen.getByText('field.with.dots[0].and[1].brackets:')).toBeInTheDocument();
      expect(screen.getByText('Message with special chars: & < > " \'')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string message', () => {
      const error: SubmissionError = {
        message: '',
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const messageElement = container.querySelector('.formbridge-error-display__message');
      expect(messageElement).toBeInTheDocument();
      expect(messageElement?.textContent).toBe('');
    });

    it('handles field error with empty message', () => {
      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors: [
          { path: 'email', code: 'required', message: '' },
        ],
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('email:')).toBeInTheDocument();
    });

    it('handles field error with empty path', () => {
      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors: [
          { path: '', code: 'required', message: 'Field is required' },
        ],
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const emptyPathElement = container.querySelector('[data-field-path=""]');
      expect(emptyPathElement).toBeInTheDocument();
    });

    it('maintains unique keys for duplicate paths', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'required', message: 'Email is required' },
        { path: 'email', code: 'required', message: 'Email is required' },
        { path: 'email', code: 'required', message: 'Email is required' },
      ];

      const error: SubmissionError = {
        message: 'Validation failed',
        fieldErrors,
      };

      const { container } = render(<ErrorDisplay error={error} />);

      const errorItems = container.querySelectorAll('[data-field-path="email"]');
      expect(errorItems).toHaveLength(3);
    });

    it('handles showFieldErrors=true with no field errors', () => {
      const error: SubmissionError = {
        message: 'Test error',
        fieldErrors: [],
      };

      render(<ErrorDisplay error={error} showFieldErrors={true} />);

      expect(screen.queryByText('Field Errors:')).not.toBeInTheDocument();
    });

    it('renders properly when className is empty string', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      const { container } = render(<ErrorDisplay error={error} className="" />);

      const errorDisplay = container.querySelector('.formbridge-error-display');
      expect(errorDisplay).toBeInTheDocument();
      expect(errorDisplay?.className).toBe('formbridge-error-display');
    });

    it('handles multiple CSS classes in className prop', () => {
      const error: SubmissionError = {
        message: 'Test error',
      };

      const { container } = render(
        <ErrorDisplay error={error} className="custom-class-1 custom-class-2" />
      );

      const errorDisplay = container.querySelector('.formbridge-error-display');
      expect(errorDisplay).toHaveClass('formbridge-error-display');
      expect(errorDisplay).toHaveClass('custom-class-1');
      expect(errorDisplay).toHaveClass('custom-class-2');
    });
  });

  describe('Display Name', () => {
    it('has correct display name', () => {
      expect(ErrorDisplay.displayName).toBe('ErrorDisplay');
    });
  });
});
