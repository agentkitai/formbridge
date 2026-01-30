/**
 * Tests for ReviewerView component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { ReviewerView } from '../ReviewerView';
import type { ReviewerViewProps, ReviewSubmission } from '../ReviewerView';
import type { FormSchema } from '../FormBridgeForm';
import type { Actor } from '../../types';

describe('ReviewerView', () => {
  // Test data
  const agentActor: Actor = {
    kind: 'agent',
    id: 'agent_123',
    name: 'AutoVendor',
  };

  const humanActor: Actor = {
    kind: 'human',
    id: 'user_456',
    name: 'John Doe',
  };

  const reviewerActor: Actor = {
    kind: 'human',
    id: 'reviewer_789',
    name: 'Jane Smith',
  };

  const basicSchema: FormSchema = {
    type: 'object',
    title: 'Vendor Onboarding',
    description: 'Complete the vendor information',
    properties: {
      vendorName: {
        type: 'string',
        title: 'Vendor Name',
        description: 'Legal name of the vendor',
      },
      taxId: {
        type: 'string',
        title: 'Tax ID',
        description: 'Federal tax identification number',
      },
      email: {
        type: 'string',
        title: 'Email',
        format: 'email',
      },
    },
    required: ['vendorName', 'taxId'],
  };

  const mockSubmission: ReviewSubmission = {
    id: 'sub_123',
    intakeId: 'intake_456',
    state: 'needs_review',
    resumeToken: 'rtok_abc',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:35:00Z',
    expiresAt: '2024-01-16T10:30:00Z',
    fields: {
      vendorName: 'Acme Corp',
      taxId: '12-3456789',
      email: 'contact@acme.com',
    },
    fieldAttribution: {
      vendorName: agentActor,
      taxId: agentActor,
      email: humanActor,
    },
    createdBy: agentActor,
    updatedBy: humanActor,
  };

  const defaultProps: ReviewerViewProps = {
    submission: mockSubmission,
    schema: basicSchema,
    reviewer: reviewerActor,
  };

  describe('Rendering', () => {
    it('should render reviewer view with title', () => {
      render(<ReviewerView {...defaultProps} />);

      expect(screen.getByText('Review Submission')).toBeInTheDocument();
    });

    it('should render submission metadata', () => {
      render(<ReviewerView {...defaultProps} />);

      expect(screen.getByText('Submission ID:')).toBeInTheDocument();
      expect(screen.getByText('sub_123')).toBeInTheDocument();
      expect(screen.getByText('State:')).toBeInTheDocument();
      expect(screen.getByText('needs_review')).toBeInTheDocument();
    });

    it('should render created by actor badge', () => {
      render(<ReviewerView {...defaultProps} />);

      expect(screen.getByText('Created By:')).toBeInTheDocument();
      // Check for the actor badge role (ActorBadge has role="status")
      const actorBadge = screen.getByRole('status');
      expect(actorBadge).toHaveTextContent('agent');
      expect(actorBadge).toHaveTextContent('(AutoVendor)');
    });

    it('should render timestamps', () => {
      render(<ReviewerView {...defaultProps} />);

      expect(screen.getByText('Created At:')).toBeInTheDocument();
      expect(screen.getByText('Expires At:')).toBeInTheDocument();
    });

    it('should not render expires at if not provided', () => {
      const submissionWithoutExpiry = {
        ...mockSubmission,
        expiresAt: undefined,
      };

      render(
        <ReviewerView
          {...defaultProps}
          submission={submissionWithoutExpiry}
        />
      );

      expect(screen.queryByText('Expires At:')).not.toBeInTheDocument();
    });

    it('should render form fields in read-only mode', () => {
      const { container } = render(<ReviewerView {...defaultProps} />);

      // Check that inputs exist and are disabled
      const inputs = container.querySelectorAll('input');
      expect(inputs.length).toBeGreaterThan(0);
      inputs.forEach(input => {
        expect(input).toBeDisabled();
      });
    });

    it('should display field values', () => {
      const { container } = render(<ReviewerView {...defaultProps} />);

      const vendorNameInput = container.querySelector('input[name="vendorName"]') as HTMLInputElement;
      const taxIdInput = container.querySelector('input[name="taxId"]') as HTMLInputElement;
      const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement;

      expect(vendorNameInput?.value).toBe('Acme Corp');
      expect(taxIdInput?.value).toBe('12-3456789');
      expect(emailInput?.value).toBe('contact@acme.com');
    });

    it('should render with custom className', () => {
      const { container } = render(
        <ReviewerView {...defaultProps} className="custom-reviewer" />
      );

      const reviewerView = container.querySelector('.formbridge-reviewer-view');
      expect(reviewerView).toHaveClass('formbridge-reviewer-view');
      expect(reviewerView).toHaveClass('custom-reviewer');
    });
  });

  describe('Field Attribution', () => {
    it('should show attribution badges for agent-filled fields', () => {
      render(<ReviewerView {...defaultProps} />);

      // Should have attribution for vendorName and taxId (both filled by agent)
      const attributionBadges = screen.getAllByText(/Filled by agent/i);
      // We have 2 fields filled by agent (vendorName and taxId)
      expect(attributionBadges.length).toBe(2);
    });

    it('should show attribution badges for human-filled fields', () => {
      render(<ReviewerView {...defaultProps} />);

      // Email was filled by human - should appear once
      const humanBadges = screen.getAllByText(/Filled by human/i);
      expect(humanBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle submissions with no field attribution', () => {
      const submissionWithoutAttribution: ReviewSubmission = {
        ...mockSubmission,
        fieldAttribution: {},
      };

      render(
        <ReviewerView
          {...defaultProps}
          submission={submissionWithoutAttribution}
        />
      );

      // Should still render the form
      expect(screen.getByText('Vendor Onboarding')).toBeInTheDocument();
    });
  });

  describe('Approval Actions', () => {
    it('should render approval actions when provided', () => {
      const approvalActions = (
        <div data-testid="approval-actions">
          <button>Approve</button>
          <button>Reject</button>
        </div>
      );

      render(
        <ReviewerView
          {...defaultProps}
          approvalActions={approvalActions}
        />
      );

      expect(screen.getByTestId('approval-actions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    });

    it('should not render approval actions section when not provided', () => {
      const { container } = render(<ReviewerView {...defaultProps} />);

      const actionsSection = container.querySelector('.formbridge-reviewer-view__actions');
      expect(actionsSection).not.toBeInTheDocument();
    });
  });

  describe('Metadata Click Handler', () => {
    it('should render debug button when onMetadataClick is provided', () => {
      const onMetadataClick = vi.fn();

      render(
        <ReviewerView
          {...defaultProps}
          onMetadataClick={onMetadataClick}
        />
      );

      expect(screen.getByRole('button', { name: 'View Full Submission Details' })).toBeInTheDocument();
    });

    it('should call onMetadataClick when debug button is clicked', () => {
      const onMetadataClick = vi.fn();

      render(
        <ReviewerView
          {...defaultProps}
          onMetadataClick={onMetadataClick}
        />
      );

      const debugButton = screen.getByRole('button', { name: 'View Full Submission Details' });
      fireEvent.click(debugButton);

      expect(onMetadataClick).toHaveBeenCalledWith(mockSubmission);
    });

    it('should not render debug button when onMetadataClick is not provided', () => {
      render(<ReviewerView {...defaultProps} />);

      expect(screen.queryByRole('button', { name: 'View Full Submission Details' })).not.toBeInTheDocument();
    });
  });

  describe('Different Submission States', () => {
    it('should render submission in needs_review state', () => {
      render(<ReviewerView {...defaultProps} />);

      const stateElement = screen.getByText('needs_review');
      expect(stateElement).toHaveClass('formbridge-reviewer-view__state');
      expect(stateElement).toHaveClass('formbridge-reviewer-view__state--needs_review');
    });

    it('should apply correct CSS class for approved state', () => {
      const approvedSubmission: ReviewSubmission = {
        ...mockSubmission,
        state: 'approved',
      };

      render(
        <ReviewerView
          {...defaultProps}
          submission={approvedSubmission}
        />
      );

      const stateElement = screen.getByText('approved');
      expect(stateElement).toHaveClass('formbridge-reviewer-view__state--approved');
    });

    it('should apply correct CSS class for rejected state', () => {
      const rejectedSubmission: ReviewSubmission = {
        ...mockSubmission,
        state: 'rejected',
      };

      render(
        <ReviewerView
          {...defaultProps}
          submission={rejectedSubmission}
        />
      );

      const stateElement = screen.getByText('rejected');
      expect(stateElement).toHaveClass('formbridge-reviewer-view__state--rejected');
    });
  });

  describe('Edge Cases', () => {
    it('should handle submission with empty fields', () => {
      const submissionWithEmptyFields: ReviewSubmission = {
        ...mockSubmission,
        fields: {},
      };

      render(
        <ReviewerView
          {...defaultProps}
          submission={submissionWithEmptyFields}
        />
      );

      // Should render without crashing
      expect(screen.getByText('Review Submission')).toBeInTheDocument();
    });

    it('should handle schema with no properties', () => {
      const emptySchema: FormSchema = {
        type: 'object',
        properties: {},
      };

      render(
        <ReviewerView
          {...defaultProps}
          schema={emptySchema}
        />
      );

      // Should render without crashing
      expect(screen.getByText('Review Submission')).toBeInTheDocument();
    });

    it('should handle missing actor names gracefully', () => {
      const actorWithoutName: Actor = {
        kind: 'agent',
        id: 'agent_999',
      };

      const submissionWithoutActorNames: ReviewSubmission = {
        ...mockSubmission,
        createdBy: actorWithoutName,
      };

      render(
        <ReviewerView
          {...defaultProps}
          submission={submissionWithoutActorNames}
        />
      );

      // Should still render the actor kind
      const actorBadge = screen.getByRole('status');
      expect(actorBadge).toHaveTextContent('agent');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(<ReviewerView {...defaultProps} />);

      const heading = screen.getByRole('heading', { name: 'Review Submission' });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H2');
    });

    it('should have accessible state badges', () => {
      render(<ReviewerView {...defaultProps} />);

      const actorBadge = screen.getByRole('status');
      expect(actorBadge).toBeInTheDocument();
    });
  });

  describe('Integration with FormBridgeForm', () => {
    it('should pass schema to FormBridgeForm', () => {
      render(<ReviewerView {...defaultProps} />);

      // Verify form title from schema is rendered
      expect(screen.getByText('Vendor Onboarding')).toBeInTheDocument();
    });

    it('should pass fields to FormBridgeForm', () => {
      const { container } = render(<ReviewerView {...defaultProps} />);

      // Verify all field values are displayed
      const vendorNameInput = container.querySelector('input[name="vendorName"]') as HTMLInputElement;
      expect(vendorNameInput?.value).toBe('Acme Corp');
    });

    it('should pass fieldAttribution to FormBridgeForm', () => {
      render(<ReviewerView {...defaultProps} />);

      // Verify attribution badges are rendered
      const agentBadges = screen.getAllByText(/Filled by agent/i);
      const humanBadges = screen.getAllByText(/Filled by human/i);
      expect(agentBadges.length).toBeGreaterThan(0);
      expect(humanBadges.length).toBeGreaterThan(0);
    });

    it('should set readOnly prop on FormBridgeForm', () => {
      const { container } = render(<ReviewerView {...defaultProps} />);

      // Verify all inputs are disabled (read-only)
      const inputs = container.querySelectorAll('input');
      inputs.forEach(input => {
        expect(input).toBeDisabled();
      });
    });
  });
});
