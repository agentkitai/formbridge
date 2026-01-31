/**
 * Tests for EnumField component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnumField } from './EnumField';
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

describe('EnumField', () => {
  describe('Select Dropdown Rendering', () => {
    it('renders select dropdown with label', () => {
      const metadata = createMetadata({ label: 'Status' });
      const options = ['draft', 'published', 'archived'];

      render(
        <EnumField
          path="status"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByLabelText('Status')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders all options in select dropdown', () => {
      const metadata = createMetadata();
      const options = ['option1', 'option2', 'option3'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      const select = screen.getByRole('combobox');
      const optionElements = Array.from(select.querySelectorAll('option'));

      // Should have empty option + all provided options
      expect(optionElements).toHaveLength(options.length + 1);
      expect(optionElements[1].textContent).toBe('option1');
      expect(optionElements[2].textContent).toBe('option2');
      expect(optionElements[3].textContent).toBe('option3');
    });

    it('renders with selected value', () => {
      const metadata = createMetadata();
      const options = ['draft', 'published', 'archived'];

      render(
        <EnumField
          path="status"
          metadata={metadata}
          value="published"
          onChange={() => {}}
          options={options}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('published');
    });

    it('renders empty option for optional fields', () => {
      const metadata = createMetadata({ required: false });
      const options = ['option1', 'option2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      const select = screen.getByRole('combobox');
      const emptyOption = select.querySelector('option[value=""]');
      expect(emptyOption).toBeInTheDocument();
      expect(emptyOption?.textContent).toBe('Select an option...');
    });

    it('does not render empty option for required fields', () => {
      const metadata = createMetadata({ required: true });
      const options = ['option1', 'option2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="option1"
          onChange={() => {}}
          options={options}
        />
      );

      const select = screen.getByRole('combobox');
      const optionElements = Array.from(select.querySelectorAll('option'));
      expect(optionElements).toHaveLength(options.length);
    });

    it('uses custom placeholder text', () => {
      const metadata = createMetadata({
        hint: { placeholder: 'Choose one...' },
      });
      const options = ['option1', 'option2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      const select = screen.getByRole('combobox');
      const emptyOption = select.querySelector('option[value=""]');
      expect(emptyOption?.textContent).toBe('Choose one...');
    });

    it('renders select for more than 5 options', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });
  });

  describe('Radio Button Rendering', () => {
    it('renders radio buttons for 5 or fewer options', () => {
      const metadata = createMetadata({ label: 'Choice' });
      const options = ['opt1', 'opt2', 'opt3'];

      render(
        <EnumField
          path="choice"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('renders all radio options with labels', () => {
      const metadata = createMetadata();
      const options = ['option1', 'option2', 'option3'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      const radioInputs = screen.getAllByRole('radio');
      expect(radioInputs).toHaveLength(3);

      options.forEach((option) => {
        expect(screen.getByLabelText(option)).toBeInTheDocument();
      });
    });

    it('renders radio buttons with checked state', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt2"
          onChange={() => {}}
          options={options}
        />
      );

      const opt1Radio = screen.getByLabelText('opt1') as HTMLInputElement;
      const opt2Radio = screen.getByLabelText('opt2') as HTMLInputElement;
      const opt3Radio = screen.getByLabelText('opt3') as HTMLInputElement;

      expect(opt1Radio.checked).toBe(false);
      expect(opt2Radio.checked).toBe(true);
      expect(opt3Radio.checked).toBe(false);
    });

    it('forces radio mode when asRadio prop is true', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={true}
        />
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('forces select mode when asRadio prop is false', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });

    it('respects widget hint for radio', () => {
      const metadata = createMetadata({
        hint: { widget: 'radio' },
      });
      const options = ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('respects widget hint for select', () => {
      const metadata = createMetadata({
        hint: { widget: 'select' },
      });
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('Value Types', () => {
    it('handles string values', () => {
      const metadata = createMetadata({
        schema: { type: 'string', enum: ['draft', 'published'] },
      });
      const options = ['draft', 'published'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="draft"
          onChange={() => {}}
          options={options}
        />
      );

      const opt1Radio = screen.getByLabelText('draft') as HTMLInputElement;
      expect(opt1Radio.checked).toBe(true);
    });

    it('handles number values', () => {
      const metadata = createMetadata({
        schema: { type: 'number', enum: [1, 2, 3] },
      });
      const options = [1, 2, 3];
      const onChange = vi.fn();

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value={2}
          onChange={onChange}
          options={options}
        />
      );

      const opt2Radio = screen.getByLabelText('2') as HTMLInputElement;
      expect(opt2Radio.checked).toBe(true);

      // Test onChange converts back to number
      const opt3Radio = screen.getByLabelText('3') as HTMLInputElement;
      fireEvent.click(opt3Radio);

      expect(onChange).toHaveBeenCalledWith(3);
      expect(typeof onChange.mock.calls[0][0]).toBe('number');
    });

    it('handles boolean values', () => {
      const metadata = createMetadata({
        schema: { type: 'boolean', enum: [true, false] },
      });
      const options = [true, false];
      const onChange = vi.fn();

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value={true}
          onChange={onChange}
          options={options}
        />
      );

      const trueRadio = screen.getByLabelText('true') as HTMLInputElement;
      expect(trueRadio.checked).toBe(true);

      // Test onChange converts back to boolean
      const falseRadio = screen.getByLabelText('false') as HTMLInputElement;
      fireEvent.click(falseRadio);

      expect(onChange).toHaveBeenCalledWith(false);
      expect(typeof onChange.mock.calls[0][0]).toBe('boolean');
    });

    it('handles null value', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value={null}
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
    });

    it('handles undefined value', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value={undefined}
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });

  describe('Event Handling - Select', () => {
    it('calls onChange with selected value', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];
      const onChange = vi.fn();

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={onChange}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'opt2' } });

      expect(onChange).toHaveBeenCalledWith('opt2');
    });

    it('calls onChange with null when empty option selected', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];
      const onChange = vi.fn();

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={onChange}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('calls onBlur when select loses focus', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];
      const onBlur = vi.fn();

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={() => {}}
          onBlur={onBlur}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.blur(select);

      expect(onBlur).toHaveBeenCalled();
    });

    it('does not call onBlur when onBlur prop is not provided', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      const { container } = render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      // Should not throw
      fireEvent.blur(select);

      expect(container).toBeInTheDocument();
    });
  });

  describe('Event Handling - Radio', () => {
    it('calls onChange when radio button is clicked', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];
      const onChange = vi.fn();

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={onChange}
          options={options}
        />
      );

      const opt2Radio = screen.getByLabelText('opt2');
      fireEvent.click(opt2Radio);

      expect(onChange).toHaveBeenCalledWith('opt2');
    });

    it('calls onBlur when radio button loses focus', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];
      const onBlur = vi.fn();

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={() => {}}
          onBlur={onBlur}
          options={options}
        />
      );

      const opt1Radio = screen.getByLabelText('opt1');
      fireEvent.blur(opt1Radio);

      expect(onBlur).toHaveBeenCalled();
    });

    it('changes checked state when different radio is selected', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];

      const { rerender } = render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={() => {}}
          options={options}
        />
      );

      let opt1Radio = screen.getByLabelText('opt1') as HTMLInputElement;
      let opt2Radio = screen.getByLabelText('opt2') as HTMLInputElement;
      expect(opt1Radio.checked).toBe(true);
      expect(opt2Radio.checked).toBe(false);

      // Simulate value change
      rerender(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt2"
          onChange={() => {}}
          options={options}
        />
      );

      opt1Radio = screen.getByLabelText('opt1') as HTMLInputElement;
      opt2Radio = screen.getByLabelText('opt2') as HTMLInputElement;
      expect(opt1Radio.checked).toBe(false);
      expect(opt2Radio.checked).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('renders with proper ARIA attributes via FieldWrapper', () => {
      const metadata = createMetadata({
        label: 'Status',
        description: 'Choose your status',
        required: true,
      });
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="status"
          metadata={metadata}
          value="opt1"
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-required', 'true');
      expect(select).toHaveAttribute('aria-invalid', 'false');
      expect(select).toHaveAttribute('aria-describedby');
    });

    it('marks field as invalid when error is present', () => {
      const metadata = createMetadata({ label: 'Status' });
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="status"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          error="This field is required"
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-invalid', 'true');
    });

    it('displays error message with role="alert"', () => {
      const metadata = createMetadata({ label: 'Status' });
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="status"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          error="This field is required"
          asRadio={false}
        />
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toHaveTextContent('This field is required');
    });

    it('renders radio group with radiogroup role', () => {
      const metadata = createMetadata({ label: 'Choice' });
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="choice"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('associates radio labels with inputs', () => {
      const metadata = createMetadata();
      const options = ['option1', 'option2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      options.forEach((option) => {
        const label = screen.getByText(option);
        const input = screen.getByLabelText(option);
        expect(label).toBeInTheDocument();
        expect(input).toBeInTheDocument();
      });
    });
  });

  describe('HTML Attributes - Select', () => {
    it('applies disabled attribute to select', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={() => {}}
          options={options}
          disabled={true}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });

    it('applies autoComplete attribute to select', () => {
      const metadata = createMetadata({
        hint: { autoComplete: 'country' },
      });
      const options = ['US', 'CA', 'UK'];

      render(
        <EnumField
          path="country"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('autoComplete', 'country');
    });

    it('includes correct data-testid for select', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="myField"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      expect(screen.getByTestId('field-myField-select')).toBeInTheDocument();
    });
  });

  describe('HTML Attributes - Radio', () => {
    it('applies disabled attribute to all radio buttons', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt1"
          onChange={() => {}}
          options={options}
          disabled={true}
        />
      );

      const radioInputs = screen.getAllByRole('radio');
      radioInputs.forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });

    it('includes correct data-testid for radio group', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="myField"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByTestId('field-myField-radio-group')).toBeInTheDocument();
    });

    it('includes data-testid for each radio button', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];

      render(
        <EnumField
          path="myField"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByTestId('field-myField-radio-0')).toBeInTheDocument();
      expect(screen.getByTestId('field-myField-radio-1')).toBeInTheDocument();
      expect(screen.getByTestId('field-myField-radio-2')).toBeInTheDocument();
    });

    it('sets same name attribute for all radio buttons', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];

      render(
        <EnumField
          path="myField"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      const radioInputs = screen.getAllByRole('radio') as HTMLInputElement[];
      radioInputs.forEach((radio) => {
        expect(radio.name).toBe('myField');
      });
    });
  });

  describe('CSS Classes', () => {
    it('applies base CSS class for select', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      const { container } = render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const fieldWrapper = container.querySelector('.formbridge-enum-field');
      expect(fieldWrapper).toBeInTheDocument();
      expect(fieldWrapper).toHaveClass('formbridge-enum-field--select');
    });

    it('applies base CSS class for radio', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      const { container } = render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      const fieldWrapper = container.querySelector('.formbridge-enum-field');
      expect(fieldWrapper).toBeInTheDocument();
      expect(fieldWrapper).toHaveClass('formbridge-enum-field--radio');
    });

    it('applies custom className', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      const { container } = render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          className="custom-class"
          asRadio={false}
        />
      );

      const fieldWrapper = container.querySelector('.formbridge-enum-field');
      expect(fieldWrapper).toHaveClass('custom-class');
    });

    it('applies input-specific CSS class for select', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveClass('formbridge-enum-field__select');
    });

    it('applies radio group CSS classes', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2'];

      const { container } = render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      const radioGroup = container.querySelector('.formbridge-enum-field__radio-group');
      expect(radioGroup).toBeInTheDocument();

      const radioInputs = container.querySelectorAll('.formbridge-enum-field__radio-input');
      expect(radioInputs).toHaveLength(2);

      const radioLabels = container.querySelectorAll('.formbridge-enum-field__radio-label');
      expect(radioLabels).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty options array', () => {
      const metadata = createMetadata();
      const options: string[] = [];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      const optionElements = Array.from(select.querySelectorAll('option'));
      // Should only have empty option
      expect(optionElements).toHaveLength(1);
    });

    it('handles single option', () => {
      const metadata = createMetadata();
      const options = ['only-option'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox');
      const optionElements = Array.from(select.querySelectorAll('option'));
      expect(optionElements).toHaveLength(2); // empty + one option
    });

    it('handles options with special characters', () => {
      const metadata = createMetadata();
      const options = ['Option <1>', 'Option "2"', "Option '3'"];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value=""
          onChange={() => {}}
          options={options}
        />
      );

      options.forEach((option) => {
        expect(screen.getByLabelText(option)).toBeInTheDocument();
      });
    });

    it('handles options with whitespace', () => {
      const metadata = createMetadata();
      const options = ['  option1  ', 'option2', '  option3'];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value="  option1  "
          onChange={() => {}}
          options={options}
        />
      );

      const opt1Radio = screen.getByLabelText('  option1  ') as HTMLInputElement;
      expect(opt1Radio.checked).toBe(true);
    });

    it('handles mixed type options (all converted to strings)', () => {
      const metadata = createMetadata();
      const options = [1, 'two', true, null];

      render(
        <EnumField
          path="test"
          metadata={metadata}
          value={1}
          onChange={() => {}}
          options={options}
        />
      );

      expect(screen.getByLabelText('1')).toBeInTheDocument();
      expect(screen.getByLabelText('two')).toBeInTheDocument();
      expect(screen.getByLabelText('true')).toBeInTheDocument();
      expect(screen.getByLabelText('')).toBeInTheDocument();
    });

    it('preserves value when switching between modes', () => {
      const metadata = createMetadata();
      const options = ['opt1', 'opt2', 'opt3'];

      const { rerender } = render(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt2"
          onChange={() => {}}
          options={options}
          asRadio={false}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('opt2');

      // Switch to radio mode
      rerender(
        <EnumField
          path="test"
          metadata={metadata}
          value="opt2"
          onChange={() => {}}
          options={options}
          asRadio={true}
        />
      );

      const opt2Radio = screen.getByLabelText('opt2') as HTMLInputElement;
      expect(opt2Radio.checked).toBe(true);
    });
  });

  describe('Display Name', () => {
    it('has correct display name', () => {
      expect(EnumField.displayName).toBe('EnumField');
    });
  });
});
