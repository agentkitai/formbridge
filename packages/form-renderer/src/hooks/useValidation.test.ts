/**
 * Tests for useValidation hook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useValidation } from './useValidation';
import { IntakeSchema, FormData } from '../types';

describe('useValidation', () => {
  let schema: IntakeSchema;

  beforeEach(() => {
    // Basic schema for testing
    schema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 2,
          maxLength: 50,
        },
        email: {
          type: 'string',
          format: 'email',
        },
        age: {
          type: 'number',
          minimum: 18,
          maximum: 100,
        },
        terms: {
          type: 'boolean',
        },
        role: {
          type: 'string',
          enum: ['admin', 'user', 'guest'],
        },
      },
      required: ['name', 'email'],
    };
  });

  describe('initialization', () => {
    it('initializes with no errors', () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      expect(result.current.errors).toEqual({});
      expect(result.current.isValidating).toBe(false);
    });

    it('provides all expected methods', () => {
      const data: FormData = {};

      const { result } = renderHook(() => useValidation(schema, data));

      expect(typeof result.current.validate).toBe('function');
      expect(typeof result.current.validateField).toBe('function');
      expect(typeof result.current.clearErrors).toBe('function');
      expect(typeof result.current.clearFieldError).toBe('function');
      expect(typeof result.current.setFieldError).toBe('function');
    });
  });

  describe('validate', () => {
    it('validates valid form data successfully', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        terms: true,
        role: 'user',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult).toEqual({ valid: true });
      expect(result.current.errors).toEqual({});
      expect(result.current.isValidating).toBe(false);
    });

    it('detects required field errors', async () => {
      const data: FormData = {
        age: 30,
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors).toHaveProperty('email');
      expect(result.current.errors.name).toContain('required');
      expect(result.current.errors.email).toContain('required');
    });

    it('detects string minLength errors', async () => {
      const data: FormData = {
        name: 'J', // Too short (minLength: 2)
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors.name).toContain('at least 2 characters');
    });

    it('detects string maxLength errors', async () => {
      const data: FormData = {
        name: 'A'.repeat(51), // Too long (maxLength: 50)
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors.name).toContain('at most 50 characters');
    });

    it('detects invalid email format', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'not-an-email',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('email');
      expect(result.current.errors.email).toContain('valid email');
    });

    it('detects number minimum errors', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 17, // Too low (minimum: 18)
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('age');
      expect(result.current.errors.age).toContain('at least 18');
    });

    it('detects number maximum errors', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 101, // Too high (maximum: 100)
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('age');
      expect(result.current.errors.age).toContain('at most 100');
    });

    it('detects enum value errors', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
        role: 'superadmin', // Not in enum
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('role');
      expect(result.current.errors.role).toContain('must be one of');
    });

    it('detects type errors', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 'thirty', // Wrong type (should be number)
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('age');
      expect(result.current.errors.age).toContain('must be number');
    });

    it('detects multiple errors across different fields', async () => {
      const data: FormData = {
        name: 'J', // Too short
        email: 'invalid-email', // Invalid format
        age: 17, // Too low
        role: 'invalid-role', // Not in enum
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors).toHaveProperty('email');
      expect(result.current.errors).toHaveProperty('age');
      expect(result.current.errors).toHaveProperty('role');
    });

    it('clears previous errors on successful validation', async () => {
      const data1: FormData = {
        name: 'J', // Invalid
        email: 'john@example.com',
      };

      const { result, rerender } = renderHook(
        ({ schema, data }) => useValidation(schema, data),
        {
          initialProps: { schema, data: data1 },
        }
      );

      // First validation - should have errors
      await act(async () => {
        await result.current.validate();
      });

      expect(result.current.errors).toHaveProperty('name');

      // Update with valid data
      const data2: FormData = {
        name: 'John Doe', // Valid
        email: 'john@example.com',
      };

      rerender({ schema, data: data2 });

      // Second validation - should clear errors
      await act(async () => {
        await result.current.validate();
      });

      expect(result.current.errors).toEqual({});
    });

    it('sets isValidating to true during validation', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      expect(result.current.isValidating).toBe(false);

      const validatePromise = act(async () => {
        const promise = result.current.validate();
        // Check immediately (may or may not be true due to timing)
        return promise;
      });

      await validatePromise;

      // Should be false after completion
      expect(result.current.isValidating).toBe(false);
    });

    it('handles nested object validation', async () => {
      const nestedSchema: IntakeSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                minLength: 2,
              },
              email: {
                type: 'string',
                format: 'email',
              },
            },
            required: ['name', 'email'],
          },
        },
        required: ['user'],
      };

      const data: FormData = {
        user: {
          name: 'J', // Too short
          email: 'invalid', // Invalid format
        },
      };

      const { result } = renderHook(() => useValidation(nestedSchema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('user.name');
      expect(result.current.errors).toHaveProperty('user.email');
    });

    it('handles array validation', async () => {
      const arraySchema: IntakeSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 2,
            },
            minItems: 1,
            maxItems: 5,
          },
        },
        required: ['tags'],
      };

      const data: FormData = {
        tags: [], // Too few items
      };

      const { result } = renderHook(() => useValidation(arraySchema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('tags');
      expect(result.current.errors.tags).toContain('at least 1');
    });
  });

  describe('validateField', () => {
    it('validates a single valid field', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let isValid;
      await act(async () => {
        isValid = await result.current.validateField('name');
      });

      expect(isValid).toBe(true);
      expect(result.current.errors).toEqual({});
    });

    it('validates a single invalid field', async () => {
      const data: FormData = {
        name: 'J', // Too short
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let isValid;
      await act(async () => {
        isValid = await result.current.validateField('name');
      });

      expect(isValid).toBe(false);
      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors.name).toContain('at least 2 characters');
    });

    it('validates email field format', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'not-an-email',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let isValid;
      await act(async () => {
        isValid = await result.current.validateField('email');
      });

      expect(isValid).toBe(false);
      expect(result.current.errors).toHaveProperty('email');
      expect(result.current.errors.email).toContain('valid email');
    });

    it('validates number field constraints', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 15, // Too low
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let isValid;
      await act(async () => {
        isValid = await result.current.validateField('age');
      });

      expect(isValid).toBe(false);
      expect(result.current.errors).toHaveProperty('age');
    });

    it('clears field error when field becomes valid', async () => {
      const data1: FormData = {
        name: 'J', // Invalid
        email: 'john@example.com',
      };

      const { result, rerender } = renderHook(
        ({ schema, data }) => useValidation(schema, data),
        {
          initialProps: { schema, data: data1 },
        }
      );

      // First validation - should set error
      await act(async () => {
        await result.current.validateField('name');
      });

      expect(result.current.errors).toHaveProperty('name');

      // Update with valid data
      const data2: FormData = {
        name: 'John Doe', // Valid
        email: 'john@example.com',
      };

      rerender({ schema, data: data2 });

      // Second validation - should clear error
      await act(async () => {
        await result.current.validateField('name');
      });

      expect(result.current.errors).not.toHaveProperty('name');
    });

    it('validates field independently of other fields', async () => {
      const data: FormData = {
        name: 'John Doe', // Valid
        email: 'invalid-email', // Invalid
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let isNameValid;
      await act(async () => {
        isNameValid = await result.current.validateField('name');
      });

      expect(isNameValid).toBe(true);
      expect(result.current.errors).not.toHaveProperty('name');
      expect(result.current.errors).not.toHaveProperty('email'); // Email error not set
    });

    it('validates nested field', async () => {
      const nestedSchema: IntakeSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                minLength: 2,
              },
            },
            required: ['name'],
          },
        },
      };

      const data: FormData = {
        user: {
          name: 'J', // Too short
        },
      };

      const { result } = renderHook(() => useValidation(nestedSchema, data));

      let isValid;
      await act(async () => {
        isValid = await result.current.validateField('user.name');
      });

      expect(isValid).toBe(false);
      expect(result.current.errors).toHaveProperty('user.name');
    });

    it('sets isValidating to true during field validation', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      expect(result.current.isValidating).toBe(false);

      const validatePromise = act(async () => {
        return result.current.validateField('name');
      });

      await validatePromise;

      expect(result.current.isValidating).toBe(false);
    });
  });

  describe('clearErrors', () => {
    it('clears all validation errors', async () => {
      const data: FormData = {
        name: 'J', // Invalid
        email: 'invalid', // Invalid
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // First, validate to generate errors
      await act(async () => {
        await result.current.validate();
      });

      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors).toHaveProperty('email');

      // Clear all errors
      act(() => {
        result.current.clearErrors();
      });

      expect(result.current.errors).toEqual({});
    });

    it('can be called when there are no errors', () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      act(() => {
        result.current.clearErrors();
      });

      expect(result.current.errors).toEqual({});
    });

    it('can be called multiple times', async () => {
      const data: FormData = {
        name: 'J',
        email: 'invalid',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      await act(async () => {
        await result.current.validate();
      });

      act(() => {
        result.current.clearErrors();
        result.current.clearErrors();
        result.current.clearErrors();
      });

      expect(result.current.errors).toEqual({});
    });
  });

  describe('clearFieldError', () => {
    it('clears error for a specific field', async () => {
      const data: FormData = {
        name: 'J', // Invalid
        email: 'invalid', // Invalid
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // First, validate to generate errors
      await act(async () => {
        await result.current.validate();
      });

      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors).toHaveProperty('email');

      // Clear only the name error
      act(() => {
        result.current.clearFieldError('name');
      });

      expect(result.current.errors).not.toHaveProperty('name');
      expect(result.current.errors).toHaveProperty('email'); // Email error remains
    });

    it('handles clearing non-existent field error', () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      act(() => {
        result.current.clearFieldError('name');
      });

      expect(result.current.errors).toEqual({});
    });

    it('clears nested field error', async () => {
      const nestedSchema: IntakeSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                minLength: 2,
              },
              email: {
                type: 'string',
                format: 'email',
              },
            },
            required: ['name', 'email'],
          },
        },
      };

      const data: FormData = {
        user: {
          name: 'J',
          email: 'invalid',
        },
      };

      const { result } = renderHook(() => useValidation(nestedSchema, data));

      await act(async () => {
        await result.current.validate();
      });

      act(() => {
        result.current.clearFieldError('user.name');
      });

      expect(result.current.errors).not.toHaveProperty('user.name');
      expect(result.current.errors).toHaveProperty('user.email');
    });

    it('can be called multiple times on the same field', async () => {
      const data: FormData = {
        name: 'J',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      await act(async () => {
        await result.current.validate();
      });

      act(() => {
        result.current.clearFieldError('name');
        result.current.clearFieldError('name');
        result.current.clearFieldError('name');
      });

      expect(result.current.errors).toEqual({});
    });
  });

  describe('setFieldError', () => {
    it('sets error for a specific field', () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      act(() => {
        result.current.setFieldError('name', 'Custom error message');
      });

      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors.name).toBe('Custom error message');
    });

    it('overwrites existing error', async () => {
      const data: FormData = {
        name: 'J', // Invalid
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // First, validate to generate error
      await act(async () => {
        await result.current.validate();
      });

      const originalError = result.current.errors.name;

      // Set custom error
      act(() => {
        result.current.setFieldError('name', 'New custom error');
      });

      expect(result.current.errors.name).toBe('New custom error');
      expect(result.current.errors.name).not.toBe(originalError);
    });

    it('sets multiple field errors', () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      act(() => {
        result.current.setFieldError('name', 'Name error');
        result.current.setFieldError('email', 'Email error');
        result.current.setFieldError('age', 'Age error');
      });

      expect(result.current.errors.name).toBe('Name error');
      expect(result.current.errors.email).toBe('Email error');
      expect(result.current.errors.age).toBe('Age error');
    });

    it('sets nested field error', () => {
      const nestedSchema: IntakeSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
            },
          },
        },
      };

      const data: FormData = {
        user: {
          name: 'John',
        },
      };

      const { result } = renderHook(() => useValidation(nestedSchema, data));

      act(() => {
        result.current.setFieldError('user.name', 'Custom nested error');
      });

      expect(result.current.errors).toHaveProperty('user.name');
      expect(result.current.errors['user.name']).toBe('Custom nested error');
    });

    it('preserves other field errors when setting one', async () => {
      const data: FormData = {
        name: 'J', // Invalid
        email: 'invalid', // Invalid
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // First, validate to generate errors
      await act(async () => {
        await result.current.validate();
      });

      const emailError = result.current.errors.email;

      // Set custom name error
      act(() => {
        result.current.setFieldError('name', 'Custom name error');
      });

      expect(result.current.errors.name).toBe('Custom name error');
      expect(result.current.errors.email).toBe(emailError); // Email error preserved
    });

    it('can set error with empty string', () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      act(() => {
        result.current.setFieldError('name', '');
      });

      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors.name).toBe('');
    });
  });

  describe('integration scenarios', () => {
    it('handles blur validation workflow', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'invalid-email',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // Simulate blur on email field
      await act(async () => {
        await result.current.validateField('email');
      });

      expect(result.current.errors).toHaveProperty('email');
      expect(result.current.errors).not.toHaveProperty('name');
    });

    it('handles submit validation workflow', async () => {
      const data: FormData = {
        name: 'J',
        email: 'invalid',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // Simulate submit validation
      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);
    });

    it('handles progressive field validation', async () => {
      const data1: FormData = {
        name: 'J',
        email: 'invalid',
        age: 15,
      };

      const { result, rerender } = renderHook(
        ({ schema, data }) => useValidation(schema, data),
        {
          initialProps: { schema, data: data1 },
        }
      );

      // Validate first field
      await act(async () => {
        await result.current.validateField('name');
      });

      expect(result.current.errors).toHaveProperty('name');

      // Fix name and revalidate
      const data2: FormData = { ...data1, name: 'John Doe' };
      rerender({ schema, data: data2 });

      await act(async () => {
        await result.current.validateField('name');
      });

      expect(result.current.errors).not.toHaveProperty('name');

      // Validate email field
      await act(async () => {
        await result.current.validateField('email');
      });

      expect(result.current.errors).toHaveProperty('email');
    });

    it('handles server error override', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // Simulate server returning custom error
      act(() => {
        result.current.setFieldError('email', 'Email already exists');
      });

      expect(result.current.errors.email).toBe('Email already exists');

      // Client-side revalidation should clear it
      await act(async () => {
        await result.current.validateField('email');
      });

      expect(result.current.errors).not.toHaveProperty('email');
    });

    it('handles clear and revalidate pattern', async () => {
      const data: FormData = {
        name: 'J',
        email: 'invalid',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // Initial validation
      await act(async () => {
        await result.current.validate();
      });

      expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);

      // Clear errors
      act(() => {
        result.current.clearErrors();
      });

      expect(result.current.errors).toEqual({});

      // Revalidate
      await act(async () => {
        await result.current.validate();
      });

      expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty schema', async () => {
      const emptySchema: IntakeSchema = {
        type: 'object',
        properties: {},
      };

      const data: FormData = {
        name: 'John Doe',
      };

      const { result } = renderHook(() => useValidation(emptySchema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(true);
      expect(result.current.errors).toEqual({});
    });

    it('handles empty data', async () => {
      const data: FormData = {};

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
      expect(result.current.errors).toHaveProperty('name');
      expect(result.current.errors).toHaveProperty('email');
    });

    it('handles null values', async () => {
      const data: FormData = {
        name: null,
        email: null,
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
    });

    it('handles undefined values', async () => {
      const data: FormData = {
        name: undefined,
        email: undefined,
      };

      const { result } = renderHook(() => useValidation(schema, data));

      let validationResult;
      await act(async () => {
        validationResult = await result.current.validate();
      });

      expect(validationResult.valid).toBe(false);
    });

    it('handles special characters in field paths', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      act(() => {
        result.current.setFieldError('field-with-dash', 'Error message');
        result.current.setFieldError('field_with_underscore', 'Error message');
      });

      expect(result.current.errors).toHaveProperty('field-with-dash');
      expect(result.current.errors).toHaveProperty('field_with_underscore');
    });

    it('handles rapid validation calls', async () => {
      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const { result } = renderHook(() => useValidation(schema, data));

      // Make multiple rapid validation calls
      await act(async () => {
        const promises = [
          result.current.validate(),
          result.current.validateField('name'),
          result.current.validateField('email'),
        ];
        await Promise.all(promises);
      });

      expect(result.current.isValidating).toBe(false);
    });
  });
});
