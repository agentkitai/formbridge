/**
 * NumberField component - Renders number input fields with min/max constraints
 * Supports integer and decimal numbers with appropriate step values
 */

import React from 'react';
import { NumberFieldProps } from '../../types';
import { FieldWrapper } from '../FieldWrapper';

/**
 * Determines the appropriate step value based on schema constraints
 * Returns 1 for integers, "any" for decimals
 */
function getStepValue(schema: any): string | number {
  // If multipleOf is specified, use that as step
  if (schema.multipleOf !== undefined) {
    return schema.multipleOf;
  }

  // If type is explicitly integer, use step of 1
  if (schema.type === 'integer') {
    return 1;
  }

  // For number type, allow any decimal
  return 'any';
}

/**
 * NumberField - Renders a number input field
 *
 * Features:
 * - Automatic detection of integer vs decimal input
 * - Min/max constraints from schema
 * - Step value for increment/decrement
 * - Handles null values for empty input
 * - Full accessibility support
 *
 * @example
 * ```tsx
 * <NumberField
 *   path="age"
 *   metadata={{
 *     path: 'age',
 *     type: 'number',
 *     label: 'Age',
 *     required: true,
 *     schema: { type: 'integer', minimum: 0, maximum: 120 }
 *   }}
 *   value={25}
 *   onChange={(value) => console.log(value)}
 * />
 * ```
 */
export const NumberField: React.FC<NumberFieldProps> = ({
  path,
  metadata,
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  className = '',
}) => {
  const { label, description, required, schema, hint } = metadata;

  // Extract schema properties
  const minimum = schema.minimum;
  const maximum = schema.maximum;
  const step = getStepValue(schema);
  const placeholder = hint?.placeholder;
  const autoComplete = hint?.autoComplete;

  // Handle change event - convert string to number
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    // Empty input should set value to null
    if (inputValue === '' || inputValue === null || inputValue === undefined) {
      onChange(null);
      return;
    }

    // Convert to number
    const numValue = Number(inputValue);

    // Only update if it's a valid number
    if (!isNaN(numValue)) {
      onChange(numValue);
    } else {
      // For invalid numbers, set to null
      onChange(null);
    }
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

  return (
    <FieldWrapper
      path={path}
      label={label}
      description={description}
      required={required}
      error={error}
      className={`formbridge-number-field ${className}`.trim()}
    >
      <input
        type="number"
        value={value !== null && value !== undefined ? value : ''}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        min={minimum}
        max={maximum}
        step={step}
        autoComplete={autoComplete}
        className="formbridge-number-field__input"
        data-testid={`field-${path}-input`}
      />
    </FieldWrapper>
  );
};

NumberField.displayName = 'NumberField';
