/**
 * FormBridgeForm component - Renders a form with field attribution tracking
 * Displays which actor (agent, human, system) filled each field
 */

import React, { useState, useCallback, useEffect } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { Actor, FieldAttribution } from '../types';

/**
 * JSON Schema property definition
 */
export interface SchemaProperty {
  type: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/**
 * JSON Schema definition for forms
 */
export interface FormSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
  title?: string;
  description?: string;
}

/**
 * Props for FormBridgeForm component
 */
export interface FormBridgeFormProps {
  /** JSON Schema defining the form structure */
  schema: FormSchema;
  /** Current field values */
  fields: Record<string, unknown>;
  /** Field-level attribution mapping field paths to actors */
  fieldAttribution: FieldAttribution;
  /** Callback when field value changes */
  onFieldChange?: (fieldPath: string, value: unknown, actor: Actor) => void;
  /** Callback when form is submitted */
  onSubmit?: (fields: Record<string, unknown>) => void;
  /** Current actor filling the form */
  currentActor: Actor;
  /** Custom CSS class */
  className?: string;
  /** Whether the form is read-only */
  readOnly?: boolean;
  /** Field-level errors */
  errors?: Record<string, string>;
}

/**
 * FormBridgeForm - Component that renders a form with field attribution tracking
 *
 * This component provides a complete form rendering solution for mixed-mode
 * agent-human collaboration workflows. It renders form fields with visual
 * attribution badges showing which actor (agent, human, system) filled each
 * field, enabling humans to see pre-filled data from agents and complete
 * remaining fields.
 *
 * @example
 * ```tsx
 * <FormBridgeForm
 *   schema={{
 *     type: 'object',
 *     properties: {
 *       vendorName: { type: 'string', title: 'Vendor Name' },
 *       taxId: { type: 'string', title: 'Tax ID' },
 *     },
 *     required: ['vendorName', 'taxId'],
 *   }}
 *   fields={{
 *     vendorName: 'Acme Corp',
 *     taxId: '',
 *   }}
 *   fieldAttribution={{
 *     vendorName: { kind: 'agent', id: 'agent_123', name: 'AutoVendor' },
 *   }}
 *   currentActor={{ kind: 'human', id: 'user_456', name: 'John Doe' }}
 *   onFieldChange={(path, value, actor) => console.log('Field changed', path, value)}
 *   onSubmit={(fields) => console.log('Form submitted', fields)}
 * />
 * ```
 */
export const FormBridgeForm: React.FC<FormBridgeFormProps> = ({
  schema,
  fields,
  fieldAttribution,
  onFieldChange,
  onSubmit,
  currentActor,
  className = '',
  readOnly = false,
  errors = {},
}) => {
  const [localFields, setLocalFields] = useState<Record<string, unknown>>(fields);

  // Sync local state when the fields prop changes (e.g., after refetch)
  useEffect(() => {
    setLocalFields(fields);
  }, [fields]);

  /**
   * Handle field value change
   */
  const handleFieldChange = useCallback(
    (fieldPath: string, value: unknown) => {
      // Update local state
      const newFields = {
        ...localFields,
        [fieldPath]: value,
      };
      setLocalFields(newFields);

      // Notify parent component
      onFieldChange?.(fieldPath, value, currentActor);
    },
    [localFields, currentActor, onFieldChange]
  );

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onSubmit?.(localFields);
    },
    [localFields, onSubmit]
  );

  /**
   * Render a single form field based on schema property
   */
  const renderField = (fieldPath: string, property: SchemaProperty) => {
    const value = localFields[fieldPath] ?? '';
    const isRequired = schema.required?.includes(fieldPath) ?? false;
    const fieldLabel = property.title ?? fieldPath;
    const error = errors[fieldPath];
    const helperText = property.description;
    const attribution = fieldAttribution[fieldPath];

    // Determine input type based on schema
    const inputType = property.format === 'email' ? 'email' :
                     property.format === 'date' ? 'date' :
                     property.type === 'number' ? 'number' :
                     property.type === 'integer' ? 'number' :
                     'text';

    return (
      <FieldWrapper
        key={fieldPath}
        fieldPath={fieldPath}
        label={fieldLabel}
        fieldAttribution={attribution}
        required={isRequired}
        error={error}
        helperText={helperText}
      >
        {property.enum ? (
          // Render select for enum properties
          <select
            id={`field-${fieldPath.replace(/\./g, '-')}`}
            name={fieldPath}
            value={String(value)}
            onChange={(e) => handleFieldChange(fieldPath, e.target.value)}
            disabled={readOnly}
            className="formbridge-form__select"
            required={isRequired}
          >
            <option value="">Select {fieldLabel}</option>
            {property.enum.map((option, idx) => (
              <option key={idx} value={String(option)}>
                {String(option)}
              </option>
            ))}
          </select>
        ) : property.type === 'boolean' ? (
          // Render checkbox for boolean properties
          <input
            id={`field-${fieldPath.replace(/\./g, '-')}`}
            type="checkbox"
            name={fieldPath}
            checked={Boolean(value)}
            onChange={(e) => handleFieldChange(fieldPath, e.target.checked)}
            disabled={readOnly}
            className="formbridge-form__checkbox"
          />
        ) : (
          // Render text/number input for other types
          <input
            id={`field-${fieldPath.replace(/\./g, '-')}`}
            type={inputType}
            name={fieldPath}
            value={String(value)}
            onChange={(e) => handleFieldChange(fieldPath, e.target.value)}
            disabled={readOnly}
            className="formbridge-form__input"
            required={isRequired}
            minLength={property.minLength}
            maxLength={property.maxLength}
            min={property.minimum}
            max={property.maximum}
          />
        )}
      </FieldWrapper>
    );
  };

  return (
    <form
      className={`formbridge-form ${className}`.trim()}
      onSubmit={handleSubmit}
      noValidate
    >
      {/* Form title and description */}
      {schema.title && (
        <div className="formbridge-form__header">
          <h2 className="formbridge-form__title">{schema.title}</h2>
          {schema.description && (
            <p className="formbridge-form__description">{schema.description}</p>
          )}
        </div>
      )}

      {/* Form fields */}
      <div className="formbridge-form__fields">
        {Object.entries(schema.properties).map(([fieldPath, property]) =>
          renderField(fieldPath, property)
        )}
      </div>

      {/* Submit button */}
      {!readOnly && (
        <div className="formbridge-form__actions">
          <button
            type="submit"
            className="formbridge-form__submit"
          >
            Submit
          </button>
        </div>
      )}
    </form>
  );
};

FormBridgeForm.displayName = 'FormBridgeForm';
