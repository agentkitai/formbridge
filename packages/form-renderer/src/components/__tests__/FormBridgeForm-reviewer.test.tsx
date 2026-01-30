/**
 * Tests for FormBridgeForm reviewer mode functionality
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FormBridgeForm } from '../FormBridgeForm';
import type { FormBridgeFormProps, FormSchema } from '../FormBridgeForm';
import type { ReviewSubmission } from '../ReviewerView';
import type { Actor, FieldAttribution } from '../../types';

describe('FormBridgeForm - Reviewer Mode', () => {
  const agentActor: Actor = {
    kind: 'agent',
    id: 'agent_123',
    name: 'AutoVendor',
  };

  const reviewerActor: Actor = {
    kind: 'human',
    id: 'reviewer_789',
    name: 'Jane Reviewer',
  };

  const basicSchema: FormSchema = {
    type: 'object',
    title: 'Vendor Onboarding',
    description: 'Complete the vendor information',
    properties: {
      vendorName: {
        type: 'string',
        title: 'Vendor Name',
      },
      taxId: {
        type: 'string',
        title: 'Tax ID',
      },
    },
    required: ['vendorName'],
  };

  const defaultFields = {
    vendorName: 'Acme Corp',
    taxId: '12-3456789',
  };

  const defaultFieldAttribution: FieldAttribution = {
    vendorName: agentActor,
    taxId: agentActor,
  };

  const mockSubmissionInReview: ReviewSubmission = {
    id: 'sub_123',
    intakeId: 'intake_456',
    state: 'needs_review',
    resumeToken: 'rtok_abc',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:35:00Z',
    fields: defaultFields,
    fieldAttribution: defaultFieldAttribution,
    createdBy: agentActor,
    updatedBy: agentActor,
  };

  const mockSubmissionApproved: ReviewSubmission = {
    ...mockSubmissionInReview,
    state: 'approved',
  };

  describe('when submission is in needs_review state', () => {
    it('should render ReviewerView instead of regular form', () => {
      const props: FormBridgeFormProps = {
        schema: basicSchema,
        fields: defaultFields,
        fieldAttribution: defaultFieldAttribution,
        currentActor: reviewerActor,
        submission: mockSubmissionInReview,
      };

      render(<FormBridgeForm {...props} />);

      // Should show reviewer view components
      expect(screen.getByText('Review Submission')).toBeInTheDocument();
      expect(screen.getByText('Submission ID:')).toBeInTheDocument();
      expect(screen.getByText('sub_123')).toBeInTheDocument();
    });

    it('should pass approval actions to ReviewerView', () => {
      const approvalActions = <div data-testid="approval-actions">Approval Buttons</div>;

      const props: FormBridgeFormProps = {
        schema: basicSchema,
        fields: defaultFields,
        fieldAttribution: defaultFieldAttribution,
        currentActor: reviewerActor,
        submission: mockSubmissionInReview,
        approvalActions,
      };

      render(<FormBridgeForm {...props} />);

      // Should render approval actions
      expect(screen.getByTestId('approval-actions')).toBeInTheDocument();
      expect(screen.getByText('Approval Buttons')).toBeInTheDocument();
    });

    it('should pass className to ReviewerView', () => {
      const props: FormBridgeFormProps = {
        schema: basicSchema,
        fields: defaultFields,
        fieldAttribution: defaultFieldAttribution,
        currentActor: reviewerActor,
        submission: mockSubmissionInReview,
        className: 'custom-review-class',
      };

      const { container } = render(<FormBridgeForm {...props} />);

      // Should have the custom class on the reviewer view
      const reviewerView = container.querySelector('.formbridge-reviewer-view');
      expect(reviewerView).toHaveClass('custom-review-class');
    });
  });

  describe('when submission is NOT in needs_review state', () => {
    it('should render regular form when submission state is approved', () => {
      const props: FormBridgeFormProps = {
        schema: basicSchema,
        fields: defaultFields,
        fieldAttribution: defaultFieldAttribution,
        currentActor: reviewerActor,
        submission: mockSubmissionApproved,
      };

      render(<FormBridgeForm {...props} />);

      // Should show regular form, not reviewer view
      expect(screen.queryByText('Review Submission')).not.toBeInTheDocument();
      expect(screen.getByText('Vendor Onboarding')).toBeInTheDocument();
    });

    it('should render regular form when no submission is provided', () => {
      const props: FormBridgeFormProps = {
        schema: basicSchema,
        fields: defaultFields,
        fieldAttribution: defaultFieldAttribution,
        currentActor: reviewerActor,
      };

      render(<FormBridgeForm {...props} />);

      // Should show regular form
      expect(screen.queryByText('Review Submission')).not.toBeInTheDocument();
      expect(screen.getByText('Vendor Onboarding')).toBeInTheDocument();
    });
  });
});
