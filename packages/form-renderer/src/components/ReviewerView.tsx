/**
 * ReviewerView component - Displays a submission for review with approval actions
 * Shows submission data in read-only mode with field attribution and metadata
 */

import React from 'react';
import { FormBridgeForm } from './FormBridgeForm';
import { ActorBadge } from './ActorBadge';
import type { FormSchema } from './FormBridgeForm';
import type { Actor } from '../types';

/**
 * Submission data structure for review
 */
export interface ReviewSubmission {
  id: string;
  intakeId: string;
  state: string;
  resumeToken: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  fields: Record<string, unknown>;
  fieldAttribution: Record<string, Actor>;
  createdBy: Actor;
  updatedBy: Actor;
}

/**
 * Props for ReviewerView component
 */
export interface ReviewerViewProps {
  /** The submission to review */
  submission: ReviewSubmission;
  /** JSON Schema defining the form structure */
  schema: FormSchema;
  /** Current reviewer actor */
  reviewer: Actor;
  /** Custom CSS class */
  className?: string;
  /** Optional slot for approval action buttons */
  approvalActions?: React.ReactNode;
  /** Callback when submission metadata is clicked (for debugging/details) */
  onMetadataClick?: (submission: ReviewSubmission) => void;
}

/**
 * ReviewerView - Component that displays a submission for review
 *
 * This component provides a read-only view of a submission that requires
 * human review. It shows all form fields with attribution badges indicating
 * which actor (agent, human, system) filled each field, along with submission
 * metadata and optional approval action buttons.
 *
 * Used in approval workflows where reviewers need to examine submissions
 * before approving, rejecting, or requesting changes.
 *
 * @example
 * ```tsx
 * <ReviewerView
 *   submission={submission}
 *   schema={intakeSchema}
 *   reviewer={{ kind: 'human', id: 'reviewer_123', name: 'Jane Doe' }}
 *   approvalActions={
 *     <ApprovalActions
 *       onApprove={handleApprove}
 *       onReject={handleReject}
 *       onRequestChanges={handleRequestChanges}
 *     />
 *   }
 * />
 * ```
 */
export const ReviewerView: React.FC<ReviewerViewProps> = ({
  submission,
  schema,
  reviewer,
  className = '',
  approvalActions,
  onMetadataClick,
}) => {
  /**
   * Format timestamp for display
   */
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  /**
   * Handle metadata click
   */
  const handleMetadataClick = () => {
    onMetadataClick?.(submission);
  };

  return (
    <div className={`formbridge-reviewer-view ${className}`.trim()}>
      {/* Submission Header */}
      <div className="formbridge-reviewer-view__header">
        <h2 className="formbridge-reviewer-view__title">
          Review Submission
        </h2>
        <div className="formbridge-reviewer-view__metadata">
          <div className="formbridge-reviewer-view__metadata-item">
            <span className="formbridge-reviewer-view__metadata-label">Submission ID:</span>
            <span className="formbridge-reviewer-view__metadata-value">{submission.id}</span>
          </div>
          <div className="formbridge-reviewer-view__metadata-item">
            <span className="formbridge-reviewer-view__metadata-label">State:</span>
            <span className={`formbridge-reviewer-view__state formbridge-reviewer-view__state--${submission.state}`}>
              {submission.state}
            </span>
          </div>
          <div className="formbridge-reviewer-view__metadata-item">
            <span className="formbridge-reviewer-view__metadata-label">Created By:</span>
            <ActorBadge
              actor={submission.createdBy}
              prefix=""
              size="small"
            />
          </div>
          <div className="formbridge-reviewer-view__metadata-item">
            <span className="formbridge-reviewer-view__metadata-label">Created At:</span>
            <span className="formbridge-reviewer-view__metadata-value">
              {formatTimestamp(submission.createdAt)}
            </span>
          </div>
          {submission.expiresAt && (
            <div className="formbridge-reviewer-view__metadata-item">
              <span className="formbridge-reviewer-view__metadata-label">Expires At:</span>
              <span className="formbridge-reviewer-view__metadata-value">
                {formatTimestamp(submission.expiresAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Form Fields (Read-Only) */}
      <div className="formbridge-reviewer-view__form">
        <FormBridgeForm
          schema={schema}
          fields={submission.fields}
          fieldAttribution={submission.fieldAttribution}
          currentActor={reviewer}
          readOnly
        />
      </div>

      {/* Approval Actions */}
      {approvalActions && (
        <div className="formbridge-reviewer-view__actions">
          {approvalActions}
        </div>
      )}

      {/* Debug info (optional) */}
      {onMetadataClick && (
        <div className="formbridge-reviewer-view__debug">
          <button
            type="button"
            onClick={handleMetadataClick}
            className="formbridge-reviewer-view__debug-button"
          >
            View Full Submission Details
          </button>
        </div>
      )}
    </div>
  );
};

ReviewerView.displayName = 'ReviewerView';
