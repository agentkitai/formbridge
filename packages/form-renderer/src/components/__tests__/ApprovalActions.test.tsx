/**
 * Tests for ApprovalActions component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { ApprovalActions } from '../ApprovalActions';
import type { Actor } from '../../types';

describe('ApprovalActions', () => {
  const reviewer: Actor = {
    kind: 'human',
    id: 'reviewer-123',
    name: 'Jane Doe',
  };

  const defaultProps = {
    submissionId: 'sub-456',
    resumeToken: 'rtok-789',
    reviewer,
  };

  // Mock window.prompt
  beforeEach(() => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render all three action buttons', () => {
      render(<ApprovalActions {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Approve submission' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject submission' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Request changes to submission' })).toBeInTheDocument();
    });

    it('should render with default props', () => {
      render(<ApprovalActions {...defaultProps} />);

      const container = screen.getByRole('group', { name: 'Approval actions' });
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('formbridge-approval-actions');
    });

    it('should display correct button text', () => {
      render(<ApprovalActions {...defaultProps} />);

      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
      expect(screen.getByText('Request Changes')).toBeInTheDocument();
    });
  });

  describe('approve action', () => {
    it('should call onApprove when approve button is clicked', async () => {
      const onApprove = vi.fn();

      render(<ApprovalActions {...defaultProps} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(onApprove).toHaveBeenCalledWith({
          submissionId: 'sub-456',
          resumeToken: 'rtok-789',
          actor: reviewer,
        });
      });
    });

    it('should handle async onApprove callback', async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalActions {...defaultProps} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(onApprove).toHaveBeenCalled();
      });
    });

    it('should not call onApprove when button is disabled', () => {
      const onApprove = vi.fn();

      render(<ApprovalActions {...defaultProps} onApprove={onApprove} disabled />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      expect(approveButton).toBeDisabled();

      fireEvent.click(approveButton);
      expect(onApprove).not.toHaveBeenCalled();
    });

    it('should not throw error when onApprove is not provided', () => {
      render(<ApprovalActions {...defaultProps} />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      expect(() => fireEvent.click(approveButton)).not.toThrow();
    });
  });

  describe('reject action', () => {
    it('should call onReject with reason when reject button is clicked', async () => {
      const onReject = vi.fn();
      (window.prompt as any).mockReturnValue('Invalid information');

      render(<ApprovalActions {...defaultProps} onReject={onReject} />);

      const rejectButton = screen.getByRole('button', { name: 'Reject submission' });
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(onReject).toHaveBeenCalledWith({
          submissionId: 'sub-456',
          resumeToken: 'rtok-789',
          actor: reviewer,
          reason: 'Invalid information',
        });
      });
    });

    it('should not call onReject when prompt is cancelled', async () => {
      const onReject = vi.fn();
      (window.prompt as any).mockReturnValue(null);

      render(<ApprovalActions {...defaultProps} onReject={onReject} />);

      const rejectButton = screen.getByRole('button', { name: 'Reject submission' });
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(onReject).not.toHaveBeenCalled();
      });
    });

    it('should not call onReject when reason is empty', async () => {
      const onReject = vi.fn();
      (window.prompt as any).mockReturnValue('');

      render(<ApprovalActions {...defaultProps} onReject={onReject} />);

      const rejectButton = screen.getByRole('button', { name: 'Reject submission' });
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(onReject).not.toHaveBeenCalled();
      });
    });

    it('should not call onReject when button is disabled', () => {
      const onReject = vi.fn();
      (window.prompt as any).mockReturnValue('Test reason');

      render(<ApprovalActions {...defaultProps} onReject={onReject} disabled />);

      const rejectButton = screen.getByRole('button', { name: 'Reject submission' });
      expect(rejectButton).toBeDisabled();

      fireEvent.click(rejectButton);
      expect(onReject).not.toHaveBeenCalled();
    });
  });

  describe('request changes action', () => {
    it('should call onRequestChanges when request changes button is clicked', async () => {
      const onRequestChanges = vi.fn();
      (window.prompt as any).mockReturnValue('Please update the vendor name');

      render(<ApprovalActions {...defaultProps} onRequestChanges={onRequestChanges} />);

      const requestChangesButton = screen.getByRole('button', { name: 'Request changes to submission' });
      fireEvent.click(requestChangesButton);

      await waitFor(() => {
        expect(onRequestChanges).toHaveBeenCalledWith({
          submissionId: 'sub-456',
          resumeToken: 'rtok-789',
          actor: reviewer,
          fieldComments: [],
          comment: 'Please update the vendor name',
        });
      });
    });

    it('should not call onRequestChanges when prompt is cancelled', async () => {
      const onRequestChanges = vi.fn();
      (window.prompt as any).mockReturnValue(null);

      render(<ApprovalActions {...defaultProps} onRequestChanges={onRequestChanges} />);

      const requestChangesButton = screen.getByRole('button', { name: 'Request changes to submission' });
      fireEvent.click(requestChangesButton);

      await waitFor(() => {
        expect(onRequestChanges).not.toHaveBeenCalled();
      });
    });

    it('should not call onRequestChanges when button is disabled', () => {
      const onRequestChanges = vi.fn();
      (window.prompt as any).mockReturnValue('Test feedback');

      render(<ApprovalActions {...defaultProps} onRequestChanges={onRequestChanges} disabled />);

      const requestChangesButton = screen.getByRole('button', { name: 'Request changes to submission' });
      expect(requestChangesButton).toBeDisabled();

      fireEvent.click(requestChangesButton);
      expect(onRequestChanges).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should disable all buttons when loading', () => {
      render(<ApprovalActions {...defaultProps} loading />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      const rejectButton = screen.getByRole('button', { name: 'Reject submission' });
      const requestChangesButton = screen.getByRole('button', { name: 'Request changes to submission' });

      expect(approveButton).toBeDisabled();
      expect(rejectButton).toBeDisabled();
      expect(requestChangesButton).toBeDisabled();
    });

    it('should show "Processing..." text when loading', () => {
      render(<ApprovalActions {...defaultProps} loading />);

      const buttons = screen.getAllByText('Processing...');
      expect(buttons).toHaveLength(3);
    });

    it('should not call callbacks when loading', () => {
      const onApprove = vi.fn();
      const onReject = vi.fn();
      const onRequestChanges = vi.fn();

      render(
        <ApprovalActions
          {...defaultProps}
          loading
          onApprove={onApprove}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
        />
      );

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      fireEvent.click(approveButton);

      expect(onApprove).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should disable all buttons when disabled prop is true', () => {
      render(<ApprovalActions {...defaultProps} disabled />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      const rejectButton = screen.getByRole('button', { name: 'Reject submission' });
      const requestChangesButton = screen.getByRole('button', { name: 'Request changes to submission' });

      expect(approveButton).toBeDisabled();
      expect(rejectButton).toBeDisabled();
      expect(requestChangesButton).toBeDisabled();
    });
  });

  describe('CSS classes', () => {
    it('should have base formbridge-approval-actions class', () => {
      render(<ApprovalActions {...defaultProps} />);

      const container = screen.getByRole('group');
      expect(container).toHaveClass('formbridge-approval-actions');
    });

    it('should apply horizontal layout class by default', () => {
      render(<ApprovalActions {...defaultProps} />);

      const container = screen.getByRole('group');
      expect(container).toHaveClass('formbridge-approval-actions--horizontal');
    });

    it('should apply vertical layout class', () => {
      render(<ApprovalActions {...defaultProps} layout="vertical" />);

      const container = screen.getByRole('group');
      expect(container).toHaveClass('formbridge-approval-actions--vertical');
    });

    it('should apply medium size class by default', () => {
      render(<ApprovalActions {...defaultProps} />);

      const container = screen.getByRole('group');
      expect(container).toHaveClass('formbridge-approval-actions--medium');
    });

    it('should apply small size class', () => {
      render(<ApprovalActions {...defaultProps} size="small" />);

      const container = screen.getByRole('group');
      expect(container).toHaveClass('formbridge-approval-actions--small');
    });

    it('should apply large size class', () => {
      render(<ApprovalActions {...defaultProps} size="large" />);

      const container = screen.getByRole('group');
      expect(container).toHaveClass('formbridge-approval-actions--large');
    });

    it('should apply custom className', () => {
      render(<ApprovalActions {...defaultProps} className="custom-class" />);

      const container = screen.getByRole('group');
      expect(container).toHaveClass('custom-class');
    });

    it('should have action-specific button classes', () => {
      const { container } = render(<ApprovalActions {...defaultProps} />);

      const approveButton = container.querySelector('[data-action="approve"]');
      const rejectButton = container.querySelector('[data-action="reject"]');
      const requestChangesButton = container.querySelector('[data-action="request_changes"]');

      expect(approveButton).toHaveClass('formbridge-approval-actions__button--approve');
      expect(rejectButton).toHaveClass('formbridge-approval-actions__button--reject');
      expect(requestChangesButton).toHaveClass('formbridge-approval-actions__button--request-changes');
    });
  });

  describe('data attributes', () => {
    it('should set data-submission-id attribute', () => {
      render(<ApprovalActions {...defaultProps} />);

      const container = screen.getByRole('group');
      expect(container).toHaveAttribute('data-submission-id', 'sub-456');
    });

    it('should set data-reviewer-id attribute', () => {
      render(<ApprovalActions {...defaultProps} />);

      const container = screen.getByRole('group');
      expect(container).toHaveAttribute('data-reviewer-id', 'reviewer-123');
    });

    it('should set data-action attributes on buttons', () => {
      const { container } = render(<ApprovalActions {...defaultProps} />);

      expect(container.querySelector('[data-action="approve"]')).toBeInTheDocument();
      expect(container.querySelector('[data-action="reject"]')).toBeInTheDocument();
      expect(container.querySelector('[data-action="request_changes"]')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have role="group" with aria-label', () => {
      render(<ApprovalActions {...defaultProps} />);

      const container = screen.getByRole('group', { name: 'Approval actions' });
      expect(container).toBeInTheDocument();
    });

    it('should have descriptive aria-labels on buttons', () => {
      render(<ApprovalActions {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Approve submission' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject submission' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Request changes to submission' })).toBeInTheDocument();
    });

    it('should be keyboard accessible', () => {
      const onApprove = vi.fn();

      render(<ApprovalActions {...defaultProps} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      approveButton.focus();
      expect(document.activeElement).toBe(approveButton);
    });
  });

  describe('edge cases', () => {
    it('should handle reviewer without name', () => {
      const reviewerWithoutName: Actor = {
        kind: 'human',
        id: 'reviewer-999',
      };

      render(<ApprovalActions {...defaultProps} reviewer={reviewerWithoutName} />);

      const container = screen.getByRole('group');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-reviewer-id', 'reviewer-999');
    });

    it('should handle agent reviewer', () => {
      const agentReviewer: Actor = {
        kind: 'agent',
        id: 'agent-123',
        name: 'ReviewBot',
      };

      render(<ApprovalActions {...defaultProps} reviewer={agentReviewer} />);

      const container = screen.getByRole('group');
      expect(container).toHaveAttribute('data-reviewer-id', 'agent-123');
    });

    it('should handle system reviewer', () => {
      const systemReviewer: Actor = {
        kind: 'system',
        id: 'sys-001',
      };

      render(<ApprovalActions {...defaultProps} reviewer={systemReviewer} />);

      const container = screen.getByRole('group');
      expect(container).toHaveAttribute('data-reviewer-id', 'sys-001');
    });

    it('should handle reviewer with metadata', () => {
      const reviewerWithMetadata: Actor = {
        kind: 'human',
        id: 'reviewer-123',
        name: 'Jane Doe',
        metadata: { department: 'Compliance', level: 'senior' },
      };

      render(<ApprovalActions {...defaultProps} reviewer={reviewerWithMetadata} />);

      const container = screen.getByRole('group');
      expect(container).toBeInTheDocument();
    });

    it('should handle multiple rapid clicks gracefully', async () => {
      const onApprove = vi.fn();

      render(<ApprovalActions {...defaultProps} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });

      // Click multiple times rapidly
      fireEvent.click(approveButton);
      fireEvent.click(approveButton);
      fireEvent.click(approveButton);

      // Should be called 3 times (no debouncing in this basic implementation)
      await waitFor(() => {
        expect(onApprove).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('button types', () => {
    it('should have type="button" to prevent form submission', () => {
      render(<ApprovalActions {...defaultProps} />);

      const approveButton = screen.getByRole('button', { name: 'Approve submission' });
      const rejectButton = screen.getByRole('button', { name: 'Reject submission' });
      const requestChangesButton = screen.getByRole('button', { name: 'Request changes to submission' });

      expect(approveButton).toHaveAttribute('type', 'button');
      expect(rejectButton).toHaveAttribute('type', 'button');
      expect(requestChangesButton).toHaveAttribute('type', 'button');
    });
  });
});
