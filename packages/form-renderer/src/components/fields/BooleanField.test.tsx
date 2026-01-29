/**
 * Tests for BooleanField component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BooleanField } from './BooleanField';
import { FieldMetadata } from '../../types';

// Helper to create metadata
const createMetadata = (overrides: Partial<FieldMetadata> = {}): FieldMetadata => ({
  path: 'testField',
  type: 'boolean',
  label: 'Test Field',
  required: false,
  schema: { type: 'boolean' },
  ...overrides,
});

describe('BooleanField', () => {
  describe('Basic Rendering', () => {
    it('renders checkbox input with label', () => {
      const metadata = createMetadata({ label: 'Accept Terms' });
      render(
        <BooleanField
          path="acceptTerms"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      expect(screen.getByLabelText('Accept Terms')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('renders unchecked by default when value is false', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('renders checked when value is true', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={true}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it('renders unchecked when value is undefined', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={undefined as any}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('renders unchecked when value is null', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={null as any}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('calls onChange with true when unchecked checkbox is checked', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={onChange}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(onChange).toHaveBeenCalledWith(true);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChange with false when checked checkbox is unchecked', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={true}
          onChange={onChange}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(onChange).toHaveBeenCalledWith(false);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChange multiple times when toggled multiple times', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      const { rerender } = render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={onChange}
        />
      );

      const checkbox = screen.getByRole('checkbox');

      // First click - check
      fireEvent.click(checkbox);
      expect(onChange).toHaveBeenCalledWith(true);

      // Update the value
      rerender(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={true}
          onChange={onChange}
        />
      );

      // Second click - uncheck
      fireEvent.click(checkbox);
      expect(onChange).toHaveBeenCalledWith(false);

      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('calls onBlur when checkbox loses focus', () => {
      const onBlur = vi.fn();
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
          onBlur={onBlur}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.blur(checkbox);

      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('does not call onBlur when not provided', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      // Should not throw error
      fireEvent.blur(checkbox);
    });

    it('does not trigger onChange when disabled', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={onChange}
          disabled={true}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // onChange should not be called when disabled
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('displays required indicator for required fields', () => {
      const metadata = createMetadata({
        label: 'Accept Terms',
        required: true,
      });
      render(
        <BooleanField
          path="acceptTerms"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      expect(screen.getByLabelText('required')).toBeInTheDocument();
    });

    it('displays description when provided', () => {
      const metadata = createMetadata({
        description: 'You must agree to continue',
      });
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      expect(screen.getByText('You must agree to continue')).toBeInTheDocument();
    });

    it('displays error message when provided', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
          error="You must accept the terms"
        />
      );

      expect(screen.getByText('You must accept the terms')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('sets aria-invalid when error is present', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
          error="You must accept the terms"
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    });

    it('sets aria-invalid to false when no error', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-invalid', 'false');
    });

    it('sets aria-required when field is required', () => {
      const metadata = createMetadata({ required: true });
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-required', 'true');
    });

    it('links checkbox to label via id', () => {
      const metadata = createMetadata({ label: 'Accept Terms' });
      render(
        <BooleanField
          path="acceptTerms"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('id', 'field-acceptTerms');

      const label = screen.getByText('Accept Terms').closest('label');
      expect(label).toHaveAttribute('for', 'field-acceptTerms');
    });
  });

  describe('HTML Attributes', () => {
    it('applies autoComplete from hint', () => {
      const metadata = createMetadata({
        hint: { autoComplete: 'off' },
      });
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox).toHaveAttribute('autoComplete', 'off');
    });

    it('disables checkbox when disabled prop is true', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
          disabled={true}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox).toBeDisabled();
    });

    it('enables checkbox when disabled prop is false', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
          disabled={false}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox).not.toBeDisabled();
    });

    it('has type="checkbox" attribute', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox).toHaveAttribute('type', 'checkbox');
    });
  });

  describe('CSS Classes', () => {
    it('applies default formbridge-boolean-field class', () => {
      const metadata = createMetadata();
      const { container } = render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      expect(container.querySelector('.formbridge-boolean-field')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const metadata = createMetadata();
      const { container } = render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
          className="custom-class"
        />
      );

      const field = container.querySelector('.formbridge-boolean-field');
      expect(field).toHaveClass('custom-class');
    });

    it('applies input-specific class to checkbox element', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveClass('formbridge-boolean-field__input');
    });
  });

  describe('Edge Cases', () => {
    it('handles schema without hint', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('handles empty string value as unchecked', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={'' as any}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('handles 0 value as unchecked', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={0 as any}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('handles 1 value as checked', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={1 as any}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it('handles non-boolean truthy values as checked', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={'yes' as any}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });
  });

  describe('Data Test IDs', () => {
    it('includes data-testid attribute', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      expect(screen.getByTestId('field-agreed-input')).toBeInTheDocument();
    });

    it('uses path in data-testid', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="terms.privacy"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      expect(screen.getByTestId('field-terms.privacy-input')).toBeInTheDocument();
    });
  });

  describe('Keyboard Interaction', () => {
    it('can be toggled with space key', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={onChange}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      checkbox.focus();
      fireEvent.keyDown(checkbox, { key: ' ', code: 'Space' });
      fireEvent.click(checkbox); // Space key triggers click event on checkboxes

      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('maintains focus after clicking', () => {
      const metadata = createMetadata();
      render(
        <BooleanField
          path="agreed"
          metadata={metadata}
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      checkbox.focus();
      expect(document.activeElement).toBe(checkbox);

      fireEvent.click(checkbox);
      expect(document.activeElement).toBe(checkbox);
    });
  });
});
