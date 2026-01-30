/**
 * Tests for NumberField component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NumberField } from './NumberField';
import { FieldMetadata } from '../../types';

// Helper to create metadata
const createMetadata = (overrides: Partial<FieldMetadata> = {}): FieldMetadata => ({
  path: 'testField',
  type: 'number',
  label: 'Test Field',
  required: false,
  schema: { type: 'number' },
  ...overrides,
});

describe('NumberField', () => {
  describe('Basic Rendering', () => {
    it('renders number input with label', () => {
      const metadata = createMetadata({ label: 'Age' });
      render(
        <NumberField
          path="age"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      expect(screen.getByLabelText('Age')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it('renders with initial numeric value', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={42}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('42');
    });

    it('renders with null value as empty input', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('renders with zero value', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={0}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('0');
    });

    it('renders with negative value', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="temperature"
          metadata={metadata}
          value={-15}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('-15');
    });

    it('renders with decimal value', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="price"
          metadata={metadata}
          value={19.99}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('19.99');
    });
  });

  describe('Min/Max Constraints', () => {
    it('applies minimum constraint', () => {
      const metadata = createMetadata({
        schema: { type: 'number', minimum: 0 },
      });
      render(
        <NumberField
          path="age"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('min', '0');
    });

    it('applies maximum constraint', () => {
      const metadata = createMetadata({
        schema: { type: 'number', maximum: 100 },
      });
      render(
        <NumberField
          path="percentage"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('max', '100');
    });

    it('applies both min and max constraints', () => {
      const metadata = createMetadata({
        schema: { type: 'number', minimum: 1, maximum: 10 },
      });
      render(
        <NumberField
          path="rating"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', '10');
    });

    it('handles negative minimum', () => {
      const metadata = createMetadata({
        schema: { type: 'number', minimum: -100 },
      });
      render(
        <NumberField
          path="temperature"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('min', '-100');
    });
  });

  describe('Step Value', () => {
    it('uses step="any" for number type by default', () => {
      const metadata = createMetadata({
        schema: { type: 'number' },
      });
      render(
        <NumberField
          path="price"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('step', 'any');
    });

    it('uses step="1" for integer type', () => {
      const metadata = createMetadata({
        schema: { type: 'integer' },
      });
      render(
        <NumberField
          path="count"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('step', '1');
    });

    it('uses multipleOf as step when specified', () => {
      const metadata = createMetadata({
        schema: { type: 'number', multipleOf: 0.01 },
      });
      render(
        <NumberField
          path="price"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('step', '0.01');
    });

    it('prioritizes multipleOf over integer type', () => {
      const metadata = createMetadata({
        schema: { type: 'integer', multipleOf: 5 },
      });
      render(
        <NumberField
          path="count"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('step', '5');
    });
  });

  describe('Event Handling', () => {
    it('calls onChange with numeric value when valid number is entered', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={onChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '42' } });

      expect(onChange).toHaveBeenCalledWith(42);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChange with decimal value', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <NumberField
          path="price"
          metadata={metadata}
          value={null}
          onChange={onChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '19.99' } });

      expect(onChange).toHaveBeenCalledWith(19.99);
    });

    it('calls onChange with negative value', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <NumberField
          path="temperature"
          metadata={metadata}
          value={null}
          onChange={onChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '-15' } });

      expect(onChange).toHaveBeenCalledWith(-15);
    });

    it('calls onChange with zero', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <NumberField
          path="count"
          metadata={metadata}
          value={null}
          onChange={onChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('calls onChange with null when input is cleared', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={42}
          onChange={onChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('calls onChange with null for invalid input', () => {
      const onChange = vi.fn();
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={onChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: 'abc' } });

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('calls onBlur when input loses focus', () => {
      const onBlur = vi.fn();
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
          onBlur={onBlur}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.blur(input);

      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('does not call onBlur when not provided', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton');
      // Should not throw error
      fireEvent.blur(input);
    });
  });

  describe('Accessibility', () => {
    it('displays required indicator for required fields', () => {
      const metadata = createMetadata({
        label: 'Age',
        required: true,
      });
      render(
        <NumberField
          path="age"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      expect(screen.getByLabelText('required')).toBeInTheDocument();
    });

    it('displays description when provided', () => {
      const metadata = createMetadata({
        description: 'Enter a number between 1 and 100',
      });
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      expect(screen.getByText('Enter a number between 1 and 100')).toBeInTheDocument();
    });

    it('displays error message when provided', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="age"
          metadata={metadata}
          value={null}
          onChange={() => {}}
          error="Age is required"
        />
      );

      expect(screen.getByText('Age is required')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('sets aria-invalid when error is present', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="age"
          metadata={metadata}
          value={null}
          onChange={() => {}}
          error="Age is required"
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('HTML Attributes', () => {
    it('applies placeholder from hint', () => {
      const metadata = createMetadata({
        hint: { placeholder: 'Enter a number' },
      });
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('placeholder', 'Enter a number');
    });

    it('applies autoComplete from hint', () => {
      const metadata = createMetadata({
        hint: { autoComplete: 'age' },
      });
      render(
        <NumberField
          path="age"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('autoComplete', 'age');
    });

    it('disables input when disabled prop is true', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
          disabled={true}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it('enables input when disabled prop is false', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
          disabled={false}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).not.toBeDisabled();
    });

    it('has type="number" attribute', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'number');
    });
  });

  describe('CSS Classes', () => {
    it('applies default formbridge-number-field class', () => {
      const metadata = createMetadata();
      const { container } = render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      expect(container.querySelector('.formbridge-number-field')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const metadata = createMetadata();
      const { container } = render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
          className="custom-class"
        />
      );

      const field = container.querySelector('.formbridge-number-field');
      expect(field).toHaveClass('custom-class');
    });

    it('applies input-specific class to input element', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveClass('formbridge-number-field__input');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined value', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={undefined as any}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('handles very large numbers', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={999999999999}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('999999999999');
    });

    it('handles very small decimal numbers', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="precision"
          metadata={metadata}
          value={0.0001}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('0.0001');
    });

    it('handles schema without constraints', () => {
      const metadata = createMetadata({
        schema: { type: 'number' },
      });
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input).not.toHaveAttribute('min');
      expect(input).not.toHaveAttribute('max');
    });

    it('handles metadata without hint', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
    });
  });

  describe('Data Test IDs', () => {
    it('includes data-testid attribute', () => {
      const metadata = createMetadata();
      render(
        <NumberField
          path="quantity"
          metadata={metadata}
          value={null}
          onChange={() => {}}
        />
      );

      expect(screen.getByTestId('field-quantity-input')).toBeInTheDocument();
    });
  });
});
