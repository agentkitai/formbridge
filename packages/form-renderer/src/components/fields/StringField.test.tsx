/**
 * Tests for StringField component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StringField } from './StringField';
import { FieldMetadata } from '../../types';

// Helper to create metadata
const createMetadata = (overrides: Partial<FieldMetadata> = {}): FieldMetadata => ({
  path: 'testField',
  type: 'string',
  label: 'Test Field',
  required: false,
  schema: { type: 'string' },
  ...overrides,
});

describe('StringField', () => {
  describe('Basic Rendering', () => {
    it('renders text input with label', () => {
      const metadata = createMetadata({ label: 'Username' });
      render(
        <StringField
          path="username"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders with initial value', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value="John Doe"
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('John Doe');
    });

    it('renders with empty string when value is empty', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');
    });
  });

  describe('Input Types and InputMode', () => {
    it('renders email input with email inputMode for email format', () => {
      const metadata = createMetadata({
        schema: { type: 'string', format: 'email' },
      });
      render(
        <StringField
          path="email"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'email');
      expect(input).toHaveAttribute('inputMode', 'email');
    });

    it('renders url input with url inputMode for uri format', () => {
      const metadata = createMetadata({
        schema: { type: 'string', format: 'uri' },
      });
      render(
        <StringField
          path="website"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'url');
      expect(input).toHaveAttribute('inputMode', 'url');
    });

    it('renders url input with url inputMode for url format', () => {
      const metadata = createMetadata({
        schema: { type: 'string', format: 'url' },
      });
      render(
        <StringField
          path="website"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'url');
      expect(input).toHaveAttribute('inputMode', 'url');
    });

    it('renders tel input with tel inputMode for tel format', () => {
      const metadata = createMetadata({
        schema: { type: 'string', format: 'tel' },
      });
      render(
        <StringField
          path="phone"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'tel');
      expect(input).toHaveAttribute('inputMode', 'tel');
    });

    it('renders text input with text inputMode by default', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('inputMode', 'text');
    });

    it('uses custom inputMode from hint when provided', () => {
      const metadata = createMetadata({
        hint: { inputMode: 'numeric' },
      });
      render(
        <StringField
          path="zip"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('inputMode', 'numeric');
    });
  });

  describe('Textarea Rendering', () => {
    it('renders textarea when maxLength > 200', () => {
      const metadata = createMetadata({
        schema: { type: 'string', maxLength: 500 },
      });
      render(
        <StringField
          path="bio"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('renders textarea when minLength > 100', () => {
      const metadata = createMetadata({
        schema: { type: 'string', minLength: 150 },
      });
      render(
        <StringField
          path="description"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('renders textarea when widget hint is textarea', () => {
      const metadata = createMetadata({
        hint: { widget: 'textarea' },
      });
      render(
        <StringField
          path="comments"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('renders input when widget hint is input even with large maxLength', () => {
      const metadata = createMetadata({
        schema: { type: 'string', maxLength: 500 },
        hint: { widget: 'input' },
      });
      render(
        <StringField
          path="code"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.tagName).toBe('INPUT');
    });

    it('renders textarea with 4 rows by default', () => {
      const metadata = createMetadata({
        hint: { widget: 'textarea' },
      });
      render(
        <StringField
          path="notes"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea).toHaveAttribute('rows', '4');
    });
  });

  describe('Event Handling', () => {
    it('calls onChange when input value changes', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={onChange}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'New Value' } });

      expect(onChange).toHaveBeenCalledWith('New Value');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur when input loses focus', () => {
      const onBlur = vi.fn();
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
          onBlur={onBlur}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.blur(input);

      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('does not call onBlur when not provided', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      // Should not throw error
      fireEvent.blur(input);
    });

    it('calls onChange for textarea', () => {
      const onChange = vi.fn();
      const metadata = createMetadata({
        hint: { widget: 'textarea' },
      });
      render(
        <StringField
          path="bio"
          metadata={metadata}
          value=""
          onChange={onChange}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Long text content' } });

      expect(onChange).toHaveBeenCalledWith('Long text content');
    });
  });

  describe('Validation Attributes', () => {
    it('applies maxLength constraint', () => {
      const metadata = createMetadata({
        schema: { type: 'string', maxLength: 50 },
      });
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('maxLength', '50');
    });

    it('applies minLength constraint', () => {
      const metadata = createMetadata({
        schema: { type: 'string', minLength: 3 },
      });
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('minLength', '3');
    });

    it('applies pattern constraint', () => {
      const metadata = createMetadata({
        schema: { type: 'string', pattern: '^[A-Z][a-z]+$' },
      });
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('pattern', '^[A-Z][a-z]+$');
    });
  });

  describe('Accessibility', () => {
    it('displays required indicator for required fields', () => {
      const metadata = createMetadata({
        label: 'Email',
        required: true,
      });
      render(
        <StringField
          path="email"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      expect(screen.getByLabelText('required')).toBeInTheDocument();
    });

    it('displays description when provided', () => {
      const metadata = createMetadata({
        description: 'Enter your full name',
      });
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      expect(screen.getByText('Enter your full name')).toBeInTheDocument();
    });

    it('displays error message when provided', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
          error="Name is required"
        />
      );

      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('sets aria-invalid when error is present', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
          error="Name is required"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('HTML Attributes', () => {
    it('applies placeholder from hint', () => {
      const metadata = createMetadata({
        hint: { placeholder: 'Enter your name' },
      });
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('placeholder', 'Enter your name');
    });

    it('applies autoComplete from hint', () => {
      const metadata = createMetadata({
        hint: { autoComplete: 'email' },
      });
      render(
        <StringField
          path="email"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('autoComplete', 'email');
    });

    it('disables input when disabled prop is true', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
          disabled={true}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it('enables input when disabled prop is false', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
          disabled={false}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).not.toBeDisabled();
    });
  });

  describe('CSS Classes', () => {
    it('applies default formbridge-string-field class', () => {
      const metadata = createMetadata();
      const { container } = render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      expect(container.querySelector('.formbridge-string-field')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const metadata = createMetadata();
      const { container } = render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
          className="custom-class"
        />
      );

      const field = container.querySelector('.formbridge-string-field');
      expect(field).toHaveClass('custom-class');
    });

    it('applies input-specific class to input element', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('formbridge-string-field__input');
    });

    it('applies input-specific class to textarea element', () => {
      const metadata = createMetadata({
        hint: { widget: 'textarea' },
      });
      render(
        <StringField
          path="bio"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass('formbridge-string-field__input');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined value', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value={undefined as any}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('handles null value', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value={null as any}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('handles schema without format', () => {
      const metadata = createMetadata({
        schema: { type: 'string' },
      });
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('inputMode', 'text');
    });

    it('handles metadata without hint', () => {
      const metadata = createMetadata();
      render(
        <StringField
          path="name"
          metadata={metadata}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
    });
  });
});
