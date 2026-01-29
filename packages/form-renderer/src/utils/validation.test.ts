/**
 * Tests for validation utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateForm,
  validateField,
  getErrorMap,
  getFieldError,
  hasFieldError,
  clearValidatorCache,
  getValidatorCacheSize,
} from './validation';
import { IntakeSchema, FormData } from '../types/schema';
import { FieldError } from '../types/error';

describe('validation', () => {
  beforeEach(() => {
    // Clear cache before each test for isolation
    clearValidatorCache();
  });

  describe('validateForm', () => {
    describe('valid data', () => {
      it('validates simple valid data', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name'],
        };

        const data: FormData = {
          name: 'John Doe',
          age: 30,
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
      });

      it('validates data with all field types', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
            active: { type: 'boolean' },
            tags: { type: 'array', items: { type: 'string' } },
            address: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
            },
          },
        };

        const data: FormData = {
          name: 'John',
          age: 30,
          active: true,
          tags: ['tag1', 'tag2'],
          address: {
            city: 'New York',
          },
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(true);
      });

      it('validates data with optional fields omitted', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name'],
        };

        const data: FormData = {
          name: 'John',
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(true);
      });

      it('validates empty object when no required fields', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        };

        const data: FormData = {};

        const result = validateForm(schema, data);

        expect(result.valid).toBe(true);
      });
    });

    describe('required fields', () => {
      it('detects missing required field', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name', 'email'],
        };

        const data: FormData = {
          name: 'John',
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0]).toMatchObject({
          path: 'email',
          code: 'required',
          message: expect.stringContaining('required'),
        });
      });

      it('detects multiple missing required fields', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          required: ['name', 'email', 'phone'],
        };

        const data: FormData = {};

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(3);
        expect(result.errors!.map((e) => e.path).sort()).toEqual([
          'email',
          'name',
          'phone',
        ]);
      });

      it('detects missing nested required field', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                city: { type: 'string' },
                state: { type: 'string' },
              },
              required: ['city'],
            },
          },
          required: ['address'],
        };

        const data: FormData = {
          address: {
            state: 'NY',
          },
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0].path).toBe('address.city');
        expect(result.errors![0].code).toBe('required');
      });
    });

    describe('type validation', () => {
      it('detects invalid string type', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        };

        const data: FormData = {
          name: 123,
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0]).toMatchObject({
          path: 'name',
          code: 'invalid_type',
          expected: 'string',
        });
      });

      it('detects invalid number type', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            age: { type: 'number' },
          },
        };

        const data: FormData = {
          age: 'thirty',
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'age',
          code: 'invalid_type',
          expected: 'number',
        });
      });

      it('detects invalid boolean type', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
          },
        };

        const data: FormData = {
          active: 'true',
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'active',
          code: 'invalid_type',
          expected: 'boolean',
        });
      });

      it('detects invalid array type', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
          },
        };

        const data: FormData = {
          tags: 'not-an-array',
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'tags',
          code: 'invalid_type',
          expected: 'array',
        });
      });

      it('detects invalid object type', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
            },
          },
        };

        const data: FormData = {
          address: 'not-an-object',
        };

        const result = validateForm(schema, data);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'address',
          code: 'invalid_type',
          expected: 'object',
        });
      });
    });

    describe('string validation', () => {
      it('validates minLength constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 3 },
          },
        };

        const validData: FormData = { name: 'John' };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { name: 'Jo' };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'name',
          code: 'too_short',
          expected: 3,
        });
      });

      it('validates maxLength constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 10 },
          },
        };

        const validData: FormData = { name: 'John' };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { name: 'John Jacob Jingleheimer Schmidt' };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'name',
          code: 'too_long',
          expected: 10,
        });
      });

      it('validates pattern constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            code: { type: 'string', pattern: '^[A-Z]{3}$' },
          },
        };

        const validData: FormData = { code: 'ABC' };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { code: 'abc' };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'code',
          code: 'invalid_format',
        });
      });

      it('validates email format', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
          },
        };

        const validData: FormData = { email: 'john@example.com' };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { email: 'not-an-email' };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'email',
          code: 'invalid_format',
          expected: 'email',
        });
      });

      it('validates uri format', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            website: { type: 'string', format: 'uri' },
          },
        };

        const validData: FormData = { website: 'https://example.com' };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { website: 'not-a-url' };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'website',
          code: 'invalid_format',
          expected: 'uri',
        });
      });

      it('validates date format', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            birthdate: { type: 'string', format: 'date' },
          },
        };

        const validData: FormData = { birthdate: '2000-01-01' };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { birthdate: '01/01/2000' };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'birthdate',
          code: 'invalid_format',
          expected: 'date',
        });
      });
    });

    describe('number validation', () => {
      it('validates minimum constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            age: { type: 'number', minimum: 18 },
          },
        };

        const validData: FormData = { age: 18 };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { age: 17 };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'age',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('at least 18');
      });

      it('validates maximum constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            score: { type: 'number', maximum: 100 },
          },
        };

        const validData: FormData = { score: 100 };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { score: 101 };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'score',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('at most 100');
      });

      it('validates exclusiveMinimum constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            price: { type: 'number', exclusiveMinimum: 0 },
          },
        };

        const validData: FormData = { price: 0.01 };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { price: 0 };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'price',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('greater than 0');
      });

      it('validates exclusiveMaximum constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            discount: { type: 'number', exclusiveMaximum: 1 },
          },
        };

        const validData: FormData = { discount: 0.99 };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { discount: 1 };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'discount',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('less than 1');
      });

      it('validates multipleOf constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            quantity: { type: 'number', multipleOf: 5 },
          },
        };

        const validData: FormData = { quantity: 10 };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { quantity: 7 };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'quantity',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('multiple of 5');
      });
    });

    describe('enum validation', () => {
      it('validates enum constraint with strings', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          },
        };

        const validData: FormData = { status: 'draft' };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { status: 'deleted' };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'status',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('one of');
      });

      it('validates enum constraint with numbers', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            priority: { type: 'number', enum: [1, 2, 3, 4, 5] },
          },
        };

        const validData: FormData = { priority: 3 };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { priority: 6 };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'priority',
          code: 'invalid_value',
        });
      });
    });

    describe('array validation', () => {
      it('validates minItems constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' }, minItems: 2 },
          },
        };

        const validData: FormData = { tags: ['tag1', 'tag2'] };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { tags: ['tag1'] };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'tags',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('at least 2 items');
      });

      it('validates maxItems constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          },
        };

        const validData: FormData = { tags: ['tag1', 'tag2'] };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { tags: ['tag1', 'tag2', 'tag3', 'tag4'] };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'tags',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('at most 3 items');
      });

      it('validates uniqueItems constraint', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          },
        };

        const validData: FormData = { tags: ['tag1', 'tag2', 'tag3'] };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { tags: ['tag1', 'tag2', 'tag1'] };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0]).toMatchObject({
          path: 'tags',
          code: 'invalid_value',
        });
        expect(result.errors![0].message).toContain('unique items');
      });

      it('validates array item types', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            scores: { type: 'array', items: { type: 'number' } },
          },
        };

        const validData: FormData = { scores: [1, 2, 3] };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = { scores: [1, 'two', 3] };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0].path).toBe('scores.1');
        expect(result.errors![0].code).toBe('invalid_type');
      });
    });

    describe('nested object validation', () => {
      it('validates nested object properties', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                zipCode: { type: 'string', pattern: '^\\d{5}$' },
              },
              required: ['city'],
            },
          },
        };

        const validData: FormData = {
          address: {
            street: '123 Main St',
            city: 'New York',
            zipCode: '10001',
          },
        };
        expect(validateForm(schema, validData).valid).toBe(true);

        const invalidData: FormData = {
          address: {
            street: '123 Main St',
            zipCode: 'invalid',
          },
        };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors!.map((e) => e.path).sort()).toEqual([
          'address.city',
          'address.zipCode',
        ]);
      });

      it('validates deeply nested properties', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                profile: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                  },
                  required: ['email'],
                },
              },
            },
          },
        };

        const invalidData: FormData = {
          user: {
            profile: {
              email: 'invalid-email',
            },
          },
        };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors![0].path).toBe('user.profile.email');
      });
    });

    describe('multiple errors', () => {
      it('collects all errors from multiple fields', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 3 },
            email: { type: 'string', format: 'email' },
            age: { type: 'number', minimum: 0 },
          },
          required: ['name', 'email'],
        };

        const invalidData: FormData = {
          name: 'Jo',
          email: 'invalid',
          age: -5,
        };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(3);
      });

      it('collects multiple errors for the same field', () => {
        const schema: IntakeSchema = {
          type: 'object',
          properties: {
            password: {
              type: 'string',
              minLength: 8,
              maxLength: 20,
              pattern: '^(?=.*[A-Z])(?=.*[0-9])',
            },
          },
        };

        const invalidData: FormData = {
          password: 'short',
        };
        const result = validateForm(schema, invalidData);

        expect(result.valid).toBe(false);
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors!.every((e) => e.path === 'password')).toBe(true);
      });
    });
  });

  describe('validateField', () => {
    it('validates a single field successfully', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
          email: { type: 'string', format: 'email' },
        },
      };

      const data: FormData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const result = validateField(schema, 'name', 'John Doe', data);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('validates a single field with error', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
          email: { type: 'string', format: 'email' },
        },
      };

      const data: FormData = {
        name: 'Jo',
        email: 'john@example.com',
      };

      const result = validateField(schema, 'name', 'Jo', data);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].path).toBe('name');
    });

    it('returns valid when other fields have errors', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
          email: { type: 'string', format: 'email' },
        },
      };

      const data: FormData = {
        name: 'John Doe',
        email: 'invalid-email',
      };

      const result = validateField(schema, 'name', 'John Doe', data);

      expect(result.valid).toBe(true);
    });

    it('validates nested field', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              city: { type: 'string', minLength: 2 },
            },
          },
        },
      };

      const data: FormData = {
        address: {
          city: 'A',
        },
      };

      const result = validateField(schema, 'address.city', 'A', data);

      expect(result.valid).toBe(false);
      expect(result.errors![0].path).toBe('address.city');
    });
  });

  describe('getErrorMap', () => {
    it('converts errors array to map', () => {
      const errors: FieldError[] = [
        { path: 'name', code: 'required', message: 'Name is required' },
        { path: 'email', code: 'invalid_format', message: 'Invalid email' },
      ];

      const errorMap = getErrorMap(errors);

      expect(errorMap).toEqual({
        name: 'Name is required',
        email: 'Invalid email',
      });
    });

    it('uses first error when multiple errors for same field', () => {
      const errors: FieldError[] = [
        { path: 'password', code: 'too_short', message: 'Too short' },
        { path: 'password', code: 'invalid_format', message: 'Invalid format' },
      ];

      const errorMap = getErrorMap(errors);

      expect(errorMap).toEqual({
        password: 'Too short',
      });
    });

    it('returns empty map for empty errors array', () => {
      const errorMap = getErrorMap([]);

      expect(errorMap).toEqual({});
    });
  });

  describe('getFieldError', () => {
    it('returns error message for existing field', () => {
      const errors: FieldError[] = [
        { path: 'name', code: 'required', message: 'Name is required' },
        { path: 'email', code: 'invalid_format', message: 'Invalid email' },
      ];

      const message = getFieldError(errors, 'email');

      expect(message).toBe('Invalid email');
    });

    it('returns undefined for non-existent field', () => {
      const errors: FieldError[] = [
        { path: 'name', code: 'required', message: 'Name is required' },
      ];

      const message = getFieldError(errors, 'email');

      expect(message).toBeUndefined();
    });

    it('returns undefined for undefined errors', () => {
      const message = getFieldError(undefined, 'name');

      expect(message).toBeUndefined();
    });

    it('returns first error message when multiple errors for same field', () => {
      const errors: FieldError[] = [
        { path: 'password', code: 'too_short', message: 'Too short' },
        { path: 'password', code: 'invalid_format', message: 'Invalid format' },
      ];

      const message = getFieldError(errors, 'password');

      expect(message).toBe('Too short');
    });
  });

  describe('hasFieldError', () => {
    it('returns true when field has error', () => {
      const errors: FieldError[] = [
        { path: 'name', code: 'required', message: 'Name is required' },
      ];

      expect(hasFieldError(errors, 'name')).toBe(true);
    });

    it('returns false when field has no error', () => {
      const errors: FieldError[] = [
        { path: 'name', code: 'required', message: 'Name is required' },
      ];

      expect(hasFieldError(errors, 'email')).toBe(false);
    });

    it('returns false for undefined errors', () => {
      expect(hasFieldError(undefined, 'name')).toBe(false);
    });

    it('returns false for empty errors array', () => {
      expect(hasFieldError([], 'name')).toBe(false);
    });
  });

  describe('validator caching', () => {
    it('caches validators for schemas with $id', () => {
      const schema: IntakeSchema = {
        $id: 'test-schema',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      expect(getValidatorCacheSize()).toBe(0);

      validateForm(schema, { name: 'John' });
      expect(getValidatorCacheSize()).toBe(1);

      validateForm(schema, { name: 'Jane' });
      expect(getValidatorCacheSize()).toBe(1); // Should reuse cached validator
    });

    it('caches validators for schemas without $id', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      expect(getValidatorCacheSize()).toBe(0);

      validateForm(schema, { name: 'John' });
      expect(getValidatorCacheSize()).toBe(1);
    });

    it('clears validator cache', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      validateForm(schema, { name: 'John' });
      expect(getValidatorCacheSize()).toBeGreaterThan(0);

      clearValidatorCache();
      expect(getValidatorCacheSize()).toBe(0);
    });

    it('creates new cache entry after clear', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      validateForm(schema, { name: 'John' });
      clearValidatorCache();

      validateForm(schema, { name: 'Jane' });
      expect(getValidatorCacheSize()).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty schema', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {},
      };

      const result = validateForm(schema, {});

      expect(result.valid).toBe(true);
    });

    it('handles null values', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
        },
      };

      const result = validateForm(schema, { name: null });

      expect(result.valid).toBe(true);
    });

    it('handles undefined values for optional fields', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const result = validateForm(schema, { name: undefined });

      expect(result.valid).toBe(true);
    });

    it('validates complex real-world schema', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          company: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          employees: { type: 'number', minimum: 1 },
          active: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string', pattern: '^[A-Z]{2}$' },
              zip: { type: 'string', pattern: '^\\d{5}$' },
            },
            required: ['city', 'state'],
          },
        },
        required: ['company', 'email', 'address'],
      };

      const validData: FormData = {
        company: 'Acme Inc',
        email: 'contact@acme.com',
        employees: 50,
        active: true,
        tags: ['technology', 'software'],
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zip: '10001',
        },
      };

      expect(validateForm(schema, validData).valid).toBe(true);

      const invalidData: FormData = {
        company: '',
        email: 'invalid',
        employees: 0,
        tags: [],
        address: {
          street: '123 Main St',
          state: 'New York',
          zip: 'invalid',
        },
      };

      const result = validateForm(schema, invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });
});
