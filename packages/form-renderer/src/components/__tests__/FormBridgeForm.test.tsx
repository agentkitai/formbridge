/**
 * Tests for FormBridgeForm component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FormBridgeForm } from '../FormBridgeForm';
import type { FormBridgeFormProps, FormSchema } from '../FormBridgeForm';
import type { Actor, FieldAttribution } from '../../types';

describe('FormBridgeForm', () => {
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

  const defaultFields = {
    vendorName: 'Acme Corp',
    taxId: '',
    email: '',
  };

  const defaultFieldAttribution: FieldAttribution = {
    vendorName: agentActor,
  };

  const defaultProps: FormBridgeFormProps = {
    schema: basicSchema,
    fields: defaultFields,
    fieldAttribution: defaultFieldAttribution,
    currentActor: humanActor,
  };

  describe('Rendering', () => {
    it('should render form with title and description', () => {
      render(<FormBridgeForm {...defaultProps} />);

      expect(screen.getByText('Vendor Onboarding')).toBeInTheDocument();
      expect(screen.getByText('Complete the vendor information')).toBeInTheDocument();
    });

    it('should render all fields from schema', () => {
      render(<FormBridgeForm {...defaultProps} />);

      expect(screen.getByLabelText(/Vendor Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Tax ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    });

    it('should render submit button by default', () => {
      render(<FormBridgeForm {...defaultProps} />);

      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    it('should not render submit button in read-only mode', () => {
      render(<FormBridgeForm {...defaultProps} readOnly />);

      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(
        <FormBridgeForm {...defaultProps} className="custom-form" />
      );

      const form = container.querySelector('form');
      expect(form).toHaveClass('formbridge-form');
      expect(form).toHaveClass('custom-form');
    });
  });

  describe('Field Attribution', () => {
    it('should pass fieldAttribution to FieldWrapper for agent-filled fields', () => {
      render(<FormBridgeForm {...defaultProps} />);

      // Check for the attribution badge on the agent-filled field
      expect(screen.getByText(/Filled by agent/i)).toBeInTheDocument();
    });

    it('should not show attribution for fields without attribution', () => {
      render(<FormBridgeForm {...defaultProps} />);

      // Tax ID and Email should not have attribution badges
      const attributionBadges = screen.getAllByText(/Filled by/i);
      expect(attributionBadges).toHaveLength(1); // Only vendorName
    });

    it('should pass correct attribution for multiple agent-filled fields', () => {
      const multipleAttribution: FieldAttribution = {
        vendorName: agentActor,
        email: agentActor,
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          fieldAttribution={multipleAttribution}
        />
      );

      const attributionBadges = screen.getAllByText(/Filled by agent/i);
      expect(attributionBadges).toHaveLength(2); // vendorName and email
    });
  });

  describe('Field Values', () => {
    it('should display pre-filled field values', () => {
      render(<FormBridgeForm {...defaultProps} />);

      const vendorNameInput = screen.getByLabelText(/Vendor Name/i) as HTMLInputElement;
      expect(vendorNameInput.value).toBe('Acme Corp');
    });

    it('should display empty fields correctly', () => {
      render(<FormBridgeForm {...defaultProps} />);

      const taxIdInput = screen.getByLabelText(/Tax ID/i) as HTMLInputElement;
      expect(taxIdInput.value).toBe('');
    });
  });

  describe('Field Types', () => {
    it('should render text input for string fields', () => {
      render(<FormBridgeForm {...defaultProps} />);

      const vendorNameInput = screen.getByLabelText(/Vendor Name/i);
      expect(vendorNameInput).toHaveAttribute('type', 'text');
    });

    it('should render email input for email format fields', () => {
      render(<FormBridgeForm {...defaultProps} />);

      const emailInput = screen.getByLabelText(/Email/i);
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('should render number input for number fields', () => {
      const schemaWithNumber: FormSchema = {
        type: 'object',
        properties: {
          amount: { type: 'number', title: 'Amount' },
        },
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={schemaWithNumber}
          fields={{ amount: 100 }}
        />
      );

      const amountInput = screen.getByLabelText(/Amount/i);
      expect(amountInput).toHaveAttribute('type', 'number');
    });

    it('should render select for enum fields', () => {
      const schemaWithEnum: FormSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            title: 'Status',
            enum: ['pending', 'approved', 'rejected'],
          },
        },
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={schemaWithEnum}
          fields={{ status: 'pending' }}
        />
      );

      const statusSelect = screen.getByLabelText(/Status/i);
      expect(statusSelect.tagName).toBe('SELECT');
      expect(screen.getByText('pending')).toBeInTheDocument();
      expect(screen.getByText('approved')).toBeInTheDocument();
      expect(screen.getByText('rejected')).toBeInTheDocument();
    });

    it('should render checkbox for boolean fields', () => {
      const schemaWithBoolean: FormSchema = {
        type: 'object',
        properties: {
          accepted: { type: 'boolean', title: 'Accept Terms' },
        },
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={schemaWithBoolean}
          fields={{ accepted: false }}
        />
      );

      const checkbox = screen.getByLabelText(/Accept Terms/i);
      expect(checkbox).toHaveAttribute('type', 'checkbox');
    });
  });

  describe('Required Fields', () => {
    it('should mark required fields with asterisk', () => {
      render(<FormBridgeForm {...defaultProps} />);

      // Required fields should have asterisk in label
      const vendorNameLabel = screen.getByText(/Vendor Name/i);
      expect(vendorNameLabel.parentElement).toHaveTextContent('*');
    });

    it('should set required attribute on required inputs', () => {
      render(<FormBridgeForm {...defaultProps} />);

      const vendorNameInput = screen.getByLabelText(/Vendor Name/i);
      expect(vendorNameInput).toBeRequired();

      const taxIdInput = screen.getByLabelText(/Tax ID/i);
      expect(taxIdInput).toBeRequired();
    });

    it('should not set required attribute on optional inputs', () => {
      render(<FormBridgeForm {...defaultProps} />);

      const emailInput = screen.getByLabelText(/Email/i);
      expect(emailInput).not.toBeRequired();
    });
  });

  describe('Field Interaction', () => {
    it('should call onFieldChange when field value changes', () => {
      const onFieldChange = jest.fn();

      render(
        <FormBridgeForm
          {...defaultProps}
          onFieldChange={onFieldChange}
        />
      );

      const taxIdInput = screen.getByLabelText(/Tax ID/i);
      fireEvent.change(taxIdInput, { target: { value: '12-3456789' } });

      expect(onFieldChange).toHaveBeenCalledWith(
        'taxId',
        '12-3456789',
        humanActor
      );
    });

    it('should update local state when field changes', () => {
      render(<FormBridgeForm {...defaultProps} />);

      const taxIdInput = screen.getByLabelText(/Tax ID/i) as HTMLInputElement;
      fireEvent.change(taxIdInput, { target: { value: '12-3456789' } });

      expect(taxIdInput.value).toBe('12-3456789');
    });

    it('should handle checkbox changes', () => {
      const schemaWithBoolean: FormSchema = {
        type: 'object',
        properties: {
          accepted: { type: 'boolean', title: 'Accept Terms' },
        },
      };

      const onFieldChange = jest.fn();

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={schemaWithBoolean}
          fields={{ accepted: false }}
          onFieldChange={onFieldChange}
        />
      );

      const checkbox = screen.getByLabelText(/Accept Terms/i);
      fireEvent.click(checkbox);

      expect(onFieldChange).toHaveBeenCalledWith(
        'accepted',
        true,
        humanActor
      );
    });

    it('should handle select changes', () => {
      const schemaWithEnum: FormSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            title: 'Status',
            enum: ['pending', 'approved', 'rejected'],
          },
        },
      };

      const onFieldChange = jest.fn();

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={schemaWithEnum}
          fields={{ status: 'pending' }}
          onFieldChange={onFieldChange}
        />
      );

      const statusSelect = screen.getByLabelText(/Status/i);
      fireEvent.change(statusSelect, { target: { value: 'approved' } });

      expect(onFieldChange).toHaveBeenCalledWith(
        'status',
        'approved',
        humanActor
      );
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit when form is submitted', () => {
      const onSubmit = jest.fn();

      render(
        <FormBridgeForm
          {...defaultProps}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      expect(onSubmit).toHaveBeenCalledWith(defaultFields);
    });

    it('should prevent default form submission', () => {
      const onSubmit = jest.fn();

      render(
        <FormBridgeForm
          {...defaultProps}
          onSubmit={onSubmit}
        />
      );

      const form = screen.getByRole('form');
      const event = new Event('submit', { bubbles: true, cancelable: true });
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

      form.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should submit with updated field values', async () => {
      const onSubmit = jest.fn();

      render(
        <FormBridgeForm
          {...defaultProps}
          onSubmit={onSubmit}
        />
      );

      // Change a field value
      const taxIdInput = screen.getByLabelText(/Tax ID/i);
      fireEvent.change(taxIdInput, { target: { value: '12-3456789' } });

      // Submit form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          ...defaultFields,
          taxId: '12-3456789',
        });
      });
    });
  });

  describe('Read-Only Mode', () => {
    it('should disable all inputs in read-only mode', () => {
      render(<FormBridgeForm {...defaultProps} readOnly />);

      const vendorNameInput = screen.getByLabelText(/Vendor Name/i);
      const taxIdInput = screen.getByLabelText(/Tax ID/i);
      const emailInput = screen.getByLabelText(/Email/i);

      expect(vendorNameInput).toBeDisabled();
      expect(taxIdInput).toBeDisabled();
      expect(emailInput).toBeDisabled();
    });

    it('should not call onFieldChange in read-only mode', () => {
      const onFieldChange = jest.fn();

      render(
        <FormBridgeForm
          {...defaultProps}
          readOnly
          onFieldChange={onFieldChange}
        />
      );

      const taxIdInput = screen.getByLabelText(/Tax ID/i);
      fireEvent.change(taxIdInput, { target: { value: '12-3456789' } });

      // onChange should not be called because input is disabled
      expect(onFieldChange).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display field-level errors', () => {
      const errors = {
        taxId: 'Invalid tax ID format',
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          errors={errors}
        />
      );

      expect(screen.getByText('Invalid tax ID format')).toBeInTheDocument();
    });

    it('should display multiple field errors', () => {
      const errors = {
        vendorName: 'Vendor name is required',
        taxId: 'Invalid tax ID format',
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          errors={errors}
        />
      );

      expect(screen.getByText('Vendor name is required')).toBeInTheDocument();
      expect(screen.getByText('Invalid tax ID format')).toBeInTheDocument();
    });
  });

  describe('Helper Text', () => {
    it('should display field descriptions as helper text', () => {
      render(<FormBridgeForm {...defaultProps} />);

      expect(screen.getByText('Legal name of the vendor')).toBeInTheDocument();
      expect(screen.getByText('Federal tax identification number')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form role', () => {
      const { container } = render(<FormBridgeForm {...defaultProps} />);

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('should have noValidate attribute to handle custom validation', () => {
      const { container } = render(<FormBridgeForm {...defaultProps} />);

      const form = container.querySelector('form');
      expect(form).toHaveAttribute('noValidate');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty schema gracefully', () => {
      const emptySchema: FormSchema = {
        type: 'object',
        properties: {},
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={emptySchema}
          fields={{}}
        />
      );

      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    it('should handle missing field values gracefully', () => {
      render(
        <FormBridgeForm
          {...defaultProps}
          fields={{}}
        />
      );

      const vendorNameInput = screen.getByLabelText(/Vendor Name/i) as HTMLInputElement;
      expect(vendorNameInput.value).toBe('');
    });

    it('should handle schema without title', () => {
      const schemaWithoutTitle: FormSchema = {
        type: 'object',
        properties: {
          field1: { type: 'string', title: 'Field 1' },
        },
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={schemaWithoutTitle}
          fields={{ field1: 'value' }}
        />
      );

      // Should render without throwing
      expect(screen.getByLabelText(/Field 1/i)).toBeInTheDocument();
    });

    it('should handle fields without titles by using field path as label', () => {
      const schemaWithoutFieldTitle: FormSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' },
        },
      };

      render(
        <FormBridgeForm
          {...defaultProps}
          schema={schemaWithoutFieldTitle}
          fields={{ customField: 'value' }}
        />
      );

      expect(screen.getByLabelText('customField')).toBeInTheDocument();
    });
  });
});
