/**
 * ApprovalActions component - Displays action buttons for reviewing submissions
 * Provides approve, reject, and request changes actions for approval workflows
 */

import React from 'react';
import type { Actor } from '../types';

/**
 * Field-level comment for request_changes action
 */
export interface FieldComment {
  fieldPath: string;
  comment: string;
  suggestedValue?: unknown;
}

/**
 * Props for ApprovalActions component
 */
export interface ApprovalActionsProps {
  /** Submission ID being reviewed */
  submissionId: string;
  /** Resume token for the submission */
  resumeToken: string;
  /** Current reviewer actor */
  reviewer: Actor;
  /** Callback when approve button is clicked */
  onApprove?: (data: { submissionId: string; resumeToken: string; actor: Actor; comment?: string }) => void | Promise<void>;
  /** Callback when reject button is clicked */
  onReject?: (data: { submissionId: string; resumeToken: string; actor: Actor; reason: string; comment?: string }) => void | Promise<void>;
  /** Callback when request changes button is clicked */
  onRequestChanges?: (data: { submissionId: string; resumeToken: string; actor: Actor; fieldComments: FieldComment[]; comment?: string }) => void | Promise<void>;
  /** Whether actions are currently loading/processing */
  loading?: boolean;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Custom CSS class */
  className?: string;
  /** Layout variant */
  layout?: 'horizontal' | 'vertical';
  /** Size variant of the buttons */
  size?: 'small' | 'medium' | 'large';
}

/**
 * ApprovalActions - Component that displays action buttons for reviewing submissions
 *
 * This component provides a consistent UI for reviewers to approve, reject, or
 * request changes on submissions in approval workflows. Used in conjunction with
 * ReviewerView to provide the approval gate functionality.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ApprovalActions
 *   submissionId="sub_123"
 *   resumeToken="rtok_456"
 *   reviewer={{ kind: "human", id: "reviewer_1", name: "Jane Doe" }}
 *   onApprove={handleApprove}
 *   onReject={handleReject}
 *   onRequestChanges={handleRequestChanges}
 * />
 *
 * // With loading state
 * <ApprovalActions
 *   submissionId="sub_123"
 *   resumeToken="rtok_456"
 *   reviewer={{ kind: "human", id: "reviewer_1" }}
 *   onApprove={handleApprove}
 *   loading={isProcessing}
 * />
 *
 * // Vertical layout
 * <ApprovalActions
 *   submissionId="sub_123"
 *   resumeToken="rtok_456"
 *   reviewer={{ kind: "human", id: "reviewer_1" }}
 *   onApprove={handleApprove}
 *   layout="vertical"
 * />
 * ```
 */
export const ApprovalActions: React.FC<ApprovalActionsProps> = ({
  submissionId,
  resumeToken,
  reviewer,
  onApprove,
  onReject,
  onRequestChanges,
  loading = false,
  disabled = false,
  className = '',
  layout = 'horizontal',
  size = 'medium',
}) => {
  // Handle approve action
  const handleApprove = async () => {
    if (onApprove) {
      await onApprove({
        submissionId,
        resumeToken,
        actor: reviewer,
      });
    }
  };

  // Handle reject action
  const handleReject = async () => {
    // In a real implementation, this would show a dialog to collect the reason
    // For now, we'll use a simple prompt (can be customized by parent component)
    const reason = prompt('Please provide a reason for rejection:');
    if (reason && onReject) {
      await onReject({
        submissionId,
        resumeToken,
        actor: reviewer,
        reason,
      });
    }
  };

  // Handle request changes action
  const handleRequestChanges = async () => {
    // In a real implementation, this would show a dialog to collect field comments
    // For now, we'll use a simple prompt (can be customized by parent component)
    const comment = prompt('Please provide feedback for the changes needed:');
    if (comment && onRequestChanges) {
      await onRequestChanges({
        submissionId,
        resumeToken,
        actor: reviewer,
        fieldComments: [],
        comment,
      });
    }
  };

  // Build CSS class list
  const cssClasses = [
    'formbridge-approval-actions',
    `formbridge-approval-actions--${layout}`,
    `formbridge-approval-actions--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const isDisabled = disabled || loading;

  return (
    <div
      className={cssClasses}
      data-submission-id={submissionId}
      data-reviewer-id={reviewer.id}
      role="group"
      aria-label="Approval actions"
    >
      {/* Approve Button */}
      <button
        type="button"
        onClick={handleApprove}
        disabled={isDisabled}
        className="formbridge-approval-actions__button formbridge-approval-actions__button--approve"
        data-action="approve"
        aria-label="Approve submission"
      >
        {loading ? 'Processing...' : 'Approve'}
      </button>

      {/* Reject Button */}
      <button
        type="button"
        onClick={handleReject}
        disabled={isDisabled}
        className="formbridge-approval-actions__button formbridge-approval-actions__button--reject"
        data-action="reject"
        aria-label="Reject submission"
      >
        {loading ? 'Processing...' : 'Reject'}
      </button>

      {/* Request Changes Button */}
      <button
        type="button"
        onClick={handleRequestChanges}
        disabled={isDisabled}
        className="formbridge-approval-actions__button formbridge-approval-actions__button--request-changes"
        data-action="request_changes"
        aria-label="Request changes to submission"
      >
        {loading ? 'Processing...' : 'Request Changes'}
      </button>
    </div>
  );
};

ApprovalActions.displayName = 'ApprovalActions';
