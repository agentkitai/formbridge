/**
 * Tests for useFormState hook
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormState } from './useFormState';
import { FormData } from '../types';

describe('useFormState', () => {
  describe('initialization', () => {
    it('initializes with empty data by default', () => {
      const { result } = renderHook(() => useFormState());

      expect(result.current.data).toEqual({});
      expect(result.current.isDirty).toBe(false);
    });

    it('initializes with provided initial data', () => {
      const initialData: FormData = {
        name: 'John Doe',
        age: 30,
        active: true,
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isDirty).toBe(false);
    });

    it('initializes with nested object data', () => {
      const initialData: FormData = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
            zip: '10001',
          },
        },
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isDirty).toBe(false);
    });

    it('initializes with array data', () => {
      const initialData: FormData = {
        tags: ['tag1', 'tag2', 'tag3'],
        items: [
          { name: 'Item 1', quantity: 5 },
          { name: 'Item 2', quantity: 10 },
        ],
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('setField', () => {
    it('sets a top-level field value', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', 'Jane');
      });

      expect(result.current.data.name).toBe('Jane');
      expect(result.current.isDirty).toBe(true);
    });

    it('adds a new top-level field', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('age', 30);
      });

      expect(result.current.data).toEqual({ name: 'John', age: 30 });
      expect(result.current.isDirty).toBe(true);
    });

    it('sets a nested field value', () => {
      const initialData: FormData = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
          },
        },
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setField('user.address.city', 'Boston');
      });

      expect(result.current.data).toEqual({
        user: {
          name: 'John',
          address: {
            city: 'Boston',
          },
        },
      });
      expect(result.current.isDirty).toBe(true);
    });

    it('creates nested structure when setting deep field', () => {
      const { result } = renderHook(() => useFormState({}));

      act(() => {
        result.current.setField('user.address.city', 'New York');
      });

      expect(result.current.data).toEqual({
        user: {
          address: {
            city: 'New York',
          },
        },
      });
      expect(result.current.isDirty).toBe(true);
    });

    it('sets field to null', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', null);
      });

      expect(result.current.data.name).toBe(null);
      expect(result.current.isDirty).toBe(true);
    });

    it('sets field to undefined', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', undefined);
      });

      expect(result.current.data.name).toBe(undefined);
      expect(result.current.isDirty).toBe(true);
    });

    it('sets field to empty string', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', '');
      });

      expect(result.current.data.name).toBe('');
      expect(result.current.isDirty).toBe(true);
    });

    it('sets field to zero', () => {
      const { result } = renderHook(() => useFormState({ age: 30 }));

      act(() => {
        result.current.setField('age', 0);
      });

      expect(result.current.data.age).toBe(0);
      expect(result.current.isDirty).toBe(true);
    });

    it('sets field to false', () => {
      const { result } = renderHook(() => useFormState({ active: true }));

      act(() => {
        result.current.setField('active', false);
      });

      expect(result.current.data.active).toBe(false);
      expect(result.current.isDirty).toBe(true);
    });

    it('sets multiple fields sequentially', () => {
      const { result } = renderHook(() => useFormState({}));

      act(() => {
        result.current.setField('name', 'John');
        result.current.setField('age', 30);
        result.current.setField('active', true);
      });

      expect(result.current.data).toEqual({
        name: 'John',
        age: 30,
        active: true,
      });
      expect(result.current.isDirty).toBe(true);
    });

    it('preserves other fields when updating one field', () => {
      const initialData: FormData = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setField('age', 31);
      });

      expect(result.current.data).toEqual({
        name: 'John',
        age: 31,
        email: 'john@example.com',
      });
    });

    it('preserves sibling nested fields', () => {
      const initialData: FormData = {
        user: {
          name: 'John',
          email: 'john@example.com',
          address: {
            city: 'New York',
            zip: '10001',
          },
        },
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setField('user.address.city', 'Boston');
      });

      expect(result.current.data).toEqual({
        user: {
          name: 'John',
          email: 'john@example.com',
          address: {
            city: 'Boston',
            zip: '10001',
          },
        },
      });
    });
  });

  describe('setFields', () => {
    it('sets multiple fields at once', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setFields({
          age: 30,
          email: 'john@example.com',
        });
      });

      expect(result.current.data).toEqual({
        name: 'John',
        age: 30,
        email: 'john@example.com',
      });
      expect(result.current.isDirty).toBe(true);
    });

    it('overwrites existing fields', () => {
      const initialData: FormData = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setFields({
          name: 'Jane',
          email: 'jane@example.com',
        });
      });

      expect(result.current.data).toEqual({
        name: 'Jane',
        age: 30,
        email: 'jane@example.com',
      });
      expect(result.current.isDirty).toBe(true);
    });

    it('merges with existing data', () => {
      const initialData: FormData = {
        name: 'John',
        age: 30,
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setFields({
          email: 'john@example.com',
          active: true,
        });
      });

      expect(result.current.data).toEqual({
        name: 'John',
        age: 30,
        email: 'john@example.com',
        active: true,
      });
    });

    it('handles empty object', () => {
      const initialData: FormData = {
        name: 'John',
        age: 30,
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setFields({});
      });

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isDirty).toBe(true);
    });

    it('handles nested object updates', () => {
      const initialData: FormData = {
        user: {
          name: 'John',
        },
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setFields({
          user: {
            name: 'Jane',
            email: 'jane@example.com',
          },
        });
      });

      expect(result.current.data).toEqual({
        user: {
          name: 'Jane',
          email: 'jane@example.com',
        },
      });
    });

    it('can completely replace data', () => {
      const initialData: FormData = {
        name: 'John',
        age: 30,
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setFields({
          name: 'Jane',
          age: 25,
          email: 'jane@example.com',
        });
      });

      expect(result.current.data.name).toBe('Jane');
      expect(result.current.data.age).toBe(25);
      expect(result.current.data.email).toBe('jane@example.com');
    });
  });

  describe('getField', () => {
    it('gets a top-level field value', () => {
      const initialData: FormData = {
        name: 'John',
        age: 30,
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.getField('name')).toBe('John');
      expect(result.current.getField('age')).toBe(30);
    });

    it('gets a nested field value', () => {
      const initialData: FormData = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
            zip: '10001',
          },
        },
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.getField('user.name')).toBe('John');
      expect(result.current.getField('user.address.city')).toBe('New York');
      expect(result.current.getField('user.address.zip')).toBe('10001');
    });

    it('returns undefined for non-existent field', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      expect(result.current.getField('age')).toBe(undefined);
    });

    it('returns undefined for non-existent nested field', () => {
      const initialData: FormData = {
        user: {
          name: 'John',
        },
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.getField('user.address.city')).toBe(undefined);
    });

    it('gets null value correctly', () => {
      const initialData: FormData = {
        name: null,
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.getField('name')).toBe(null);
    });

    it('gets empty string correctly', () => {
      const initialData: FormData = {
        name: '',
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.getField('name')).toBe('');
    });

    it('gets zero correctly', () => {
      const initialData: FormData = {
        age: 0,
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.getField('age')).toBe(0);
    });

    it('gets false correctly', () => {
      const initialData: FormData = {
        active: false,
      };

      const { result } = renderHook(() => useFormState(initialData));

      expect(result.current.getField('active')).toBe(false);
    });

    it('reflects updated values', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', 'Jane');
      });

      expect(result.current.getField('name')).toBe('Jane');
    });
  });

  describe('reset', () => {
    it('resets form to initial state', () => {
      const initialData: FormData = {
        name: 'John',
        age: 30,
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setField('name', 'Jane');
        result.current.setField('age', 31);
      });

      expect(result.current.data).toEqual({
        name: 'Jane',
        age: 31,
      });
      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isDirty).toBe(false);
    });

    it('resets to empty object when initialized empty', () => {
      const { result } = renderHook(() => useFormState({}));

      act(() => {
        result.current.setField('name', 'John');
        result.current.setField('age', 30);
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual({});
      expect(result.current.isDirty).toBe(false);
    });

    it('can be called multiple times', () => {
      const initialData: FormData = {
        name: 'John',
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setField('name', 'Jane');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual(initialData);

      act(() => {
        result.current.setField('name', 'Bob');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual(initialData);
    });

    it('resets nested data correctly', () => {
      const initialData: FormData = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
          },
        },
      };

      const { result } = renderHook(() => useFormState(initialData));

      act(() => {
        result.current.setField('user.address.city', 'Boston');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual(initialData);
    });
  });

  describe('isDirty', () => {
    it('is false initially', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      expect(result.current.isDirty).toBe(false);
    });

    it('becomes true after setField', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', 'Jane');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('becomes true after setFields', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setFields({ age: 30 });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('becomes true even if value is set to same value', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', 'John');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('becomes false after reset', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', 'Jane');
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('becomes true again after reset and modification', () => {
      const { result } = renderHook(() => useFormState({ name: 'John' }));

      act(() => {
        result.current.setField('name', 'Jane');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setField('name', 'Bob');
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles special characters in field names', () => {
      const { result } = renderHook(() => useFormState({}));

      act(() => {
        result.current.setField('user-name', 'John');
        result.current.setField('user_email', 'john@example.com');
      });

      expect(result.current.data['user-name']).toBe('John');
      expect(result.current.data['user_email']).toBe('john@example.com');
    });

    it('handles array values', () => {
      const { result } = renderHook(() => useFormState({}));

      act(() => {
        result.current.setField('tags', ['tag1', 'tag2', 'tag3']);
      });

      expect(result.current.data.tags).toEqual(['tag1', 'tag2', 'tag3']);
      expect(result.current.getField('tags')).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('handles object values', () => {
      const { result } = renderHook(() => useFormState({}));

      const address = {
        street: '123 Main St',
        city: 'New York',
        zip: '10001',
      };

      act(() => {
        result.current.setField('address', address);
      });

      expect(result.current.data.address).toEqual(address);
      expect(result.current.getField('address')).toEqual(address);
    });

    it('handles deeply nested paths', () => {
      const { result } = renderHook(() => useFormState({}));

      act(() => {
        result.current.setField('a.b.c.d.e.f', 'deep value');
      });

      expect(result.current.getField('a.b.c.d.e.f')).toBe('deep value');
    });

    it('handles rapid successive updates', () => {
      const { result } = renderHook(() => useFormState({}));

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.setField('counter', i);
        }
      });

      expect(result.current.data.counter).toBe(9);
    });

    it('maintains reference stability for callbacks', () => {
      const { result, rerender } = renderHook(() => useFormState({}));

      const firstSetField = result.current.setField;
      const firstGetField = result.current.getField;
      const firstSetFields = result.current.setFields;
      const firstReset = result.current.reset;

      rerender();

      expect(result.current.setField).toBe(firstSetField);
      expect(result.current.getField).not.toBe(firstGetField); // getField depends on data
      expect(result.current.setFields).toBe(firstSetFields);
      expect(result.current.reset).not.toBe(firstReset); // reset depends on initialData
    });
  });
});
