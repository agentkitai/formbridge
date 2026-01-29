/**
 * FormBridgeForm component - Main form component that orchestrates all pieces
 * Renders a complete form from an IntakeSchema with validation and submission
 */

import React, { useMemo, useCallback } from 'react';
import {
  IntakeSchema,
  FormBridgeFormProps,
  FieldMetadata,
  Actor,
  FormData,
} from '../types';
import { useFormState } from '../hooks/useFormState';
import { useValidation } from '../hooks/useValidation';
import { useFormSubmission } from '../hooks/useFormSubmission';
import { FormBridgeApiClient, createApiClient } from '../api/client';
import { parseSchema, parseObjectFields, getFieldValue } from '../utils/schemaParser';
import { ErrorDisplay } from './ErrorDisplay';
import { StringField } from './fields/StringField';
import { NumberField } from './fields/NumberField';
import { BooleanField } from './fields/BooleanField';
import { EnumField } from './fields/EnumField';
import { ObjectField } from './fields/ObjectField';
import { ArrayField } from './fields/ArrayField';

/**
 * FormBridgeForm - Main form component
 *
 * Features:
 * - Automatic field rendering from IntakeSchema
 * - Client-side validation with inline errors
 * - Server-side validation error display
 * - Form submission with loading/success/error states
 * - Fully accessible with ARIA attributes
 * - Customizable via className and callbacks
 *
 * @example
 * ```tsx
 * <FormBridgeForm
 *   schema={{
 *     intakeId: 'vendor-onboarding',
 *     title: 'Vendor Onboarding',
 *     type: 'object',
 *     properties: {
 *       companyName: {
 *         type: 'string',
 *         title: 'Company Name'
 *       },
 *       email: {
 *         type: 'string',
 *         format: 'email',
 *         title: 'Email'
 *       }
 *     },
 *     required: ['companyName', 'email']
 *   }}
 *   endpoint="https://api.formbridge.example.com"
 *   onSuccess={(data, submissionId) => console.log('Success!', submissionId)}
 * />
 * ```
 */
export const FormBridgeForm: React.FC<FormBridgeFormProps> = ({
  schema: schemaProp,
  endpoint,
  initialData = {},
  actor,
  onSuccess,
  onError,
  onChange,
  onValidate,
  uiHints,
  className = '',
  validateOnBlur = true,
  validateOnChange = false,
  submitText = 'Submit',
  showRequiredIndicator = true,
  disabled = false,
  loadingComponent,
  errorComponent,
  successComponent,
}) => {
  // For now, only support direct schema object (not URL)
  // Schema fetching can be added in future iterations
  const schema = schemaProp as IntakeSchema;

  // Default actor if not provided
  const defaultActor: Actor = useMemo(
    () =>
      actor || {
        kind: 'human',
        id: 'anonymous',
        name: 'Anonymous User',
      },
    [actor]
  );

  // Initialize API client
  const apiClient = useMemo<FormBridgeApiClient>(
    () => createApiClient({ baseUrl: endpoint }),
    [endpoint]
  );

  // Form state management
  const formState = useFormState(initialData);
  const { data, setField, reset: resetForm } = formState;

  // Validation management
  const validation = useValidation(schema, data);
  const { errors, validateField, validate: validateForm } = validation;

  // Submission management
  const submission = useFormSubmission({
    schema,
    data,
    validation,
    apiClient,
    intakeId: schema.intakeId,
    actor: defaultActor,
    onSuccess: (submissionId) => {
      onSuccess?.(data, submissionId);
    },
    onError: (error) => {
      onError?.(error);
    },
  });

  const { submit, isSubmitting, isSuccess, error: submissionError } = submission;

  // Parse schema to get field metadata
  const fields = useMemo(() => parseSchema(schema, uiHints), [schema, uiHints]);

  // Handle field change
  const handleFieldChange = useCallback(
    async (path: string, value: unknown) => {
      setField(path, value);

      // Notify parent of change
      const newData = { ...data };
      const keys = path.split('.');
      let current: any = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      onChange?.(newData);

      // Validate on change if enabled
      if (validateOnChange) {
        await validateField(path);
      }
    },
    [setField, data, onChange, validateOnChange, validateField]
  );

  // Handle field blur
  const handleFieldBlur = useCallback(
    async (path: string) => {
      // Validate on blur if enabled
      if (validateOnBlur) {
        const result = await validateField(path);

        // Notify parent of validation result if needed
        if (onValidate) {
          const fullResult = await validateForm();
          onValidate(fullResult);
        }

        return result;
      }
    },
    [validateOnBlur, validateField, validateForm, onValidate]
  );

  // Render a single field based on its type
  const renderField = useCallback(
    (
      metadata: FieldMetadata,
      path: string,
      value: unknown,
      onChange: (value: unknown) => void,
      onBlur?: () => void,
      error?: string
    ): React.ReactNode => {
      const fieldProps = {
        path,
        metadata,
        value,
        onChange,
        onBlur,
        error,
        disabled,
      };

      switch (metadata.type) {
        case 'string':
          return (
            <StringField
              key={path}
              {...fieldProps}
              value={(value as string) || ''}
              onChange={onChange as (value: string) => void}
            />
          );

        case 'number':
        case 'integer':
          return (
            <NumberField
              key={path}
              {...fieldProps}
              value={value as number | null}
              onChange={onChange as (value: number | null) => void}
            />
          );

        case 'boolean':
          return (
            <BooleanField
              key={path}
              {...fieldProps}
              value={(value as boolean) || false}
              onChange={onChange as (value: boolean) => void}
            />
          );

        case 'array':
          // Parse array item schema
          const itemSchema: FieldMetadata = {
            path: `${path}[0]`,
            type: metadata.schema.items?.type || 'string',
            label: metadata.label,
            required: false,
            schema: metadata.schema.items || { type: 'string' },
          };

          return (
            <ArrayField
              key={path}
              {...fieldProps}
              value={(value as unknown[]) || []}
              onChange={onChange as (value: unknown[]) => void}
              itemSchema={itemSchema}
              minItems={metadata.schema.minItems}
              maxItems={metadata.schema.maxItems}
              renderItem={(itemMetadata, itemPath, itemValue, onItemChange, onItemBlur, itemError, index) =>
                renderField(itemMetadata, itemPath, itemValue, onItemChange, onItemBlur, itemError)
              }
            />
          );

        case 'object':
          // Parse nested object fields
          const objectFields = parseObjectFields(path, metadata.schema, uiHints);

          return (
            <ObjectField
              key={path}
              {...fieldProps}
              value={(value as Record<string, unknown>) || {}}
              onChange={onChange as (value: Record<string, unknown>) => void}
              fields={objectFields}
              renderField={(fieldMetadata, fieldPath, fieldValue, onFieldChange, onFieldBlur, fieldError) =>
                renderField(fieldMetadata, fieldPath, fieldValue, onFieldChange, onFieldBlur, fieldError)
              }
            />
          );

        default:
          // Handle enum fields (which have 'enum' property in schema)
          if (metadata.schema.enum && Array.isArray(metadata.schema.enum)) {
            return (
              <EnumField
                key={path}
                {...fieldProps}
                value={value}
                onChange={onChange}
                options={metadata.schema.enum}
                asRadio={metadata.hint?.widget === 'radio'}
              />
            );
          }

          // Fallback to string field for unknown types
          return (
            <StringField
              key={path}
              {...fieldProps}
              value={(value as string) || ''}
              onChange={onChange as (value: string) => void}
            />
          );
      }
    },
    [disabled, uiHints]
  );

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Prevent double submission
      if (isSubmitting) {
        return;
      }

      await submit();
    },
    [isSubmitting, submit]
  );

  // Show success state if provided
  if (isSuccess && successComponent) {
    return <>{successComponent(submission.submissionId || '')}</>;
  }

  return (
    <form
      className={`formbridge-form ${className}`.trim()}
      onSubmit={handleSubmit}
      noValidate
    >
      {/* Form title */}
      {schema.title && (
        <h2 className="formbridge-form__title">{schema.title}</h2>
      )}

      {/* Form description */}
      {schema.description && (
        <p className="formbridge-form__description">{schema.description}</p>
      )}

      {/* Submission error display */}
      {submissionError && (
        errorComponent ? (
          <>{errorComponent(submissionError)}</>
        ) : (
          <ErrorDisplay error={submissionError} />
        )
      )}

      {/* Success message (inline version if no custom component) */}
      {isSuccess && !successComponent && (
        <div
          className="formbridge-form__success"
          role="alert"
          aria-live="polite"
        >
          <p>Form submitted successfully!</p>
        </div>
      )}

      {/* Field rendering */}
      <div className="formbridge-form__fields">
        {fields.map((field) => {
          const fieldValue = getFieldValue(data, field.path);
          const fieldError = errors[field.path];

          return renderField(
            field,
            field.path,
            fieldValue,
            (value) => handleFieldChange(field.path, value),
            () => handleFieldBlur(field.path),
            fieldError
          );
        })}
      </div>

      {/* Submit button */}
      <div className="formbridge-form__actions">
        <button
          type="submit"
          className="formbridge-form__submit"
          disabled={disabled || isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            loadingComponent || 'Submitting...'
          ) : (
            submitText
          )}
        </button>
      </div>
    </form>
  );
};

FormBridgeForm.displayName = 'FormBridgeForm';
