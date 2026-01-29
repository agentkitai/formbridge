/**
 * FieldWrapper component - Wraps form fields with label, description, and error display
 * Provides consistent structure and accessibility for all field types
 */

import React from 'react';
import { FieldWrapperProps } from '../types';

/**
 * FieldWrapper - A container component that provides consistent structure for form fields
 *
 * Features:
 * - Accessible label with htmlFor linking
 * - Required field indicator
 * - Optional description text
 * - Error message display with ARIA attributes
 * - Customizable via className
 *
 * @example
 * ```tsx
 * <FieldWrapper
 *   path="email"
 *   label="Email Address"
 *   description="We'll never share your email"
 *   required={true}
 *   error="Email is required"
 * >
 *   <input type="email" id="email" />
 * </FieldWrapper>
 * ```
 */
export const FieldWrapper: React.FC<FieldWrapperProps> = ({
  path,
  label,
  description,
  required = false,
  error,
  className = '',
  children,
}) => {
  // Generate unique IDs for accessibility
  const fieldId = `field-${path}`;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={`formbridge-field ${className}`.trim()} data-field-path={path}>
      <label htmlFor={fieldId} className="formbridge-field__label">
        {label}
        {required && (
          <span className="formbridge-field__required" aria-label="required">
            *
          </span>
        )}
      </label>

      {description && (
        <p
          id={descriptionId}
          className="formbridge-field__description"
        >
          {description}
        </p>
      )}

      <div className="formbridge-field__input">
        {/* Clone children and add accessibility IDs */}
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              id: fieldId,
              'aria-describedby': [descriptionId, errorId]
                .filter(Boolean)
                .join(' ') || undefined,
              'aria-invalid': error ? 'true' : 'false',
              'aria-required': required ? 'true' : 'false',
            });
          }
          return child;
        })}
      </div>

      {error && (
        <div
          id={errorId}
          className="formbridge-field__error"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}
    </div>
  );
};

FieldWrapper.displayName = 'FieldWrapper';
