/**
 * StringField component - Renders string input fields with appropriate inputMode
 * Supports text, email, url, tel inputs and textarea for long content
 */

import React from 'react';
import { StringFieldProps } from '../../types';
import { FieldWrapper } from '../FieldWrapper';

/**
 * Determines the appropriate inputMode based on the schema format
 */
function getInputMode(format?: string): React.HTMLAttributes<HTMLInputElement>['inputMode'] {
  switch (format) {
    case 'email':
      return 'email';
    case 'uri':
    case 'url':
      return 'url';
    case 'tel':
      return 'tel';
    default:
      return 'text';
  }
}

/**
 * Determines the appropriate input type based on the schema format
 */
function getInputType(format?: string): string {
  switch (format) {
    case 'email':
      return 'email';
    case 'uri':
    case 'url':
      return 'url';
    case 'tel':
      return 'tel';
    default:
      return 'text';
  }
}

/**
 * Determines if the field should render as a textarea
 * Uses maxLength threshold or explicit widget hint
 */
function shouldUseTextarea(
  maxLength?: number,
  widget?: string,
  minLength?: number
): boolean {
  // Explicit widget hint takes precedence
  if (widget === 'textarea') {
    return true;
  }
  if (widget === 'input') {
    return false;
  }

  // Use textarea if maxLength suggests long content (>200 chars)
  // or if minLength is substantial (>100 chars)
  if (maxLength !== undefined && maxLength > 200) {
    return true;
  }
  if (minLength !== undefined && minLength > 100) {
    return true;
  }

  return false;
}

/**
 * StringField - Renders a string input field
 *
 * Features:
 * - Automatic inputMode detection from schema format
 * - Text input or textarea based on length constraints
 * - Pattern validation support
 * - Min/max length constraints
 * - Placeholder and hint text support
 * - Full accessibility support
 *
 * @example
 * ```tsx
 * <StringField
 *   path="email"
 *   metadata={{
 *     path: 'email',
 *     type: 'string',
 *     label: 'Email',
 *     required: true,
 *     schema: { type: 'string', format: 'email' }
 *   }}
 *   value="user@example.com"
 *   onChange={(value) => console.log(value)}
 * />
 * ```
 */
export const StringField: React.FC<StringFieldProps> = ({
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
  const format = schema.format as string | undefined;
  const maxLength = schema.maxLength;
  const minLength = schema.minLength;
  const pattern = schema.pattern;
  const placeholder = hint?.placeholder;
  const inputMode = hint?.inputMode || getInputMode(format);
  const autoComplete = hint?.autoComplete;
  const isTextarea = shouldUseTextarea(maxLength, hint?.widget, minLength);

  // Handle change event
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onChange(e.target.value);
  };

  // Handle blur event
  const handleBlur = () => {
    if (onBlur) {
      onBlur();
    }
  };

  // Handle keyboard events for better accessibility
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    // Allow Escape key to blur the field (common accessibility pattern)
    if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  // Common props for both input and textarea
  const commonProps = {
    value: value || '',
    onChange: handleChange,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    disabled,
    placeholder,
    maxLength,
    minLength,
    autoComplete,
    className: 'formbridge-string-field__input',
  };

  return (
    <FieldWrapper
      path={path}
      label={label}
      description={description}
      required={required}
      error={error}
      className={`formbridge-string-field ${className}`.trim()}
    >
      {isTextarea ? (
        <textarea
          {...commonProps}
          rows={4}
          data-testid={`field-${path}-textarea`}
        />
      ) : (
        <input
          {...commonProps}
          type={getInputType(format)}
          inputMode={inputMode}
          pattern={pattern}
          data-testid={`field-${path}-input`}
        />
      )}
    </FieldWrapper>
  );
};

StringField.displayName = 'StringField';
