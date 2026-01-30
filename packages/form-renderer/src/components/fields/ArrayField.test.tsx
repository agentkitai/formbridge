/**
 * Tests for ArrayField component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ArrayField } from './ArrayField';
import { FieldMetadata } from '../../types';

// Helper to create metadata
const createMetadata = (overrides: Partial<FieldMetadata> = {}): FieldMetadata => ({
  path: 'testField',
  type: 'array',
  label: 'Test Array',
  required: false,
  schema: { type: 'array', items: { type: 'string' } },
  ...overrides,
});

// Helper to create item schema metadata
const createItemMetadata = (
  type: 'string' | 'number' | 'boolean' | 'object' = 'string',
  label = 'Item'
): FieldMetadata => ({
  path: 'item',
  type,
  label,
  required: false,
  schema: { type },
});

describe('ArrayField', () => {
  describe('Basic Rendering', () => {
    it('renders fieldset with legend', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string', 'Tag');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(screen.getByText('Tags')).toBeInTheDocument();
    });

    it('renders with description', () => {
      const metadata = createMetadata({
        label: 'Skills',
        description: 'Add your skills',
      });
      const itemSchema = createItemMetadata('string', 'Skill');

      render(
        <ArrayField
          path="skills"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByText('Add your skills')).toBeInTheDocument();
    });

    it('renders required indicator when required', () => {
      const metadata = createMetadata({
        label: 'Tags',
        required: true,
      });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const required = screen.getByLabelText('required');
      expect(required).toBeInTheDocument();
      expect(required).toHaveTextContent('*');
    });

    it('renders error message when error is provided', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          error="At least one item is required"
        />
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent('At least one item is required');
    });

    it('applies custom className', () => {
      const metadata = createMetadata();
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="arr"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          className="custom-class"
        />
      );

      const container = screen.getByTestId('field-arr-fieldset').parentElement;
      expect(container).toHaveClass('custom-class');
    });

    it('renders empty state when array is empty', () => {
      const metadata = createMetadata({ label: 'List' });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="list"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByTestId('field-list-empty')).toBeInTheDocument();
      expect(screen.getByText('No items yet')).toBeInTheDocument();
    });

    it('renders add button', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string', 'Tag');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      expect(addButton).toBeInTheDocument();
      expect(addButton).toHaveTextContent('Add Tag');
    });
  });

  describe('Item Rendering', () => {
    it('renders items with renderItem prop', () => {
      const metadata = createMetadata({ label: 'Names' });
      const itemSchema = createItemMetadata('string', 'Name');

      const renderItem = vi.fn((itemMetadata, path, value, onChange, onBlur, error, index) => (
        <div data-testid={`rendered-${path}`}>
          <label>{itemMetadata.label}</label>
          <input
            type="text"
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ));

      render(
        <ArrayField
          path="names"
          metadata={metadata}
          value={['John', 'Jane']}
          onChange={() => {}}
          itemSchema={itemSchema}
          renderItem={renderItem}
        />
      );

      expect(renderItem).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('rendered-names[0]')).toBeInTheDocument();
      expect(screen.getByTestId('rendered-names[1]')).toBeInTheDocument();
    });

    it('renders placeholder inputs when renderItem is not provided', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string', 'Tag');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['react', 'vue']}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByTestId('field-tags[0]-placeholder')).toBeInTheDocument();
      expect(screen.getByTestId('field-tags[1]-placeholder')).toBeInTheDocument();
      expect(screen.getByLabelText('Tag 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Tag 2')).toBeInTheDocument();
    });

    it('passes correct values to items', () => {
      const metadata = createMetadata({ label: 'Colors' });
      const itemSchema = createItemMetadata('string', 'Color');

      const renderItem = vi.fn((itemMetadata, path, value) => (
        <div data-testid={`item-${path}`}>{String(value || '')}</div>
      ));

      render(
        <ArrayField
          path="colors"
          metadata={metadata}
          value={['red', 'blue', 'green']}
          onChange={() => {}}
          itemSchema={itemSchema}
          renderItem={renderItem}
        />
      );

      expect(screen.getByTestId('item-colors[0]')).toHaveTextContent('red');
      expect(screen.getByTestId('item-colors[1]')).toHaveTextContent('blue');
      expect(screen.getByTestId('item-colors[2]')).toHaveTextContent('green');
    });

    it('renders item index indicators', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('renders remove button for each item', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={['a', 'b']}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByTestId('field-items-remove-0')).toBeInTheDocument();
      expect(screen.getByTestId('field-items-remove-1')).toBeInTheDocument();
    });

    it('passes index to renderItem', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata();

      const renderItem = vi.fn(() => <div>Item</div>);

      render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={() => {}}
          itemSchema={itemSchema}
          renderItem={renderItem}
        />
      );

      expect(renderItem).toHaveBeenCalledWith(
        expect.anything(),
        'items[0]',
        'a',
        expect.anything(),
        undefined,
        undefined,
        0
      );
      expect(renderItem).toHaveBeenCalledWith(
        expect.anything(),
        'items[1]',
        'b',
        expect.anything(),
        undefined,
        undefined,
        1
      );
      expect(renderItem).toHaveBeenCalledWith(
        expect.anything(),
        'items[2]',
        'c',
        expect.anything(),
        undefined,
        undefined,
        2
      );
    });
  });

  describe('Add Functionality', () => {
    it('adds string item with empty default value', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      fireEvent.click(addButton);

      expect(onChange).toHaveBeenCalledWith(['']);
    });

    it('adds number item with 0 default value', () => {
      const metadata = createMetadata({ label: 'Numbers' });
      const itemSchema = createItemMetadata('number');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="numbers"
          metadata={metadata}
          value={[]}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-numbers-add');
      fireEvent.click(addButton);

      expect(onChange).toHaveBeenCalledWith([0]);
    });

    it('adds boolean item with false default value', () => {
      const metadata = createMetadata({ label: 'Flags' });
      const itemSchema = createItemMetadata('boolean');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="flags"
          metadata={metadata}
          value={[]}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-flags-add');
      fireEvent.click(addButton);

      expect(onChange).toHaveBeenCalledWith([false]);
    });

    it('adds object item with empty object default value', () => {
      const metadata = createMetadata({ label: 'Objects' });
      const itemSchema = createItemMetadata('object');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="objects"
          metadata={metadata}
          value={[]}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-objects-add');
      fireEvent.click(addButton);

      expect(onChange).toHaveBeenCalledWith([{}]);
    });

    it('adds item to existing array', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['existing']}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      fireEvent.click(addButton);

      expect(onChange).toHaveBeenCalledWith(['existing', '']);
    });

    it('disables add button when maxItems is reached', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b']}
          onChange={() => {}}
          itemSchema={itemSchema}
          maxItems={2}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      expect(addButton).toBeDisabled();
    });

    it('enables add button when below maxItems', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a']}
          onChange={() => {}}
          itemSchema={itemSchema}
          maxItems={2}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      expect(addButton).not.toBeDisabled();
    });

    it('does not add item when maxItems is reached', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b']}
          onChange={onChange}
          itemSchema={itemSchema}
          maxItems={2}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      fireEvent.click(addButton);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Remove Functionality', () => {
    it('removes item at specific index', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const removeButton = screen.getByTestId('field-tags-remove-1');
      fireEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith(['a', 'c']);
    });

    it('removes first item', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const removeButton = screen.getByTestId('field-tags-remove-0');
      fireEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith(['b', 'c']);
    });

    it('removes last item', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const removeButton = screen.getByTestId('field-tags-remove-2');
      fireEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith(['a', 'b']);
    });

    it('disables remove buttons when minItems is reached', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b']}
          onChange={() => {}}
          itemSchema={itemSchema}
          minItems={2}
        />
      );

      const removeButton0 = screen.getByTestId('field-tags-remove-0');
      const removeButton1 = screen.getByTestId('field-tags-remove-1');
      expect(removeButton0).toBeDisabled();
      expect(removeButton1).toBeDisabled();
    });

    it('enables remove buttons when above minItems', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={() => {}}
          itemSchema={itemSchema}
          minItems={2}
        />
      );

      const removeButton0 = screen.getByTestId('field-tags-remove-0');
      expect(removeButton0).not.toBeDisabled();
    });

    it('does not remove item when minItems is reached', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b']}
          onChange={onChange}
          itemSchema={itemSchema}
          minItems={2}
        />
      );

      const removeButton = screen.getByTestId('field-tags-remove-0');
      fireEvent.click(removeButton);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Change Handling', () => {
    it('handles item change', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const input = screen.getByLabelText('Tag 2') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'updated' } });

      expect(onChange).toHaveBeenCalledWith(['a', 'updated', 'c']);
    });

    it('preserves other items when one item changes', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata('string');
      const onChange = vi.fn();

      render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={['first', 'second', 'third']}
          onChange={onChange}
          itemSchema={itemSchema}
        />
      );

      const input = screen.getByLabelText('Item 1') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'changed' } });

      expect(onChange).toHaveBeenCalledWith(['changed', 'second', 'third']);
    });

    it('handles change through renderItem callback', () => {
      const metadata = createMetadata({ label: 'Numbers' });
      const itemSchema = createItemMetadata('number');
      const onChange = vi.fn();

      const renderItem = vi.fn((itemMetadata, path, value, onItemChange, onBlur, error, index) => (
        <div>
          <button
            data-testid={`change-button-${index}`}
            onClick={() => onItemChange(999)}
          >
            Change
          </button>
        </div>
      ));

      render(
        <ArrayField
          path="numbers"
          metadata={metadata}
          value={[1, 2, 3]}
          onChange={onChange}
          itemSchema={itemSchema}
          renderItem={renderItem}
        />
      );

      const button = screen.getByTestId('change-button-1');
      fireEvent.click(button);

      expect(onChange).toHaveBeenCalledWith([1, 999, 3]);
    });
  });

  describe('Constraints Display', () => {
    it('displays minItems constraint', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          minItems={2}
        />
      );

      const constraint = screen.getByTestId('field-tags-min-constraint');
      expect(constraint).toBeInTheDocument();
      expect(constraint).toHaveTextContent('Minimum: 2');
    });

    it('displays maxItems constraint', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          maxItems={5}
        />
      );

      const constraint = screen.getByTestId('field-tags-max-constraint');
      expect(constraint).toBeInTheDocument();
      expect(constraint).toHaveTextContent('Maximum: 5');
    });

    it('displays both constraints', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          minItems={1}
          maxItems={10}
        />
      );

      expect(screen.getByTestId('field-tags-min-constraint')).toBeInTheDocument();
      expect(screen.getByTestId('field-tags-max-constraint')).toBeInTheDocument();
    });

    it('does not display constraints when not provided', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.queryByTestId('field-tags-min-constraint')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-tags-max-constraint')).not.toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('disables fieldset when disabled prop is true', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a']}
          onChange={() => {}}
          itemSchema={itemSchema}
          disabled={true}
        />
      );

      const fieldset = screen.getByRole('group') as HTMLFieldSetElement;
      expect(fieldset).toBeDisabled();
    });

    it('disables add button when disabled', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          disabled={true}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      expect(addButton).toBeDisabled();
    });

    it('disables remove buttons when disabled', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b']}
          onChange={() => {}}
          itemSchema={itemSchema}
          disabled={true}
        />
      );

      const removeButton = screen.getByTestId('field-tags-remove-0');
      expect(removeButton).toBeDisabled();
    });

    it('passes disabled state to placeholder inputs', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['test']}
          onChange={() => {}}
          itemSchema={itemSchema}
          disabled={true}
        />
      );

      const input = screen.getByLabelText('Tag 1') as HTMLInputElement;
      expect(input).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      const metadata = createMetadata({
        label: 'Tags',
        description: 'Add tags',
      });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toHaveAttribute('aria-invalid', 'false');
      expect(fieldset).toHaveAttribute('aria-describedby');
    });

    it('sets aria-invalid to true when error is present', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          error="At least one tag is required"
        />
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toHaveAttribute('aria-invalid', 'true');
    });

    it('links description with aria-describedby', () => {
      const metadata = createMetadata({
        label: 'Tags',
        description: 'Enter your tags',
      });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const fieldset = screen.getByRole('group');
      const describedBy = fieldset.getAttribute('aria-describedby');
      expect(describedBy).toContain('field-tags-description');
    });

    it('links error with aria-describedby', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          error="Error message"
        />
      );

      const fieldset = screen.getByRole('group');
      const describedBy = fieldset.getAttribute('aria-describedby');
      expect(describedBy).toContain('field-tags-error');
    });

    it('error has role="alert" and aria-live="polite"', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          error="Error message"
        />
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toHaveAttribute('aria-live', 'polite');
    });

    it('add button has aria-label', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string', 'Tag');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-tags-add');
      expect(addButton).toHaveAttribute('aria-label', 'Add Tag');
    });

    it('remove buttons have aria-label with item index', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a', 'b']}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const removeButton0 = screen.getByTestId('field-tags-remove-0');
      const removeButton1 = screen.getByTestId('field-tags-remove-1');
      expect(removeButton0).toHaveAttribute('aria-label', 'Remove item 1');
      expect(removeButton1).toHaveAttribute('aria-label', 'Remove item 2');
    });
  });

  describe('CSS Classes', () => {
    it('applies base CSS classes', () => {
      const metadata = createMetadata({ label: 'Array' });
      const itemSchema = createItemMetadata();

      const { container } = render(
        <ArrayField
          path="arr"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const arrayField = container.querySelector('.formbridge-array-field');
      expect(arrayField).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const metadata = createMetadata({ label: 'Array' });
      const itemSchema = createItemMetadata();

      const { container } = render(
        <ArrayField
          path="arr"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
          className="my-custom-class"
        />
      );

      const arrayField = container.querySelector('.formbridge-array-field');
      expect(arrayField).toHaveClass('my-custom-class');
    });

    it('applies CSS class to fieldset', () => {
      const metadata = createMetadata({ label: 'Array' });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="arr"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toHaveClass('formbridge-array-field__fieldset');
    });

    it('applies CSS class to legend', () => {
      const metadata = createMetadata({ label: 'My Array' });
      const itemSchema = createItemMetadata();

      const { container } = render(
        <ArrayField
          path="arr"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const legend = container.querySelector('.formbridge-array-field__legend');
      expect(legend).toBeInTheDocument();
      expect(legend).toHaveTextContent('My Array');
    });

    it('applies CSS class to items', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata();

      const { container } = render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={['a', 'b']}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const items = container.querySelectorAll('.formbridge-array-field__item');
      expect(items).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('handles null value gracefully', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={null as any}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      // Should render empty state
      expect(screen.getByTestId('field-tags-empty')).toBeInTheDocument();
    });

    it('handles undefined value gracefully', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={undefined as any}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      // Should render empty state
      expect(screen.getByTestId('field-tags-empty')).toBeInTheDocument();
    });

    it('handles non-array value gracefully', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={'not an array' as any}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      // Should render empty state
      expect(screen.getByTestId('field-tags-empty')).toBeInTheDocument();
    });

    it('handles array with null/undefined items', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={[null, undefined, 'valid'] as any}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      // Should render all items
      expect(screen.getByTestId('field-tags-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('field-tags-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('field-tags-item-2')).toBeInTheDocument();
    });

    it('handles itemSchema without label', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata('string', '');

      render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const addButton = screen.getByTestId('field-items-add');
      expect(addButton).toHaveTextContent('Add Item');
    });

    it('handles zero as minItems', () => {
      const metadata = createMetadata({ label: 'Tags' });
      const itemSchema = createItemMetadata('string');

      render(
        <ArrayField
          path="tags"
          metadata={metadata}
          value={['a']}
          onChange={() => {}}
          itemSchema={itemSchema}
          minItems={0}
        />
      );

      const removeButton = screen.getByTestId('field-tags-remove-0');
      expect(removeButton).not.toBeDisabled();
    });
  });

  describe('Data Test IDs', () => {
    it('sets data-testid on fieldset', () => {
      const metadata = createMetadata({ label: 'Test' });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="myArray"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByTestId('field-myArray-fieldset')).toBeInTheDocument();
    });

    it('sets data-field-path on container', () => {
      const metadata = createMetadata({ label: 'Test' });
      const itemSchema = createItemMetadata();

      const { container } = render(
        <ArrayField
          path="testPath"
          metadata={metadata}
          value={[]}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      const arrayField = container.querySelector('[data-field-path="testPath"]');
      expect(arrayField).toBeInTheDocument();
    });

    it('sets data-testid on items', () => {
      const metadata = createMetadata({ label: 'Items' });
      const itemSchema = createItemMetadata();

      render(
        <ArrayField
          path="items"
          metadata={metadata}
          value={['a', 'b', 'c']}
          onChange={() => {}}
          itemSchema={itemSchema}
        />
      );

      expect(screen.getByTestId('field-items-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('field-items-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('field-items-item-2')).toBeInTheDocument();
    });
  });
});
