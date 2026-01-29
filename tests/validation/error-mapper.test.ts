/**
 * Tests for Error Mapper
 *
 * Tests the conversion of Zod validation errors to Intake Contract error format, including:
 * - Missing field errors
 * - Invalid field errors
 * - Conflict errors
 * - Needs approval errors
 * - Constraint extraction
 * - Next action generation
 * - Field path handling
 * - Error mapper options
 */

import { z } from 'zod';
import {
  mapToIntakeError,
  mapMultipleToIntakeError,
  type ErrorMapperOptions,
} from '../../src/validation/error-mapper';
import { validateSubmission } from '../../src/validation/validator';
import type { IntakeError, IntakeErrorType } from '../../src/types/intake-contract';

describe('mapToIntakeError', () => {
  describe('missing field errors', () => {
    it('should map missing required string field to missing error', () => {
      const schema = z.object({
        name: z.string(),
        email: z.string(),
      });

      const result = validateSubmission(schema, {});

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('missing');
        expect(intakeError.fields).toHaveLength(2);
        expect(intakeError.fields[0].type).toBe('missing');
        expect(intakeError.fields[0].field).toBe('name');
        expect(intakeError.fields[1].type).toBe('missing');
        expect(intakeError.fields[1].field).toBe('email');
        expect(intakeError.message).toContain('2 required fields are missing');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map single missing field with correct message', () => {
      const schema = z.object({
        name: z.string(),
      });

      const result = validateSubmission(schema, {});

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('missing');
        expect(intakeError.fields).toHaveLength(1);
        expect(intakeError.message).toContain('1 required field is missing');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map missing nested field', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
      });

      const result = validateSubmission(schema, { user: {} });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('missing');
        expect(intakeError.fields).toHaveLength(2);
        expect(intakeError.fields[0].field).toBe('user.name');
        expect(intakeError.fields[1].field).toBe('user.email');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('invalid field errors', () => {
    it('should map invalid string length to invalid error', () => {
      const schema = z.object({
        username: z.string().min(3, 'Username must be at least 3 characters'),
      });

      const result = validateSubmission(schema, { username: 'ab' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields).toHaveLength(1);
        expect(intakeError.fields[0].type).toBe('invalid');
        expect(intakeError.fields[0].field).toBe('username');
        expect(intakeError.fields[0].constraint).toBe('min:3');
        expect(intakeError.message).toContain('Validation failed for 1 field');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map invalid email format', () => {
      const schema = z.object({
        email: z.string().email('Invalid email format'),
      });

      const result = validateSubmission(schema, { email: 'not-an-email' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields).toHaveLength(1);
        expect(intakeError.fields[0].constraint).toBe('email');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map invalid number range', () => {
      const schema = z.object({
        age: z.number().min(18, 'Must be at least 18').max(120, 'Must be under 120'),
      });

      const result = validateSubmission(schema, { age: 15 });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields[0].constraint).toBe('min:18');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map invalid enum value', () => {
      const schema = z.object({
        status: z.enum(['pending', 'approved', 'rejected']),
      });

      const result = validateSubmission(schema, { status: 'invalid' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields[0].constraint).toBe('enum');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map invalid URL format', () => {
      const schema = z.object({
        website: z.string().url('Must be a valid URL'),
      });

      const result = validateSubmission(schema, { website: 'not-a-url' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields[0].constraint).toBe('url');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map invalid UUID format', () => {
      const schema = z.object({
        id: z.string().uuid('Must be a valid UUID'),
      });

      const result = validateSubmission(schema, { id: 'not-a-uuid' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields[0].constraint).toBe('uuid');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should map invalid type error', () => {
      const schema = z.object({
        count: z.number(),
      });

      const result = validateSubmission(schema, { count: 'not-a-number' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields[0].constraint).toBe('type:number');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('conflict errors', () => {
    it('should map custom conflict error', () => {
      const schema = z.object({
        email: z.string().email(),
      }).superRefine((data, ctx) => {
        // Simulate a conflict error (e.g., email already exists)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'Email address already exists',
          params: { errorType: 'conflict' },
        });
      });

      const result = validateSubmission(schema, { email: 'existing@example.com' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.fields).toHaveLength(1);
        expect(intakeError.fields[0].type).toBe('conflict');
        expect(intakeError.fields[0].field).toBe('email');
        expect(intakeError.fields[0].message).toContain('already exists');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('needs_approval errors', () => {
    it('should map custom needs_approval error', () => {
      const schema = z.object({
        amount: z.number(),
      }).superRefine((data, ctx) => {
        // Simulate a needs_approval error (e.g., amount exceeds threshold)
        if (data.amount > 10000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['amount'],
            message: 'Amount exceeds approval threshold',
            params: { errorType: 'needs_approval' },
          });
        }
      });

      const result = validateSubmission(schema, { amount: 15000 });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.fields).toHaveLength(1);
        expect(intakeError.fields[0].type).toBe('needs_approval');
        expect(intakeError.fields[0].field).toBe('amount');
        expect(intakeError.fields[0].message).toContain('approval threshold');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('mixed error types', () => {
    it('should prioritize missing over invalid for overall error type', () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().min(18),
      });

      const result = validateSubmission(schema, {
        email: 'invalid-email',
        age: 15,
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        // Overall type should be 'missing' because name is missing
        expect(intakeError.type).toBe('missing');
        expect(intakeError.fields).toHaveLength(3);

        // Check we have both missing and invalid fields
        const missingFields = intakeError.fields.filter(f => f.type === 'missing');
        const invalidFields = intakeError.fields.filter(f => f.type === 'invalid');
        expect(missingFields.length).toBe(1);
        expect(invalidFields.length).toBe(2);

        // Message should mention both
        expect(intakeError.message).toContain('1 required fields missing');
        expect(intakeError.message).toContain('2 fields invalid');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should handle multiple invalid fields with different constraints', () => {
      const schema = z.object({
        username: z.string().min(3).max(20),
        email: z.string().email(),
        age: z.number().min(18).max(120),
        website: z.string().url(),
      });

      const result = validateSubmission(schema, {
        username: 'ab',
        email: 'invalid',
        age: 150,
        website: 'not-a-url',
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        expect(intakeError.type).toBe('invalid');
        expect(intakeError.fields).toHaveLength(4);
        expect(intakeError.fields[0].constraint).toBe('min:3');
        expect(intakeError.fields[1].constraint).toBe('email');
        expect(intakeError.fields[2].constraint).toBe('max:120');
        expect(intakeError.fields[3].constraint).toBe('url');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('field paths', () => {
    it('should handle nested object field paths', () => {
      const schema = z.object({
        address: z.object({
          street: z.string(),
          city: z.string(),
          country: z.object({
            code: z.string().length(2),
            name: z.string(),
          }),
        }),
      });

      const result = validateSubmission(schema, {
        address: {
          country: {
            code: 'USA', // Too long
          },
        },
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        const fields = intakeError.fields.map(f => f.field);
        expect(fields).toContain('address.street');
        expect(fields).toContain('address.city');
        expect(fields).toContain('address.country.code');
        expect(fields).toContain('address.country.name');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should handle array field paths', () => {
      const schema = z.object({
        items: z.array(z.object({
          name: z.string(),
          price: z.number().min(0),
        })),
      });

      const result = validateSubmission(schema, {
        items: [
          { name: 'Item 1', price: -5 }, // Invalid price
          { price: 10 }, // Missing name
        ],
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        const fields = intakeError.fields.map(f => f.field);
        expect(fields).toContain('items.0.price');
        expect(fields).toContain('items.1.name');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('next actions generation', () => {
    it('should generate provide_missing_fields action', () => {
      const schema = z.object({
        name: z.string(),
        email: z.string(),
      });

      const result = validateSubmission(schema, {});

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        const missingAction = intakeError.nextActions.find(
          a => a.type === 'provide_missing_fields'
        );
        expect(missingAction).toBeDefined();
        expect(missingAction?.fields).toEqual(['name', 'email']);
        expect(missingAction?.description).toContain('2 required fields');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should generate correct_invalid_fields action', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      const result = validateSubmission(schema, {
        email: 'invalid',
        age: 15,
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        const invalidAction = intakeError.nextActions.find(
          a => a.type === 'correct_invalid_fields'
        );
        expect(invalidAction).toBeDefined();
        expect(invalidAction?.fields).toEqual(['email', 'age']);
        expect(invalidAction?.description).toContain('2 invalid fields');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should generate fix_email_format action for email errors', () => {
      const schema = z.object({
        email: z.string().email(),
        backupEmail: z.string().email(),
      });

      const result = validateSubmission(schema, {
        email: 'invalid1',
        backupEmail: 'invalid2',
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        const emailAction = intakeError.nextActions.find(
          a => a.type === 'fix_email_format'
        );
        expect(emailAction).toBeDefined();
        expect(emailAction?.fields).toEqual(['email', 'backupEmail']);
        expect(emailAction?.description).toContain('valid email addresses');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should generate meet_minimum_requirements action for min constraints', () => {
      const schema = z.object({
        username: z.string().min(3),
        age: z.number().min(18),
      });

      const result = validateSubmission(schema, {
        username: 'ab',
        age: 15,
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        const minAction = intakeError.nextActions.find(
          a => a.type === 'meet_minimum_requirements'
        );
        expect(minAction).toBeDefined();
        expect(minAction?.fields).toEqual(['username', 'age']);
        expect(minAction?.description).toContain('minimum requirements');
        expect(minAction?.params?.constraints).toBeDefined();
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should generate multiple action types when appropriate', () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().min(18),
      });

      const result = validateSubmission(schema, {
        email: 'invalid',
        age: 15,
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        // Should have actions for missing, invalid, email fix, and min requirements
        expect(intakeError.nextActions.length).toBeGreaterThan(1);

        const actionTypes = intakeError.nextActions.map(a => a.type);
        expect(actionTypes).toContain('provide_missing_fields');
        expect(actionTypes).toContain('correct_invalid_fields');
        expect(actionTypes).toContain('fix_email_format');
        expect(actionTypes).toContain('meet_minimum_requirements');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('error mapper options', () => {
    it('should include field values when includeValues is true', () => {
      const schema = z.object({
        age: z.number(),
      });

      const result = validateSubmission(schema, { age: 'not-a-number' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error, {
          includeValues: true,
        });

        expect(intakeError.fields[0].value).toBe('string');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should not include field values when includeValues is false', () => {
      const schema = z.object({
        age: z.number(),
      });

      const result = validateSubmission(schema, { age: 'not-a-number' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error, {
          includeValues: false,
        });

        expect(intakeError.fields[0].value).toBeUndefined();
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should include resumeToken when provided', () => {
      const schema = z.object({
        name: z.string(),
      });

      const result = validateSubmission(schema, {});

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error, {
          resumeToken: 'resume-token-123',
        });

        expect(intakeError.resumeToken).toBe('resume-token-123');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should include idempotencyKey when provided', () => {
      const schema = z.object({
        name: z.string(),
      });

      const result = validateSubmission(schema, {});

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error, {
          idempotencyKey: 'idempotency-key-456',
        });

        expect(intakeError.idempotencyKey).toBe('idempotency-key-456');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should include timestamp when includeTimestamp is true', () => {
      const schema = z.object({
        name: z.string(),
      });

      const result = validateSubmission(schema, {});

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error, {
          includeTimestamp: true,
        });

        expect(intakeError.timestamp).toBeDefined();
        expect(typeof intakeError.timestamp).toBe('string');
        // Verify it's a valid ISO string
        expect(() => new Date(intakeError.timestamp!)).not.toThrow();
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should support all options combined', () => {
      const schema = z.object({
        name: z.string(),
      });

      const result = validateSubmission(schema, {});

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error, {
          includeValues: true,
          resumeToken: 'resume-123',
          idempotencyKey: 'idempotency-456',
          includeTimestamp: true,
        });

        expect(intakeError.resumeToken).toBe('resume-123');
        expect(intakeError.idempotencyKey).toBe('idempotency-456');
        expect(intakeError.timestamp).toBeDefined();
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('constraint extraction', () => {
    it('should extract min constraint', () => {
      const schema = z.object({
        value: z.string().min(5),
      });

      const result = validateSubmission(schema, { value: 'abc' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);
        expect(intakeError.fields[0].constraint).toBe('min:5');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should extract max constraint', () => {
      const schema = z.object({
        value: z.string().max(5),
      });

      const result = validateSubmission(schema, { value: 'abcdefgh' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);
        expect(intakeError.fields[0].constraint).toBe('max:5');
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should extract literal constraint', () => {
      const schema = z.object({
        status: z.literal('active'),
      });

      const result = validateSubmission(schema, { status: 'inactive' });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);
        expect(intakeError.fields[0].constraint).toBe('literal');
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('complex real-world scenarios', () => {
    it('should handle vendor onboarding schema validation', () => {
      const vendorSchema = z.object({
        legal_name: z.string().describe('Legal business name'),
        country: z.string().length(2).describe('Two-letter country code'),
        tax_id: z.string().describe('Tax identification number'),
        bank_account: z.object({
          account_number: z.string(),
          routing_number: z.string(),
        }),
        contact: z.object({
          email: z.string().email(),
          phone: z.string(),
        }),
        employees: z.number().min(1),
        annual_revenue: z.number().min(0),
      });

      const result = validateSubmission(vendorSchema, {
        legal_name: 'Acme Corp',
        country: 'USA', // Too long
        bank_account: {
          account_number: '123456789',
          // Missing routing_number
        },
        contact: {
          email: 'invalid-email',
          phone: '555-1234',
        },
        employees: 0, // Too small
        // Missing tax_id and annual_revenue
      });

      if (!result.success) {
        const intakeError = mapToIntakeError(result.error);

        // Should have multiple errors
        expect(intakeError.fields.length).toBeGreaterThan(3);

        // Check for missing fields
        const missingFields = intakeError.fields.filter(f => f.type === 'missing');
        expect(missingFields.length).toBeGreaterThan(0);

        // Check for invalid fields
        const invalidFields = intakeError.fields.filter(f => f.type === 'invalid');
        expect(invalidFields.length).toBeGreaterThan(0);

        // Should have multiple next actions
        expect(intakeError.nextActions.length).toBeGreaterThan(0);
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });
});

describe('mapMultipleToIntakeError', () => {
  it('should combine multiple ZodErrors into a single IntakeError', () => {
    const schema1 = z.object({
      name: z.string(),
    });

    const schema2 = z.object({
      email: z.string().email(),
    });

    const result1 = validateSubmission(schema1, {});
    const result2 = validateSubmission(schema2, { email: 'invalid' });

    if (!result1.success && !result2.success) {
      const combinedError = mapMultipleToIntakeError([result1.error, result2.error]);

      expect(combinedError.fields).toHaveLength(2);
      expect(combinedError.fields[0].field).toBe('name');
      expect(combinedError.fields[0].type).toBe('missing');
      expect(combinedError.fields[1].field).toBe('email');
      expect(combinedError.fields[1].type).toBe('invalid');
    } else {
      throw new Error('Expected both validations to fail');
    }
  });

  it('should support options when combining multiple errors', () => {
    const schema1 = z.object({
      field1: z.string(),
    });

    const schema2 = z.object({
      field2: z.string(),
    });

    const result1 = validateSubmission(schema1, {});
    const result2 = validateSubmission(schema2, {});

    if (!result1.success && !result2.success) {
      const combinedError = mapMultipleToIntakeError(
        [result1.error, result2.error],
        {
          resumeToken: 'combined-token',
          includeTimestamp: true,
        }
      );

      expect(combinedError.fields).toHaveLength(2);
      expect(combinedError.resumeToken).toBe('combined-token');
      expect(combinedError.timestamp).toBeDefined();
    } else {
      throw new Error('Expected both validations to fail');
    }
  });
});
