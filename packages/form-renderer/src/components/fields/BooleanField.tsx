/**
 * BooleanField component - Renders checkbox input for boolean values
 * Supports checked/unchecked states with proper accessibility
 */

import React from 'react';
import { BooleanFieldProps } from '../../types';
import { FieldWrapper } from '../FieldWrapper';

/**
 * BooleanField - Renders a checkbox input field
 *
 * Features:
 * - Checkbox input for true/false values
 * - Proper handling of boolean state
 * - Full accessibility support
 * - Optional description text support
 *
 * @example
 * ```tsx
 * <BooleanField
 *   path="agreeToTerms"
 *   metadata={{
 *     path: 'agreeToTerms',
 *     type: 'boolean',
 *     label: 'I agree to the terms and conditions',
 *     required: true,
 *     schema: { type: 'boolean' }
 *   }}
 *   value={true}
 *   onChange={(value) => console.log(value)}
 * />
 * ```
 */
export const BooleanField: React.FC<BooleanFieldProps> = ({
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
  const autoComplete = hint?.autoComplete;

  // Handle change event
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
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
      className={`formbridge-boolean-field ${className}`.trim()}
    >
      <input
        type="checkbox"
        checked={value || false}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete={autoComplete}
        className="formbridge-boolean-field__input"
        data-testid={`field-${path}-input`}
      />
    </FieldWrapper>
  );
};

BooleanField.displayName = 'BooleanField';
