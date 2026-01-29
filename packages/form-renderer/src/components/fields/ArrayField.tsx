/**
 * ArrayField component - Renders array fields with add/remove functionality
 * Supports repeatable field groups for dynamic lists
 */

import React from 'react';
import { ArrayFieldProps, FieldMetadata } from '../../types';

/**
 * ArrayField - Renders an array field with add/remove buttons for dynamic lists
 *
 * Features:
 * - Add/remove buttons for managing array items
 * - Renders as a fieldset with legend for accessibility
 * - Supports min/max items constraints
 * - Flexible item rendering via renderItem prop
 * - Full accessibility support with proper ARIA attributes
 * - Visual index indicators for each item
 *
 * @example
 * ```tsx
 * <ArrayField
 *   path="tags"
 *   metadata={{
 *     path: 'tags',
 *     type: 'array',
 *     label: 'Tags',
 *     required: true,
 *     schema: {
 *       type: 'array',
 *       items: { type: 'string' }
 *     }
 *   }}
 *   itemSchema={{
 *     path: 'tags[0]',
 *     type: 'string',
 *     label: 'Tag',
 *     required: false,
 *     schema: { type: 'string' }
 *   }}
 *   value={['react', 'typescript']}
 *   onChange={(value) => console.log(value)}
 *   renderItem={(itemMetadata, itemPath, itemValue, onItemChange, index) => (
 *     <StringField
 *       path={itemPath}
 *       metadata={itemMetadata}
 *       value={itemValue}
 *       onChange={onItemChange}
 *     />
 *   )}
 * />
 * ```
 */
export const ArrayField: React.FC<
  ArrayFieldProps & {
    /**
     * Function to render each array item
     * This allows the parent component to control how each item is rendered
     */
    renderItem?: (
      metadata: FieldMetadata,
      path: string,
      value: unknown,
      onChange: (value: unknown) => void,
      onBlur?: () => void,
      error?: string,
      index?: number
    ) => React.ReactNode;
  }
> = ({
  path,
  metadata,
  value = [],
  onChange,
  onBlur,
  error,
  disabled = false,
  className = '',
  itemSchema,
  minItems,
  maxItems,
  renderItem,
}) => {
  const { label, description, required } = metadata;

  // Ensure value is always an array
  const arrayValue = Array.isArray(value) ? value : [];

  // Handle adding a new item
  const handleAdd = () => {
    // Check max items constraint
    if (maxItems !== undefined && arrayValue.length >= maxItems) {
      return;
    }

    // Determine default value based on item type
    let defaultValue: unknown = null;

    if (itemSchema.type === 'string') {
      defaultValue = '';
    } else if (itemSchema.type === 'number') {
      defaultValue = 0;
    } else if (itemSchema.type === 'boolean') {
      defaultValue = false;
    } else if (itemSchema.type === 'object') {
      defaultValue = {};
    } else if (itemSchema.type === 'array') {
      defaultValue = [];
    }

    onChange([...arrayValue, defaultValue]);
  };

  // Handle removing an item at a specific index
  const handleRemove = (index: number) => {
    // Check min items constraint
    if (minItems !== undefined && arrayValue.length <= minItems) {
      return;
    }

    const newValue = arrayValue.filter((_, i) => i !== index);
    onChange(newValue);
  };

  // Handle keyboard shortcuts for array field operations
  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    // Allow Escape key to blur the button
    if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  const handleRemoveKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    // Allow Escape key to blur the button
    if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  // Handle change for a specific item
  const handleItemChange = (index: number, itemValue: unknown) => {
    const newValue = [...arrayValue];
    newValue[index] = itemValue;
    onChange(newValue);
  };

  // Check if we can add more items
  const canAdd = maxItems === undefined || arrayValue.length < maxItems;

  // Check if we can remove items
  const canRemove = minItems === undefined || arrayValue.length > minItems;

  // Generate unique IDs for accessibility
  const fieldsetId = `field-${path}`;
  const descriptionId = description ? `${fieldsetId}-description` : undefined;
  const errorId = error ? `${fieldsetId}-error` : undefined;

  return (
    <div
      className={`formbridge-array-field ${className}`.trim()}
      data-field-path={path}
    >
      <fieldset
        id={fieldsetId}
        className="formbridge-array-field__fieldset"
        disabled={disabled}
        aria-describedby={[descriptionId, errorId]
          .filter(Boolean)
          .join(' ') || undefined}
        aria-invalid={error ? 'true' : 'false'}
        data-testid={`field-${path}-fieldset`}
      >
        <legend className="formbridge-array-field__legend">
          {label}
          {required && (
            <span
              className="formbridge-array-field__required"
              aria-label="required"
            >
              *
            </span>
          )}
        </legend>

        {description && (
          <p
            id={descriptionId}
            className="formbridge-array-field__description"
          >
            {description}
          </p>
        )}

        <div
          className="formbridge-array-field__items"
          role="list"
          aria-label={`${label} items`}
        >
          {arrayValue.length === 0 ? (
            <div
              className="formbridge-array-field__empty"
              data-testid={`field-${path}-empty`}
            >
              No items yet
            </div>
          ) : (
            arrayValue.map((item, index) => {
              const itemPath = `${path}[${index}]`;

              // Create item-specific metadata
              const itemMetadata: FieldMetadata = {
                ...itemSchema,
                path: itemPath,
                label: `${itemSchema.label || 'Item'} ${index + 1}`,
              };

              return (
                <div
                  key={index}
                  className="formbridge-array-field__item"
                  role="listitem"
                  data-testid={`field-${path}-item-${index}`}
                >
                  <div className="formbridge-array-field__item-header">
                    <span
                      className="formbridge-array-field__item-index"
                      aria-label={`Item ${index + 1}`}
                    >
                      #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(index)}
                      onKeyDown={(e) => handleRemoveKeyDown(e, index)}
                      disabled={disabled || !canRemove}
                      className="formbridge-array-field__remove-button"
                      aria-label={`Remove item ${index + 1}`}
                      aria-disabled={disabled || !canRemove ? 'true' : 'false'}
                      data-testid={`field-${path}-remove-${index}`}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="formbridge-array-field__item-content">
                    {renderItem ? (
                      renderItem(
                        itemMetadata,
                        itemPath,
                        item,
                        (newValue) => handleItemChange(index, newValue),
                        onBlur,
                        undefined, // error for item would come from parent validation
                        index
                      )
                    ) : (
                      // Fallback placeholder rendering
                      <div
                        className="formbridge-field"
                        data-testid={`field-${itemPath}-placeholder`}
                      >
                        <label htmlFor={`input-${itemPath}`}>
                          {itemMetadata.label}
                        </label>
                        <input
                          id={`input-${itemPath}`}
                          type="text"
                          value={String(item || '')}
                          onChange={(e) =>
                            handleItemChange(index, e.target.value)
                          }
                          disabled={disabled}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="formbridge-array-field__actions">
          <button
            type="button"
            onClick={handleAdd}
            onKeyDown={handleAddKeyDown}
            disabled={disabled || !canAdd}
            className="formbridge-array-field__add-button"
            aria-label={`Add ${itemSchema.label || 'item'}`}
            aria-disabled={disabled || !canAdd ? 'true' : 'false'}
            data-testid={`field-${path}-add`}
          >
            Add {itemSchema.label || 'Item'}
          </button>

          {minItems !== undefined && (
            <span
              className="formbridge-array-field__constraint"
              data-testid={`field-${path}-min-constraint`}
            >
              Minimum: {minItems}
            </span>
          )}

          {maxItems !== undefined && (
            <span
              className="formbridge-array-field__constraint"
              data-testid={`field-${path}-max-constraint`}
            >
              Maximum: {maxItems}
            </span>
          )}
        </div>

        {error && (
          <div
            id={errorId}
            className="formbridge-array-field__error"
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

ArrayField.displayName = 'ArrayField';
