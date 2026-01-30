/**
 * FieldWrapper component - Wraps form fields with attribution and styling
 * Shows which actor (agent, human, system) filled each field
 */

import React, { useState } from 'react';
import type { Actor } from '../types';
import type { FieldComment } from './ApprovalActions';

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
  /** Existing field comment from previous review */
  fieldComment?: FieldComment;
  /** Whether to show comment input for review mode */
  reviewMode?: boolean;
  /** Callback when reviewer adds/edits a comment */
  onCommentChange?: (fieldPath: string, comment: string) => void;
  /** Placeholder text for comment input */
  commentPlaceholder?: string;
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
  fieldComment,
  reviewMode = false,
  onCommentChange,
  commentPlaceholder = 'Add a comment about what needs to change...',
}) => {
  // Local state for comment input
  const [localComment, setLocalComment] = useState(fieldComment?.comment || '');

  // Generate unique ID for accessibility
  const fieldId = `field-${fieldPath.replace(/\./g, '-')}`;
  const errorId = error ? `${fieldId}-error` : undefined;
  const helperId = helperText ? `${fieldId}-helper` : undefined;
  const commentId = `${fieldId}-comment`;
  const commentInputId = `${fieldId}-comment-input`;

  // Handle comment input change
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newComment = e.target.value;
    setLocalComment(newComment);
    onCommentChange?.(fieldPath, newComment);
  };

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

      {/* Existing field comment (display mode) */}
      {fieldComment && !reviewMode && (
        <div
          id={commentId}
          className="formbridge-field-wrapper__comment"
          data-comment-field-path={fieldComment.fieldPath}
        >
          <div className="formbridge-field-wrapper__comment-header">
            <span className="formbridge-field-wrapper__comment-label">
              Reviewer Comment:
            </span>
          </div>
          <div className="formbridge-field-wrapper__comment-text">
            {fieldComment.comment}
          </div>
          {fieldComment.suggestedValue !== undefined && (
            <div className="formbridge-field-wrapper__comment-suggestion">
              <span className="formbridge-field-wrapper__comment-suggestion-label">
                Suggested value:
              </span>
              {' '}
              <code className="formbridge-field-wrapper__comment-suggestion-value">
                {typeof fieldComment.suggestedValue === 'string'
                  ? fieldComment.suggestedValue
                  : JSON.stringify(fieldComment.suggestedValue)}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Comment input (review mode) */}
      {reviewMode && (
        <div className="formbridge-field-wrapper__comment-input-container">
          <label
            htmlFor={commentInputId}
            className="formbridge-field-wrapper__comment-input-label"
          >
            Reviewer Comment (optional):
          </label>
          <textarea
            id={commentInputId}
            className="formbridge-field-wrapper__comment-input"
            value={localComment}
            onChange={handleCommentChange}
            placeholder={commentPlaceholder}
            rows={3}
            aria-label={`Add comment for ${label}`}
            data-field-path={fieldPath}
          />
        </div>
      )}
    </div>
  );
};

FieldWrapper.displayName = 'FieldWrapper';
