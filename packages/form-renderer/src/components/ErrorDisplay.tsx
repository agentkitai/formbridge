/**
 * ErrorDisplay component - Displays server-side validation errors
 * Shows both general submission errors and field-specific errors
 */

import React from 'react';
import { SubmissionError, FieldError } from '../types/error';

/**
 * Props for ErrorDisplay component
 */
export interface ErrorDisplayProps {
  /** Submission error to display */
  error: SubmissionError | null;
  /** Custom CSS class */
  className?: string;
  /** Whether to show field-level errors (default: true) */
  showFieldErrors?: boolean;
  /** Custom title for error section (default: "Submission Error") */
  title?: string;
}

/**
 * ErrorDisplay - Displays server-side submission errors
 *
 * Features:
 * - General error message display
 * - Field-specific error list
 * - Retry indicator for retryable errors
 * - Accessible ARIA attributes
 * - Customizable via className
 *
 * @example
 * ```tsx
 * <ErrorDisplay
 *   error={{
 *     message: 'Submission failed',
 *     fieldErrors: [
 *       { path: 'email', code: 'invalid_format', message: 'Invalid email' }
 *     ],
 *     retryable: true
 *   }}
 * />
 * ```
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  className = '',
  showFieldErrors = true,
  title = 'Submission Error',
}) => {
  // Don't render if no error
  if (!error) {
    return null;
  }

  const hasFieldErrors = showFieldErrors && error.fieldErrors && error.fieldErrors.length > 0;

  return (
    <div
      className={`formbridge-error-display ${className}`.trim()}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="formbridge-error-display__header">
        <h3 className="formbridge-error-display__title">{title}</h3>
        {error.retryable && (
          <span className="formbridge-error-display__retryable" aria-label="retryable">
            (Can retry)
          </span>
        )}
      </div>

      {error.message && (
        <p className="formbridge-error-display__message">{error.message}</p>
      )}

      {hasFieldErrors && (
        <div className="formbridge-error-display__fields">
          <h4 className="formbridge-error-display__fields-title">Field Errors:</h4>
          <ul className="formbridge-error-display__fields-list">
            {error.fieldErrors!.map((fieldError: FieldError, index: number) => (
              <li
                key={`${fieldError.path}-${index}`}
                className="formbridge-error-display__field-error"
                data-field-path={fieldError.path}
              >
                <strong className="formbridge-error-display__field-path">
                  {fieldError.path}:
                </strong>{' '}
                <span className="formbridge-error-display__field-message">
                  {fieldError.message}
                </span>
                {fieldError.code && (
                  <span
                    className="formbridge-error-display__field-code"
                    aria-label={`error code: ${fieldError.code}`}
                  >
                    {' '}
                    ({fieldError.code})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

ErrorDisplay.displayName = 'ErrorDisplay';
