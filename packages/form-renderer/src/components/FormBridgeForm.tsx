/**
 * FormBridgeForm component - Renders a form with field attribution tracking
 * Displays which actor (agent, human, system) filled each field
 */

import React, { useState, useCallback, useEffect } from 'react';
import { FieldWrapper } from './FieldWrapper';
import { ReviewerView } from './ReviewerView';
import { ArrayField } from './fields/ArrayField';
import { FileField } from './fields/FileField';
import type { ReviewSubmission } from './ReviewerView';
import type { Actor, FieldAttribution, FieldMetadata } from '../types';

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
  /** Nested object properties */
  properties?: Record<string, SchemaProperty>;
  /** Required fields for nested objects */
  required?: string[];
  /** Array item schema */
  items?: SchemaProperty;
  /** Minimum number of array items */
  minItems?: number;
  /** Maximum number of array items */
  maxItems?: number;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Allowed MIME types for file fields */
  allowedTypes?: string[];
  /** Maximum number of files */
  maxCount?: number;
  /** Whether multiple files are allowed */
  multiple?: boolean;
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
  /** Optional submission object for review workflows */
  submission?: ReviewSubmission;
  /** Optional slot for approval action buttons (used in reviewer mode) */
  approvalActions?: React.ReactNode;
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
 * When a submission is provided and is in the 'needs_review' state, this
 * component automatically renders the ReviewerView component instead of the
 * regular form, enabling approval workflow functionality.
 *
 * @example
 * ```tsx
 * // Regular form mode
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
 *
 * // Reviewer mode (when submission is in needs_review state)
 * <FormBridgeForm
 *   schema={schema}
 *   fields={submission.fields}
 *   fieldAttribution={submission.fieldAttribution}
 *   currentActor={{ kind: 'human', id: 'reviewer_789', name: 'Jane Doe' }}
 *   submission={submission}
 *   approvalActions={<ApprovalActions onApprove={...} onReject={...} />}
 * />
 * ```
 */
/**
 * Get a nested value from an object using a dot-separated path.
 */
function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested value on an object using a dot-separated path.
 * Returns a new object (immutable).
 */
function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): Record<string, unknown> {
  const parts = dotPath.split('.');
  const key = parts[0] as string;
  if (parts.length === 1) {
    return { ...obj, [key]: value };
  }
  const rest = parts.slice(1).join('.');
  const child = (obj[key] != null && typeof obj[key] === 'object') ? obj[key] as Record<string, unknown> : {};
  return { ...obj, [key]: setNestedValue(child, rest, value) };
}

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
  submission,
  approvalActions,
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
      // Update local state using nested-aware setter
      const newFields = fieldPath.includes('.')
        ? setNestedValue(localFields, fieldPath, value)
        : { ...localFields, [fieldPath]: value };
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

  // If submission exists and is in needs_review state, render ReviewerView
  if (submission && submission.state === 'needs_review') {
    return (
      <ReviewerView
        submission={submission}
        schema={schema}
        reviewer={currentActor}
        className={className}
        approvalActions={approvalActions}
      />
    );
  }

  /**
   * Render a single form field based on schema property
   */
  const renderField = (fieldPath: string, property: SchemaProperty, parentRequired?: string[]) => {
    const value = getNestedValue(localFields, fieldPath);
    const isRequired = (parentRequired ?? schema.required)?.includes(fieldPath.split('.').pop()!) ?? false;
    const fieldLabel = property.title ?? fieldPath.split('.').pop()!;
    const error = errors[fieldPath];
    const helperText = property.description;
    const attribution = fieldAttribution[fieldPath];

    // Handle nested object fields
    if (property.type === 'object' && property.properties) {
      return (
        <fieldset key={fieldPath} className="formbridge-form__fieldset">
          <legend className="formbridge-form__legend">{fieldLabel}</legend>
          {helperText && <p className="formbridge-form__description">{helperText}</p>}
          {Object.entries(property.properties).map(([subKey, subProp]) =>
            renderField(`${fieldPath}.${subKey}`, subProp, property.required)
          )}
        </fieldset>
      );
    }

    // Handle array fields
    if (property.type === 'array' && property.items) {
      const itemSchema: FieldMetadata = {
        path: `${fieldPath}[]`,
        type: (property.items.type ?? 'string') as FieldMetadata['type'],
        label: property.items.title ?? fieldLabel,
        required: false,
        schema: property.items as FieldMetadata['schema'],
      };

      const renderItem = property.items.type === 'object' && property.items.properties
        ? (_itemMeta: FieldMetadata, itemPath: string, itemValue: unknown, onChange: (v: unknown) => void) => (
            <div className="formbridge-form__array-object-item">
              {Object.entries(property.items!.properties!).map(([subKey, subProp]) => {
                const subPath = `${itemPath}.${subKey}`;
                const subVal = (itemValue != null && typeof itemValue === 'object')
                  ? (itemValue as Record<string, unknown>)[subKey] ?? ''
                  : '';
                const subLabel = subProp.title ?? subKey;
                const subRequired = property.items!.required?.includes(subKey) ?? false;
                const inputType = subProp.format === 'email' ? 'email' :
                                 subProp.format === 'date' ? 'date' :
                                 subProp.type === 'number' || subProp.type === 'integer' ? 'number' : 'text';
                return (
                  <FieldWrapper key={subPath} path={subPath} label={subLabel} required={subRequired} error={errors[subPath]}>
                    <input
                      id={`field-${subPath.replace(/\./g, '-')}`}
                      type={inputType}
                      value={String(subVal)}
                      onChange={(e) => {
                        const obj = (itemValue != null && typeof itemValue === 'object')
                          ? { ...(itemValue as Record<string, unknown>) }
                          : {};
                        obj[subKey] = e.target.value;
                        onChange(obj);
                      }}
                      disabled={readOnly}
                      className="formbridge-form__input"
                      required={subRequired}
                    />
                  </FieldWrapper>
                );
              })}
            </div>
          )
        : undefined;

      return (
        <ArrayField
          key={fieldPath}
          path={fieldPath}
          metadata={{
            path: fieldPath,
            type: 'array',
            label: fieldLabel,
            required: isRequired,
            schema: property as FieldMetadata['schema'],
          }}
          itemSchema={itemSchema}
          value={Array.isArray(value) ? value : []}
          onChange={(newValue) => handleFieldChange(fieldPath, newValue)}
          disabled={readOnly}
          error={error}
          minItems={property.minItems}
          maxItems={property.maxItems}
          renderItem={renderItem}
        />
      );
    }

    // Handle file fields
    if (property.type === 'file' || property.format === 'file') {
      return (
        <FileField
          key={fieldPath}
          path={fieldPath}
          metadata={{
            path: fieldPath,
            type: 'file' as FieldMetadata['type'],
            label: fieldLabel,
            description: helperText,
            required: isRequired,
            schema: property as FieldMetadata['schema'],
          }}
          value={value as File | File[] | null}
          onChange={(newValue) => handleFieldChange(fieldPath, newValue)}
          disabled={readOnly}
          error={error}
          maxSize={property.maxSize}
          allowedTypes={property.allowedTypes}
          maxCount={property.maxCount}
          multiple={property.multiple}
        />
      );
    }

    // Determine input type based on schema
    const inputType = property.format === 'email' ? 'email' :
                     property.format === 'date' ? 'date' :
                     property.type === 'number' ? 'number' :
                     property.type === 'integer' ? 'number' :
                     'text';

    return (
      <FieldWrapper
        key={fieldPath}
        path={fieldPath}
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
            value={String(value ?? '')}
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
            value={String(value ?? '')}
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
