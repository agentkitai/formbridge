/**
 * Tests for ObjectField component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ObjectField } from './ObjectField';
import { FieldMetadata } from '../../types';

// Helper to create metadata
const createMetadata = (overrides: Partial<FieldMetadata> = {}): FieldMetadata => ({
  path: 'testField',
  type: 'object',
  label: 'Test Object',
  required: false,
  schema: { type: 'object', properties: {} },
  ...overrides,
});

// Helper to create child field metadata
const createChildMetadata = (
  path: string,
  label: string,
  type: 'string' | 'number' | 'boolean' = 'string'
): FieldMetadata => ({
  path,
  type,
  label,
  required: false,
  schema: { type },
});

describe('ObjectField', () => {
  describe('Basic Rendering', () => {
    it('renders fieldset with legend', () => {
      const metadata = createMetadata({ label: 'Contact Info' });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="contact"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(screen.getByText('Contact Info')).toBeInTheDocument();
    });

    it('renders with description', () => {
      const metadata = createMetadata({
        label: 'Address',
        description: 'Enter your mailing address',
      });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="address"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      expect(screen.getByText('Enter your mailing address')).toBeInTheDocument();
    });

    it('renders required indicator when required', () => {
      const metadata = createMetadata({
        label: 'Profile',
        required: true,
      });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="profile"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      const required = screen.getByLabelText('required');
      expect(required).toBeInTheDocument();
      expect(required).toHaveTextContent('*');
    });

    it('renders error message when error is provided', () => {
      const metadata = createMetadata({ label: 'User Data' });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="userData"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          error="This field is required"
        />
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent('This field is required');
    });

    it('applies custom className', () => {
      const metadata = createMetadata();
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="obj"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          className="custom-class"
        />
      );

      const container = screen.getByTestId('field-obj-fieldset').parentElement;
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('Child Field Rendering', () => {
    it('renders child fields using renderField prop', () => {
      const metadata = createMetadata({ label: 'Person' });
      const fields = [
        createChildMetadata('person.name', 'Name'),
        createChildMetadata('person.email', 'Email'),
      ];

      const renderField = vi.fn((fieldMetadata, path, value, onChange) => (
        <div data-testid={`rendered-${path}`}>
          <label>{fieldMetadata.label}</label>
          <input
            type="text"
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ));

      render(
        <ObjectField
          path="person"
          metadata={metadata}
          value={{ name: 'John', email: 'john@example.com' }}
          onChange={() => {}}
          fields={fields}
          renderField={renderField}
        />
      );

      expect(renderField).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('rendered-person.name')).toBeInTheDocument();
      expect(screen.getByTestId('rendered-person.email')).toBeInTheDocument();
    });

    it('renders placeholder inputs when renderField is not provided', () => {
      const metadata = createMetadata({ label: 'Settings' });
      const fields = [
        createChildMetadata('settings.theme', 'Theme'),
        createChildMetadata('settings.language', 'Language'),
      ];

      render(
        <ObjectField
          path="settings"
          metadata={metadata}
          value={{ theme: 'dark', language: 'en' }}
          onChange={() => {}}
          fields={fields}
        />
      );

      expect(screen.getByTestId('field-settings.theme-placeholder')).toBeInTheDocument();
      expect(screen.getByTestId('field-settings.language-placeholder')).toBeInTheDocument();
      expect(screen.getByLabelText('Theme')).toBeInTheDocument();
      expect(screen.getByLabelText('Language')).toBeInTheDocument();
    });

    it('passes correct values to child fields', () => {
      const metadata = createMetadata({ label: 'Address' });
      const fields = [
        createChildMetadata('address.street', 'Street'),
        createChildMetadata('address.city', 'City'),
      ];

      const renderField = vi.fn((fieldMetadata, path, value) => (
        <div data-testid={`field-${path}`}>{String(value || '')}</div>
      ));

      render(
        <ObjectField
          path="address"
          metadata={metadata}
          value={{ street: '123 Main St', city: 'Springfield' }}
          onChange={() => {}}
          fields={fields}
          renderField={renderField}
        />
      );

      expect(screen.getByTestId('field-address.street')).toHaveTextContent('123 Main St');
      expect(screen.getByTestId('field-address.city')).toHaveTextContent('Springfield');
    });

    it('handles empty/undefined child values', () => {
      const metadata = createMetadata({ label: 'Data' });
      const fields = [
        createChildMetadata('data.field1', 'Field 1'),
        createChildMetadata('data.field2', 'Field 2'),
      ];

      const renderField = vi.fn((fieldMetadata, path, value) => (
        <div data-testid={`field-${path}`}>
          {value === undefined ? 'undefined' : String(value)}
        </div>
      ));

      render(
        <ObjectField
          path="data"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          renderField={renderField}
        />
      );

      expect(screen.getByTestId('field-data.field1')).toHaveTextContent('undefined');
      expect(screen.getByTestId('field-data.field2')).toHaveTextContent('undefined');
    });
  });

  describe('Change Handling', () => {
    it('calls onChange when child field changes', () => {
      const metadata = createMetadata({ label: 'User' });
      const fields = [createChildMetadata('user.name', 'Name')];
      const onChange = vi.fn();

      render(
        <ObjectField
          path="user"
          metadata={metadata}
          value={{ name: 'John' }}
          onChange={onChange}
          fields={fields}
        />
      );

      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Jane' } });

      expect(onChange).toHaveBeenCalledWith({ name: 'Jane' });
    });

    it('preserves other field values when one field changes', () => {
      const metadata = createMetadata({ label: 'Contact' });
      const fields = [
        createChildMetadata('contact.name', 'Name'),
        createChildMetadata('contact.email', 'Email'),
      ];
      const onChange = vi.fn();

      render(
        <ObjectField
          path="contact"
          metadata={metadata}
          value={{ name: 'John', email: 'john@example.com' }}
          onChange={onChange}
          fields={fields}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Jane' } });

      expect(onChange).toHaveBeenCalledWith({
        name: 'Jane',
        email: 'john@example.com',
      });
    });

    it('handles change through renderField callback', () => {
      const metadata = createMetadata({ label: 'Profile' });
      const fields = [createChildMetadata('profile.bio', 'Bio')];
      const onChange = vi.fn();

      const renderField = vi.fn((fieldMetadata, path, value, onFieldChange) => (
        <div>
          <button
            data-testid="change-button"
            onClick={() => onFieldChange('Updated bio')}
          >
            Change
          </button>
        </div>
      ));

      render(
        <ObjectField
          path="profile"
          metadata={metadata}
          value={{ bio: 'Original bio' }}
          onChange={onChange}
          fields={fields}
          renderField={renderField}
        />
      );

      const button = screen.getByTestId('change-button');
      fireEvent.click(button);

      expect(onChange).toHaveBeenCalledWith({ bio: 'Updated bio' });
    });

    it('handles nested object changes', () => {
      const metadata = createMetadata({ label: 'User' });
      const fields = [
        createChildMetadata('user.profile.name', 'Name'),
        createChildMetadata('user.profile.age', 'Age', 'number'),
      ];
      const onChange = vi.fn();

      render(
        <ObjectField
          path="user"
          metadata={metadata}
          value={{ profile: { name: 'John', age: 30 } }}
          onChange={onChange}
          fields={fields}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Jane' } });

      expect(onChange).toHaveBeenCalledWith({
        profile: { name: 'Jane', age: 30 },
      });
    });

    it('creates nested objects when they do not exist', () => {
      const metadata = createMetadata({ label: 'Data' });
      const fields = [createChildMetadata('data.nested.value', 'Value')];
      const onChange = vi.fn();

      render(
        <ObjectField
          path="data"
          metadata={metadata}
          value={{}}
          onChange={onChange}
          fields={fields}
        />
      );

      const input = screen.getByLabelText('Value') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'test' } });

      expect(onChange).toHaveBeenCalledWith({
        nested: { value: 'test' },
      });
    });
  });

  describe('Disabled State', () => {
    it('disables fieldset when disabled prop is true', () => {
      const metadata = createMetadata({ label: 'Settings' });
      const fields = [createChildMetadata('settings.option', 'Option')];

      render(
        <ObjectField
          path="settings"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          disabled={true}
        />
      );

      const fieldset = screen.getByRole('group') as HTMLFieldSetElement;
      expect(fieldset).toBeDisabled();
    });

    it('passes disabled state to placeholder inputs', () => {
      const metadata = createMetadata({ label: 'Data' });
      const fields = [createChildMetadata('data.field', 'Field')];

      render(
        <ObjectField
          path="data"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          disabled={true}
        />
      );

      const input = screen.getByLabelText('Field') as HTMLInputElement;
      expect(input).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      const metadata = createMetadata({
        label: 'User Info',
        description: 'User information',
      });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="userInfo"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toHaveAttribute('aria-invalid', 'false');
      expect(fieldset).toHaveAttribute('aria-describedby');
    });

    it('sets aria-invalid to true when error is present', () => {
      const metadata = createMetadata({ label: 'Data' });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="data"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          error="Invalid data"
        />
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toHaveAttribute('aria-invalid', 'true');
    });

    it('links description with aria-describedby', () => {
      const metadata = createMetadata({
        label: 'Settings',
        description: 'Configuration settings',
      });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="settings"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      const fieldset = screen.getByRole('group');
      const describedBy = fieldset.getAttribute('aria-describedby');
      expect(describedBy).toContain('field-settings-description');
    });

    it('links error with aria-describedby', () => {
      const metadata = createMetadata({ label: 'Form' });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="form"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          error="Invalid form data"
        />
      );

      const fieldset = screen.getByRole('group');
      const describedBy = fieldset.getAttribute('aria-describedby');
      expect(describedBy).toContain('field-form-error');
    });

    it('error has role="alert" and aria-live="polite"', () => {
      const metadata = createMetadata({ label: 'Data' });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="data"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          error="Error message"
        />
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('CSS Classes', () => {
    it('applies base CSS classes', () => {
      const metadata = createMetadata({ label: 'Object' });
      const fields: FieldMetadata[] = [];

      const { container } = render(
        <ObjectField
          path="obj"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      const objectField = container.querySelector('.formbridge-object-field');
      expect(objectField).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const metadata = createMetadata({ label: 'Object' });
      const fields: FieldMetadata[] = [];

      const { container } = render(
        <ObjectField
          path="obj"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
          className="my-custom-class"
        />
      );

      const objectField = container.querySelector('.formbridge-object-field');
      expect(objectField).toHaveClass('my-custom-class');
    });

    it('applies CSS class to fieldset', () => {
      const metadata = createMetadata({ label: 'Object' });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="obj"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toHaveClass('formbridge-object-field__fieldset');
    });

    it('applies CSS class to legend', () => {
      const metadata = createMetadata({ label: 'My Object' });
      const fields: FieldMetadata[] = [];

      const { container } = render(
        <ObjectField
          path="obj"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      const legend = container.querySelector('.formbridge-object-field__legend');
      expect(legend).toBeInTheDocument();
      expect(legend).toHaveTextContent('My Object');
    });
  });

  describe('Edge Cases', () => {
    it('handles null value gracefully', () => {
      const metadata = createMetadata({ label: 'Data' });
      const fields = [createChildMetadata('data.field', 'Field')];

      render(
        <ObjectField
          path="data"
          metadata={metadata}
          value={null as any}
          onChange={() => {}}
          fields={fields}
        />
      );

      // Should not crash
      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('handles undefined value gracefully', () => {
      const metadata = createMetadata({ label: 'Data' });
      const fields = [createChildMetadata('data.field', 'Field')];

      render(
        <ObjectField
          path="data"
          metadata={metadata}
          value={undefined as any}
          onChange={() => {}}
          fields={fields}
        />
      );

      // Should not crash
      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('handles empty fields array', () => {
      const metadata = createMetadata({ label: 'Empty Object' });

      render(
        <ObjectField
          path="empty"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={[]}
        />
      );

      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(screen.getByText('Empty Object')).toBeInTheDocument();
    });

    it('handles fields with special characters in path', () => {
      const metadata = createMetadata({ label: 'Special' });
      const fields = [createChildMetadata('special.field-name', 'Field Name')];
      const onChange = vi.fn();

      render(
        <ObjectField
          path="special"
          metadata={metadata}
          value={{ 'field-name': 'value' }}
          onChange={onChange}
          fields={fields}
        />
      );

      const input = screen.getByLabelText('Field Name') as HTMLInputElement;
      expect(input.value).toBe('value');

      fireEvent.change(input, { target: { value: 'new value' } });
      expect(onChange).toHaveBeenCalledWith({ 'field-name': 'new value' });
    });

    it('handles deeply nested paths correctly', () => {
      const metadata = createMetadata({ label: 'Root' });
      const fields = [
        createChildMetadata('root.level1.level2.level3.field', 'Deep Field'),
      ];
      const onChange = vi.fn();

      render(
        <ObjectField
          path="root"
          metadata={metadata}
          value={{
            level1: {
              level2: {
                level3: {
                  field: 'deep value',
                },
              },
            },
          }}
          onChange={onChange}
          fields={fields}
        />
      );

      const input = screen.getByLabelText('Deep Field') as HTMLInputElement;
      expect(input.value).toBe('deep value');

      fireEvent.change(input, { target: { value: 'new deep value' } });
      expect(onChange).toHaveBeenCalledWith({
        level1: {
          level2: {
            level3: {
              field: 'new deep value',
            },
          },
        },
      });
    });
  });

  describe('Data Test IDs', () => {
    it('sets data-testid on fieldset', () => {
      const metadata = createMetadata({ label: 'Test' });
      const fields: FieldMetadata[] = [];

      render(
        <ObjectField
          path="myObject"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      expect(screen.getByTestId('field-myObject-fieldset')).toBeInTheDocument();
    });

    it('sets data-field-path on container', () => {
      const metadata = createMetadata({ label: 'Test' });
      const fields: FieldMetadata[] = [];

      const { container } = render(
        <ObjectField
          path="testPath"
          metadata={metadata}
          value={{}}
          onChange={() => {}}
          fields={fields}
        />
      );

      const objectField = container.querySelector('[data-field-path="testPath"]');
      expect(objectField).toBeInTheDocument();
    });
  });
});
