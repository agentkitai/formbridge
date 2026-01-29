/**
 * EnumField component - Renders select dropdown or radio buttons for enum values
 * Supports both single-select dropdown and radio group presentations
 */

import React from 'react';
import { EnumFieldProps } from '../../types';
import { FieldWrapper } from '../FieldWrapper';

/**
 * Determines if the field should render as radio buttons
 * Uses explicit widget hint or asRadio prop
 */
function shouldUseRadio(widget?: string, asRadio?: boolean): boolean {
  // Explicit asRadio prop takes precedence
  if (asRadio !== undefined) {
    return asRadio;
  }

  // Check widget hint
  if (widget === 'radio') {
    return true;
  }
  if (widget === 'select') {
    return false;
  }

  // Default to select dropdown for more than 5 options
  // Radio buttons are better for 5 or fewer options
  return false;
}

/**
 * Converts a value to a string for comparison and display
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/**
 * Converts a string back to the appropriate type based on the first option's type
 */
function stringToValue(str: string, options: unknown[]): unknown {
  if (str === '') {
    return null;
  }

  // Try to infer type from the first option
  if (options.length > 0) {
    const firstOption = options[0];

    // If first option is a number, try to parse as number
    if (typeof firstOption === 'number') {
      const num = Number(str);
      return isNaN(num) ? str : num;
    }

    // If first option is a boolean, parse as boolean
    if (typeof firstOption === 'boolean') {
      return str === 'true';
    }
  }

  // Default to string
  return str;
}

/**
 * EnumField - Renders a select dropdown or radio button group for enum values
 *
 * Features:
 * - Select dropdown for longer lists of options
 * - Radio buttons for shorter lists (≤5 options by default)
 * - Automatic type inference for value conversion
 * - Support for string, number, and boolean enum values
 * - Full accessibility support
 * - Optional placeholder text
 *
 * @example
 * ```tsx
 * <EnumField
 *   path="status"
 *   metadata={{
 *     path: 'status',
 *     type: 'string',
 *     label: 'Status',
 *     required: true,
 *     schema: { type: 'string', enum: ['draft', 'published', 'archived'] }
 *   }}
 *   options={['draft', 'published', 'archived']}
 *   value="draft"
 *   onChange={(value) => console.log(value)}
 * />
 * ```
 */
export const EnumField: React.FC<EnumFieldProps> = ({
  path,
  metadata,
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  className = '',
  options,
  asRadio,
}) => {
  const { label, description, required, schema, hint } = metadata;

  // Extract schema properties
  const autoComplete = hint?.autoComplete;
  const placeholder = hint?.placeholder;
  const widget = hint?.widget;

  // Determine rendering mode
  const useRadio = shouldUseRadio(widget, asRadio) || options.length <= 5;

  // Convert current value to string for comparison
  const stringValue = valueToString(value);

  // Handle change event for select
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = stringToValue(e.target.value, options);
    onChange(newValue);
  };

  // Handle change event for radio
  const handleRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = stringToValue(e.target.value, options);
    onChange(newValue);
  };

  // Handle blur event
  const handleBlur = () => {
    if (onBlur) {
      onBlur();
    }
  };

  // Handle keyboard events for better accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow Escape key to blur the field (common accessibility pattern)
    if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  // Render as radio buttons
  if (useRadio) {
    return (
      <FieldWrapper
        path={path}
        label={label}
        description={description}
        required={required}
        error={error}
        className={`formbridge-enum-field formbridge-enum-field--radio ${className}`.trim()}
      >
        <div
          className="formbridge-enum-field__radio-group"
          role="radiogroup"
          aria-label={label}
          aria-required={required ? 'true' : 'false'}
          data-testid={`field-${path}-radio-group`}
        >
          {options.map((option, index) => {
            const optionValue = valueToString(option);
            const optionId = `${path}-option-${index}`;
            const isChecked = stringValue === optionValue;

            return (
              <div
                key={optionValue}
                className="formbridge-enum-field__radio-option"
              >
                <input
                  type="radio"
                  id={optionId}
                  name={path}
                  value={optionValue}
                  checked={isChecked}
                  onChange={handleRadioChange}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  disabled={disabled}
                  className="formbridge-enum-field__radio-input"
                  data-testid={`field-${path}-radio-${index}`}
                />
                <label
                  htmlFor={optionId}
                  className="formbridge-enum-field__radio-label"
                >
                  {optionValue}
                </label>
              </div>
            );
          })}
        </div>
      </FieldWrapper>
    );
  }

  // Render as select dropdown
  return (
    <FieldWrapper
      path={path}
      label={label}
      description={description}
      required={required}
      error={error}
      className={`formbridge-enum-field formbridge-enum-field--select ${className}`.trim()}
    >
      <select
        value={stringValue}
        onChange={handleSelectChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete={autoComplete}
        className="formbridge-enum-field__select"
        data-testid={`field-${path}-select`}
      >
        {/* Empty option for optional fields */}
        {!required && (
          <option value="">
            {placeholder || 'Select an option...'}
          </option>
        )}

        {options.map((option, index) => {
          const optionValue = valueToString(option);
          return (
            <option
              key={optionValue}
              value={optionValue}
              data-testid={`field-${path}-option-${index}`}
            >
              {optionValue}
            </option>
          );
        })}
      </select>
    </FieldWrapper>
  );
};

EnumField.displayName = 'EnumField';
