/**
 * ObjectField component - Renders nested object fields as grouped fieldsets
 * Supports recursive nesting for complex object structures
 */

import React from 'react';
import { ObjectFieldProps, FieldMetadata } from '../../types';

/**
 * ObjectField - Renders a nested object field with child fields
 *
 * Features:
 * - Renders as a fieldset with legend for accessibility
 * - Supports any level of nesting
 * - Handles changes to child fields by updating the parent object
 * - Flexible field rendering via renderField prop
 * - Full accessibility support with proper ARIA attributes
 *
 * @example
 * ```tsx
 * <ObjectField
 *   path="address"
 *   metadata={{
 *     path: 'address',
 *     type: 'object',
 *     label: 'Address',
 *     required: true,
 *     schema: {
 *       type: 'object',
 *       properties: {
 *         street: { type: 'string' },
 *         city: { type: 'string' }
 *       }
 *     }
 *   }}
 *   fields={[streetMetadata, cityMetadata]}
 *   value={{ street: '123 Main St', city: 'Springfield' }}
 *   onChange={(value) => console.log(value)}
 *   renderField={(fieldMetadata, fieldPath, fieldValue, onFieldChange) => (
 *     <StringField
 *       path={fieldPath}
 *       metadata={fieldMetadata}
 *       value={fieldValue}
 *       onChange={onFieldChange}
 *     />
 *   )}
 * />
 * ```
 */
export const ObjectField: React.FC<
  ObjectFieldProps & {
    /**
     * Function to render child fields
     * This allows the parent component to control how each field type is rendered
     */
    renderField?: (
      metadata: FieldMetadata,
      path: string,
      value: unknown,
      onChange: (value: unknown) => void,
      onBlur?: () => void,
      error?: string
    ) => React.ReactNode;
  }
> = ({
  path,
  metadata,
  value = {},
  onChange,
  onBlur,
  error,
  disabled = false,
  className = '',
  fields,
  renderField,
}) => {
  const { label, description, required } = metadata;

  // Handle change event for a child field
  const handleFieldChange = (fieldPath: string, fieldValue: unknown) => {
    // Extract the field key from the path
    // For "address.street", we want "street"
    // For nested paths like "address.location.city", we want "location.city"
    const fieldKey = fieldPath.startsWith(path)
      ? fieldPath.substring(path.length + 1)
      : fieldPath;

    // Handle nested paths (e.g., "location.city")
    const keys = fieldKey.split('.');

    if (keys.length === 1) {
      // Simple case: direct child field
      onChange({
        ...value,
        [fieldKey]: fieldValue,
      });
    } else {
      // Nested case: need to update nested object
      const newValue = { ...value };
      let current: any = newValue;

      // Navigate to the parent of the target field
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        } else {
          current[key] = { ...current[key] };
        }
        current = current[key];
      }

      // Set the final value
      current[keys[keys.length - 1]] = fieldValue;
      onChange(newValue);
    }
  };

  // Get the value for a child field
  const getFieldValue = (fieldPath: string): unknown => {
    const fieldKey = fieldPath.startsWith(path)
      ? fieldPath.substring(path.length + 1)
      : fieldPath;

    // Handle nested paths
    const keys = fieldKey.split('.');
    let current: any = value;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  };

  // Generate unique IDs for accessibility
  const fieldsetId = `field-${path}`;
  const descriptionId = description ? `${fieldsetId}-description` : undefined;
  const errorId = error ? `${fieldsetId}-error` : undefined;

  return (
    <div
      className={`formbridge-object-field ${className}`.trim()}
      data-field-path={path}
    >
      <fieldset
        id={fieldsetId}
        className="formbridge-object-field__fieldset"
        disabled={disabled}
        aria-describedby={[descriptionId, errorId]
          .filter(Boolean)
          .join(' ') || undefined}
        aria-invalid={error ? 'true' : 'false'}
        data-testid={`field-${path}-fieldset`}
      >
        <legend className="formbridge-object-field__legend">
          {label}
          {required && (
            <span
              className="formbridge-object-field__required"
              aria-label="required"
            >
              *
            </span>
          )}
        </legend>

        {description && (
          <p
            id={descriptionId}
            className="formbridge-object-field__description"
          >
            {description}
          </p>
        )}

        <div className="formbridge-object-field__fields">
          {fields.map((fieldMetadata) => {
            const fieldPath = fieldMetadata.path;
            const fieldValue = getFieldValue(fieldPath);

            // If renderField is provided, use it to render the field
            if (renderField) {
              return (
                <div
                  key={fieldPath}
                  className="formbridge-object-field__field"
                >
                  {renderField(
                    fieldMetadata,
                    fieldPath,
                    fieldValue,
                    (newValue) => handleFieldChange(fieldPath, newValue),
                    onBlur,
                    undefined // error for child field would come from parent validation
                  )}
                </div>
              );
            }

            // If no renderField is provided, render a placeholder
            // This shouldn't happen in production, but helps with testing
            return (
              <div
                key={fieldPath}
                className="formbridge-object-field__field"
                data-testid={`field-${fieldPath}-placeholder`}
              >
                <div className="formbridge-field">
                  <label>{fieldMetadata.label}</label>
                  <input
                    type="text"
                    value={String(fieldValue || '')}
                    onChange={(e) =>
                      handleFieldChange(fieldPath, e.target.value)
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div
            id={errorId}
            className="formbridge-object-field__error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}
      </fieldset>
    </div>
  );
};

ObjectField.displayName = 'ObjectField';
