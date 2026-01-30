/**
 * Tests for FieldWrapper component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FieldWrapper } from './FieldWrapper';
import type { FieldComment } from './ApprovalActions';

describe('FieldWrapper', () => {
  it('renders with label and input', () => {
    render(
      <FieldWrapper fieldPath="email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('generates correct field ID from fieldPath', () => {
    const { container } = render(
      <FieldWrapper fieldPath="user-email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    // The wrapper div gets the field ID
    const wrapper = container.querySelector('#field-user-email');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass('formbridge-field-wrapper__input');
  });

  it('displays required indicator when required=true', () => {
    render(
      <FieldWrapper fieldPath="email" label="Email" required={true}>
        <input type="text" />
      </FieldWrapper>
    );

    const requiredIndicator = screen.getByLabelText('required');
    expect(requiredIndicator).toBeInTheDocument();
    expect(requiredIndicator).toHaveTextContent('*');
  });

  it('does not display required indicator when required=false', () => {
    render(
      <FieldWrapper fieldPath="email" label="Email" required={false}>
        <input type="text" />
      </FieldWrapper>
    );

    expect(screen.queryByLabelText('required')).not.toBeInTheDocument();
  });

  it('displays helper text when provided', () => {
    render(
      <FieldWrapper
        fieldPath="email"
        label="Email"
        helperText="Enter your email address"
      >
        <input type="text" />
      </FieldWrapper>
    );

    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
  });

  it('displays error message when provided', () => {
    render(
      <FieldWrapper fieldPath="email" label="Email" error="Email is required">
        <input type="text" />
      </FieldWrapper>
    );

    const errorMessage = screen.getByText('Email is required');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveAttribute('role', 'alert');
  });

  it('applies custom className', () => {
    const { container } = render(
      <FieldWrapper fieldPath="email" label="Email" className="custom-class">
        <input type="text" />
      </FieldWrapper>
    );

    const fieldWrapper = container.querySelector('.formbridge-field-wrapper');
    expect(fieldWrapper).toHaveClass('custom-class');
  });

  it('applies default formbridge-field-wrapper class', () => {
    const { container } = render(
      <FieldWrapper fieldPath="email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    const fieldWrapper = container.querySelector('.formbridge-field-wrapper');
    expect(fieldWrapper).toBeInTheDocument();
  });

  it('sets data-field-path attribute', () => {
    const { container } = render(
      <FieldWrapper fieldPath="user.email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    const fieldWrapper = container.querySelector('.formbridge-field-wrapper');
    expect(fieldWrapper).toHaveAttribute('data-field-path', 'user.email');
  });

  it('displays field attribution when provided', () => {
    render(
      <FieldWrapper
        fieldPath="vendorName"
        label="Vendor Name"
        fieldAttribution={{ kind: 'agent', id: 'agent_123', name: 'AutoVendor' }}
      >
        <input type="text" />
      </FieldWrapper>
    );

    expect(screen.getByText(/Filled by agent/)).toBeInTheDocument();
    expect(screen.getByText(/AutoVendor/)).toBeInTheDocument();
  });

  describe('Field Comments', () => {
    it('displays existing field comment in display mode', () => {
      const fieldComment: FieldComment = {
        fieldPath: 'email',
        comment: 'Please use a company email address',
      };

      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          fieldComment={fieldComment}
          reviewMode={false}
        >
          <input type="text" />
        </FieldWrapper>
      );

      expect(screen.getByText('Reviewer Comment:')).toBeInTheDocument();
      expect(screen.getByText('Please use a company email address')).toBeInTheDocument();
    });

    it('displays suggested value when provided in field comment', () => {
      const fieldComment: FieldComment = {
        fieldPath: 'email',
        comment: 'Use your work email',
        suggestedValue: 'user@company.com',
      };

      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          fieldComment={fieldComment}
          reviewMode={false}
        >
          <input type="text" />
        </FieldWrapper>
      );

      expect(screen.getByText('Suggested value:')).toBeInTheDocument();
      expect(screen.getByText('user@company.com')).toBeInTheDocument();
    });

    it('displays comment input in review mode', () => {
      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          reviewMode={true}
        >
          <input type="text" />
        </FieldWrapper>
      );

      expect(screen.getByLabelText('Reviewer Comment (optional):')).toBeInTheDocument();
      const textarea = screen.getByPlaceholderText('Add a comment about what needs to change...');
      expect(textarea).toBeInTheDocument();
    });

    it('calls onCommentChange when comment is entered', () => {
      const handleCommentChange = vi.fn();

      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          reviewMode={true}
          onCommentChange={handleCommentChange}
        >
          <input type="text" />
        </FieldWrapper>
      );

      const textarea = screen.getByRole('textbox', { name: /Add comment for Email/i });
      fireEvent.change(textarea, { target: { value: 'This field needs revision' } });

      expect(handleCommentChange).toHaveBeenCalledWith('email', 'This field needs revision');
    });

    it('pre-fills comment input with existing comment in review mode', () => {
      const fieldComment: FieldComment = {
        fieldPath: 'email',
        comment: 'Existing comment',
      };

      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          fieldComment={fieldComment}
          reviewMode={true}
        >
          <input type="text" />
        </FieldWrapper>
      );

      const textarea = screen.getByRole('textbox', { name: /Add comment for Email/i });
      expect(textarea).toHaveValue('Existing comment');
    });

    it('does not show comment input when reviewMode is false', () => {
      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          reviewMode={false}
        >
          <input type="text" />
        </FieldWrapper>
      );

      expect(screen.queryByLabelText('Reviewer Comment (optional):')).not.toBeInTheDocument();
    });

    it('uses custom placeholder when provided', () => {
      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          reviewMode={true}
          commentPlaceholder="Custom placeholder text"
        >
          <input type="text" />
        </FieldWrapper>
      );

      expect(screen.getByPlaceholderText('Custom placeholder text')).toBeInTheDocument();
    });

    it('does not display comment when fieldComment is provided but reviewMode is true', () => {
      const fieldComment: FieldComment = {
        fieldPath: 'email',
        comment: 'Previous comment',
      };

      render(
        <FieldWrapper
          fieldPath="email"
          label="Email"
          fieldComment={fieldComment}
          reviewMode={true}
        >
          <input type="text" />
        </FieldWrapper>
      );

      // In review mode, we show the comment input, not the display
      expect(screen.queryByText('Reviewer Comment:')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Reviewer Comment (optional):')).toBeInTheDocument();
    });

    it('handles suggested value that is not a string', () => {
      const fieldComment: FieldComment = {
        fieldPath: 'count',
        comment: 'Update the count',
        suggestedValue: 42,
      };

      render(
        <FieldWrapper
          fieldPath="count"
          label="Count"
          fieldComment={fieldComment}
          reviewMode={false}
        >
          <input type="number" />
        </FieldWrapper>
      );

      expect(screen.getByText('Suggested value:')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });
});
