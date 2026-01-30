/**
 * FieldWrapper component - Wraps form fields with attribution and styling
 * Shows which actor (agent, human, system) filled each field
 */

import React from 'react';
import type { Actor } from '../types';

/**
 * Props for FieldWrapper component
 */
export interface FieldWrapperProps {
  /** Field path/name (e.g., "vendorName", "address.street") */
  fieldPath: string;
  /** Field label to display */
  label: string;
  /** Actor who filled this field (from fieldAttribution map) */
  fieldAttribution?: Actor;
  /** Whether the field is required */
  required?: boolean;
  /** Error message to display */
  error?: string;
  /** Helper text to display below the field */
  helperText?: string;
  /** Child input element(s) */
  children: React.ReactNode;
  /** Custom CSS class */
  className?: string;
}

/**
 * FieldWrapper - Component that wraps form fields with attribution tracking
 *
 * This component provides a consistent layout for form fields and displays
 * visual attribution badges showing which actor (agent, human, system) filled
 * each field in mixed-mode agent-human collaboration workflows.
 *
 * @example
 * ```tsx
 * <FieldWrapper
 *   fieldPath="vendorName"
 *   label="Vendor Name"
 *   fieldAttribution={{ kind: "agent", id: "agent_123", name: "AutoVendor" }}
 *   required
 * >
 *   <input type="text" value={value} onChange={handleChange} />
 * </FieldWrapper>
 * ```
 */
export const FieldWrapper: React.FC<FieldWrapperProps> = ({
  fieldPath,
  label,
  fieldAttribution,
  required = false,
  error,
  helperText,
  children,
  className = '',
}) => {
  // Generate unique ID for accessibility
  const fieldId = `field-${fieldPath.replace(/\./g, '-')}`;
  const errorId = error ? `${fieldId}-error` : undefined;
  const helperId = helperText ? `${fieldId}-helper` : undefined;

  return (
    <div
      className={`formbridge-field-wrapper ${error ? 'formbridge-field-wrapper--error' : ''} ${className}`.trim()}
      data-field-path={fieldPath}
    >
      {/* Label and attribution badge */}
      <div className="formbridge-field-wrapper__header">
        <label
          htmlFor={fieldId}
          className="formbridge-field-wrapper__label"
        >
          {label}
          {required && (
            <span className="formbridge-field-wrapper__required" aria-label="required">
              *
            </span>
          )}
        </label>

        {/* Show actor badge if field has attribution */}
        {fieldAttribution && (
          <span
            className={`formbridge-field-wrapper__attribution formbridge-field-wrapper__attribution--${fieldAttribution.kind}`}
            data-actor-kind={fieldAttribution.kind}
            data-actor-id={fieldAttribution.id}
            aria-label={`Filled by ${fieldAttribution.kind}${fieldAttribution.name ? `: ${fieldAttribution.name}` : ''}`}
          >
            Filled by {fieldAttribution.kind}
            {fieldAttribution.name && (
              <span className="formbridge-field-wrapper__attribution-name">
                {' '}({fieldAttribution.name})
              </span>
            )}
          </span>
        )}
      </div>

      {/* Field input */}
      <div
        className="formbridge-field-wrapper__input"
        id={fieldId}
        aria-describedby={[helperId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? 'true' : 'false'}
      >
        {children}
      </div>

      {/* Helper text */}
      {helperText && !error && (
        <div
          id={helperId}
          className="formbridge-field-wrapper__helper"
        >
          {helperText}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          id={errorId}
          className="formbridge-field-wrapper__error"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
};

FieldWrapper.displayName = 'FieldWrapper';
