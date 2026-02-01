/**
 * Tests for MCP Handlers - Set and Submit Operations
 *
 * Comprehensive tests for set-handler.ts and submit-handler.ts, including:
 * - Success scenarios for both handlers
 * - Validation failures
 * - Resume token handling
 * - State transitions
 * - Error responses
 * - Data merging behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { handleSet } from '../../src/mcp/handlers/set-handler.js';
import { handleSubmit } from '../../src/mcp/handlers/submit-handler.js';
import type { IntakeDefinition } from '../../src/schemas/intake-schema.js';
import type { SubmissionStore, MCPSubmissionEntry } from '../../src/mcp/submission-store.js';
import { SubmissionState } from '../../src/types/intake-contract.js';
import { SubmissionId } from '../../src/types/branded.js';

// Mock submission store implementation for testing
class MockSubmissionStore implements SubmissionStore {
  private entries = new Map<string, MCPSubmissionEntry>();
  private idempotencyIndex = new Map<string, string>();

  create(intakeId: string, data: Record<string, unknown> = {}, idempotencyKey?: string): MCPSubmissionEntry {
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const resumeToken = `tok_${Math.random().toString(36).substr(2, 16)}`;
    
    const entry: MCPSubmissionEntry = {
      submissionId,
      resumeToken,
      intakeId,
      data,
      state: SubmissionState.CREATED,
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.entries.set(resumeToken, entry);
    
    if (idempotencyKey) {
      this.idempotencyIndex.set(idempotencyKey, resumeToken);
    }

    return entry;
  }

  get(resumeToken: string): MCPSubmissionEntry | undefined {
    return this.entries.get(resumeToken);
  }

  getByIdempotencyKey(idempotencyKey: string): MCPSubmissionEntry | undefined {
    const resumeToken = this.idempotencyIndex.get(idempotencyKey);
    return resumeToken ? this.entries.get(resumeToken) : undefined;
  }

  update(resumeToken: string, updates: Partial<MCPSubmissionEntry>): MCPSubmissionEntry | undefined {
    const entry = this.entries.get(resumeToken);
    if (!entry) {
      return undefined;
    }

    const updated = {
      ...entry,
      ...updates,
      updatedAt: new Date(),
    };

    this.entries.set(resumeToken, updated);
    return updated;
  }

  delete(resumeToken: string): boolean {
    const entry = this.entries.get(resumeToken);
    if (entry?.idempotencyKey) {
      this.idempotencyIndex.delete(entry.idempotencyKey);
    }
    return this.entries.delete(resumeToken);
  }

  // Test helper methods
  clear() {
    this.entries.clear();
    this.idempotencyIndex.clear();
  }

  setEntry(resumeToken: string, entry: MCPSubmissionEntry) {
    this.entries.set(resumeToken, entry);
  }
}

// Sample intake definitions for testing
const simpleIntake: IntakeDefinition = {
  id: 'simple_form',
  version: '1.0.0',
  name: 'Simple Form',
  schema: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email format'),
    age: z.number().min(18, 'Must be at least 18 years old'),
  }),
  destination: {
    type: 'webhook',
    name: 'Test Webhook',
    config: { url: 'https://example.com/webhook' },
  },
};

const complexIntake: IntakeDefinition = {
  id: 'complex_form',
  version: '1.0.0',
  name: 'Complex Form',
  schema: z.object({
    personalInfo: z.object({
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1, 'Last name is required'),
    }),
    contact: z.object({
      email: z.string().email('Invalid email'),
      phone: z.string().optional(),
    }),
    preferences: z.object({
      newsletter: z.boolean().optional(),
      notifications: z.boolean().default(true),
    }).optional(),
  }),
  destination: {
    type: 'webhook',
    name: 'Complex Webhook',
    config: { url: 'https://example.com/complex' },
  },
};

describe('handleSet', () => {
  let store: MockSubmissionStore;

  beforeEach(() => {
    store = new MockSubmissionStore();
  });

  describe('successful operations', () => {
    it('should successfully set fields on a valid submission', async () => {
      // Create a submission
      const entry = store.create('simple_form', { name: 'John' });

      // Set additional fields
      const response = await handleSet(
        simpleIntake,
        {
          resumeToken: entry.resumeToken,
          data: { email: 'john@example.com', age: 25 }
        },
        store
      );

      expect(response).toEqual({
        state: SubmissionState.VALIDATING,
        submissionId: SubmissionId(entry.submissionId),
        message: 'Submission updated successfully',
        resumeToken: entry.resumeToken,
      });

      // Verify data was merged correctly
      const updated = store.get(entry.resumeToken);
      expect(updated?.data).toEqual({
        name: 'John',
        email: 'john@example.com',
        age: 25,
      });
      expect(updated?.state).toBe(SubmissionState.VALIDATING);
    });

    it('should merge new data with existing data', async () => {
      // Create submission with initial data
      const entry = store.create('simple_form', { 
        name: 'John', 
        email: 'old@example.com' 
      });

      // Update with new data (should merge, not replace)
      const response = await handleSet(
        simpleIntake,
        {
          resumeToken: entry.resumeToken,
          data: { email: 'new@example.com', age: 30 }
        },
        store
      );

      expect(response.state).toBe(SubmissionState.VALIDATING);

      // Check merged data
      const updated = store.get(entry.resumeToken);
      expect(updated?.data).toEqual({
        name: 'John',           // preserved
        email: 'new@example.com',  // updated
        age: 30,                // added
      });
    });

    it('should handle empty data objects', async () => {
      const entry = store.create('simple_form', { name: 'John' });

      const response = await handleSet(
        simpleIntake,
        {
          resumeToken: entry.resumeToken,
          data: {}
        },
        store
      );

      expect(response.state).toBe(SubmissionState.VALIDATING);
      
      // Data should remain unchanged
      const updated = store.get(entry.resumeToken);
      expect(updated?.data).toEqual({ name: 'John' });
    });

    it('should handle nested object updates', async () => {
      const entry = store.create('complex_form', {
        personalInfo: { firstName: 'John', lastName: 'Doe' },
        contact: { email: 'john@example.com' }
      });

      const response = await handleSet(
        complexIntake,
        {
          resumeToken: entry.resumeToken,
          data: {
            contact: { email: 'john.doe@example.com', phone: '555-0123' },
            preferences: { newsletter: true }
          }
        },
        store
      );

      expect(response.state).toBe(SubmissionState.VALIDATING);

      const updated = store.get(entry.resumeToken);
      expect(updated?.data).toEqual({
        personalInfo: { firstName: 'John', lastName: 'Doe' },
        contact: { email: 'john.doe@example.com', phone: '555-0123' },
        preferences: { newsletter: true },
      });
    });
  });

  describe('validation failures', () => {
    it('should return validation error for invalid field data', async () => {
      const entry = store.create('simple_form', { name: 'John' });

      const response = await handleSet(
        simpleIntake,
        {
          resumeToken: entry.resumeToken,
          data: {
            email: 'invalid-email',  // Invalid email format
            age: 15,                 // Below minimum age
          }
        },
        store
      );

      // Should return an IntakeError
      expect(response).toHaveProperty('type');
      expect(response).toHaveProperty('fields');
      expect(response).toHaveProperty('timestamp');
      
      const errorResponse = response as any;
      expect(errorResponse.type).toBe('invalid'); // Error mapper returns 'invalid' for validation errors
      expect(errorResponse.fields).toHaveLength(2);
      
      // Check field-specific errors
      const emailError = errorResponse.fields.find((f: any) => f.field === 'email');
      const ageError = errorResponse.fields.find((f: any) => f.field === 'age');
      
      expect(emailError).toBeDefined();
      expect(emailError.message).toContain('email');
      expect(ageError).toBeDefined();
      expect(ageError.message).toContain('18');

      // Verify submission was not updated
      const unchanged = store.get(entry.resumeToken);
      expect(unchanged?.data).toEqual({ name: 'John' });
      expect(unchanged?.state).toBe(SubmissionState.CREATED);
    });

    it('should validate partial data correctly', async () => {
      const entry = store.create('simple_form', {});

      // Partial valid data should pass
      const response = await handleSet(
        simpleIntake,
        {
          resumeToken: entry.resumeToken,
          data: { name: 'John' }  // Only name, missing required email and age
        },
        store
      );

      // Partial validation should succeed (missing fields are OK for set operation)
      expect(response).toEqual({
        state: SubmissionState.VALIDATING,
        submissionId: SubmissionId(entry.submissionId),
        message: 'Submission updated successfully',
        resumeToken: entry.resumeToken,
      });
    });

    it('should reject invalid data types', async () => {
      const entry = store.create('simple_form', {});

      const response = await handleSet(
        simpleIntake,
        {
          resumeToken: entry.resumeToken,
          data: {
            name: 123,        // Should be string
            age: 'twenty',    // Should be number
          }
        },
        store
      );

      expect(response).toHaveProperty('type', 'invalid');
      expect(response).toHaveProperty('fields');
      
      const errorResponse = response as any;
      expect(errorResponse.fields).toHaveLength(2);
    });
  });

  describe('resume token handling', () => {
    it('should return error for non-existent resume token', async () => {
      const response = await handleSet(
        simpleIntake,
        {
          resumeToken: 'nonexistent_token',
          data: { name: 'John' }
        },
        store
      );

      expect(response).toHaveProperty('type', 'invalid');
      expect(response).toHaveProperty('message', 'Invalid resume token');
      expect(response).toHaveProperty('fields');
      
      const errorResponse = response as any;
      const tokenError = errorResponse.fields.find((f: any) => f.field === 'resumeToken');
      expect(tokenError).toBeDefined();
      expect(tokenError.message).toContain('not found');
    });

    it('should return error for intake ID mismatch', async () => {
      // Create submission for simple_form
      const entry = store.create('simple_form', {});

      // Try to update with complex_form intake
      const response = await handleSet(
        complexIntake,  // Different intake
        {
          resumeToken: entry.resumeToken,
          data: { name: 'John' }
        },
        store
      );

      expect(response).toHaveProperty('type', 'conflict');
      expect(response).toHaveProperty('message');
      
      const errorResponse = response as any;
      expect(errorResponse.message).toContain('different intake form');
      
      // Check that the field error contains the specific intake IDs
      const tokenError = errorResponse.fields.find((f: any) => f.field === 'resumeToken');
      expect(tokenError.message).toContain('simple_form');
      expect(tokenError.message).toContain('complex_form');
    });
  });

  describe('argument parsing', () => {
    it('should reject missing resumeToken', async () => {
      await expect(
        handleSet(simpleIntake, { data: { name: 'John' } }, store)
      ).rejects.toThrow();
    });

    it('should reject missing data', async () => {
      await expect(
        handleSet(simpleIntake, { resumeToken: 'token123' }, store)
      ).rejects.toThrow();
    });

    it('should reject invalid argument types', async () => {
      await expect(
        handleSet(simpleIntake, { resumeToken: 123, data: { name: 'John' } }, store)
      ).rejects.toThrow();

      await expect(
        handleSet(simpleIntake, { resumeToken: 'token123', data: 'not-an-object' }, store)
      ).rejects.toThrow();
    });
  });
});

describe('handleSubmit', () => {
  let store: MockSubmissionStore;

  beforeEach(() => {
    store = new MockSubmissionStore();
  });

  describe('successful submissions', () => {
    it('should successfully submit a complete submission', async () => {
      // Create submission with complete valid data
      const entry = store.create('simple_form', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      });

      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response).toEqual({
        state: SubmissionState.COMPLETED,
        submissionId: SubmissionId(entry.submissionId),
        message: 'Submission completed successfully',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          age: 25,
        },
        timestamp: expect.any(String),
      });

      // Verify state progression
      const final = store.get(entry.resumeToken);
      expect(final?.state).toBe(SubmissionState.COMPLETED);
    });

    it('should handle complex schema submissions', async () => {
      const entry = store.create('complex_form', {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
        },
        contact: {
          email: 'john@example.com',
          phone: '555-0123',
        },
        preferences: {
          newsletter: true,
          notifications: false,
        },
      });

      const response = await handleSubmit(
        complexIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response.state).toBe(SubmissionState.COMPLETED);
      expect(response.data).toEqual(entry.data);
      expect(response).toHaveProperty('timestamp');
    });

    it('should handle submissions with optional fields', async () => {
      const entry = store.create('complex_form', {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
        },
        contact: {
          email: 'john@example.com',
          // phone is optional and not provided
        },
        // preferences is optional and not provided
      });

      const response = await handleSubmit(
        complexIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response.state).toBe(SubmissionState.COMPLETED);
      expect(response.data).toBeDefined();
    });
  });

  describe('validation failures', () => {
    it('should return validation error for incomplete data', async () => {
      // Create submission with missing required fields
      const entry = store.create('simple_form', {
        name: 'John',
        // missing email and age
      });

      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response).toHaveProperty('type', 'missing'); // Missing required fields
      expect(response).toHaveProperty('fields');
      
      const errorResponse = response as any;
      expect(errorResponse.fields).toHaveLength(2); // email and age missing

      // Verify submission state was updated to invalid
      const updated = store.get(entry.resumeToken);
      expect(updated?.state).toBe(SubmissionState.INVALID);
    });

    it('should return validation error for invalid field data', async () => {
      const entry = store.create('simple_form', {
        name: 'John',
        email: 'invalid-email',
        age: 15, // below minimum
      });

      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response).toHaveProperty('type', 'invalid'); // Invalid field data
      
      const errorResponse = response as any;
      expect(errorResponse.fields).toHaveLength(2); // email format and age minimum

      // Verify submission state was updated to invalid
      const updated = store.get(entry.resumeToken);
      expect(updated?.state).toBe(SubmissionState.INVALID);
    });

    it('should handle complex validation errors', async () => {
      const entry = store.create('complex_form', {
        personalInfo: {
          firstName: '', // empty, should be min 1
          lastName: 'Doe',
        },
        contact: {
          email: 'invalid',
          // phone is optional, not provided
        },
        // missing personalInfo.lastName in some scenarios
      });

      const response = await handleSubmit(
        complexIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response).toHaveProperty('type', 'invalid'); // Invalid field data
      
      const errorResponse = response as any;
      expect(errorResponse.fields.length).toBeGreaterThan(0);
      
      // Should have errors for firstName and email
      const firstNameError = errorResponse.fields.find((f: any) => f.field.includes('firstName'));
      const emailError = errorResponse.fields.find((f: any) => f.field.includes('email'));
      
      expect(firstNameError).toBeDefined();
      expect(emailError).toBeDefined();
    });
  });

  describe('state transitions', () => {
    it('should transition through SUBMITTING to COMPLETED states', async () => {
      const entry = store.create('simple_form', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      });

      // Initial state should be CREATED
      expect(entry.state).toBe(SubmissionState.CREATED);

      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response.state).toBe(SubmissionState.COMPLETED);

      // Final state should be COMPLETED
      const final = store.get(entry.resumeToken);
      expect(final?.state).toBe(SubmissionState.COMPLETED);
    });

    it('should set state to INVALID on validation failure', async () => {
      const entry = store.create('simple_form', {
        name: 'John',
        // incomplete data
      });

      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response).toHaveProperty('type', 'missing'); // Missing required fields

      // State should be set to INVALID
      const updated = store.get(entry.resumeToken);
      expect(updated?.state).toBe(SubmissionState.INVALID);
    });

    it('should handle already completed submissions', async () => {
      const entry = store.create('simple_form', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      });

      // First submission
      await handleSubmit(simpleIntake, { resumeToken: entry.resumeToken }, store);

      // Second submission attempt
      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      // Should still succeed (idempotent)
      expect(response.state).toBe(SubmissionState.COMPLETED);
    });
  });

  describe('resume token handling', () => {
    it('should return error for non-existent resume token', async () => {
      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: 'nonexistent_token' },
        store
      );

      expect(response).toHaveProperty('type', 'invalid');
      expect(response).toHaveProperty('message', 'Invalid resume token');
    });

    it('should return error for intake ID mismatch', async () => {
      const entry = store.create('simple_form', {
        name: 'John',
        email: 'john@example.com',
        age: 25,
      });

      const response = await handleSubmit(
        complexIntake, // Wrong intake
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response).toHaveProperty('type', 'conflict');
      expect(response).toHaveProperty('message');
      
      const errorResponse = response as any;
      expect(errorResponse.message).toContain('different intake form');
    });
  });

  describe('argument parsing', () => {
    it('should reject missing resumeToken', async () => {
      await expect(
        handleSubmit(simpleIntake, {}, store)
      ).rejects.toThrow();
    });

    it('should reject invalid resumeToken type', async () => {
      await expect(
        handleSubmit(simpleIntake, { resumeToken: 123 }, store)
      ).rejects.toThrow();
    });

    it('should accept only resumeToken (no extra fields needed)', async () => {
      const entry = store.create('simple_form', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      });

      // Should work with only resumeToken
      const response = await handleSubmit(
        simpleIntake,
        { resumeToken: entry.resumeToken },
        store
      );

      expect(response.state).toBe(SubmissionState.COMPLETED);
    });
  });
});

describe('integration tests', () => {
  let store: MockSubmissionStore;

  beforeEach(() => {
    store = new MockSubmissionStore();
  });

  it('should support full workflow: create, set multiple times, then submit', async () => {
    // Start with empty submission
    const entry = store.create('simple_form', {});

    // Set name
    const setResponse1 = await handleSet(
      simpleIntake,
      {
        resumeToken: entry.resumeToken,
        data: { name: 'John Doe' }
      },
      store
    );
    expect(setResponse1.state).toBe(SubmissionState.VALIDATING);

    // Set email
    const setResponse2 = await handleSet(
      simpleIntake,
      {
        resumeToken: entry.resumeToken,
        data: { email: 'john@example.com' }
      },
      store
    );
    expect(setResponse2.state).toBe(SubmissionState.VALIDATING);

    // Set age
    const setResponse3 = await handleSet(
      simpleIntake,
      {
        resumeToken: entry.resumeToken,
        data: { age: 25 }
      },
      store
    );
    expect(setResponse3.state).toBe(SubmissionState.VALIDATING);

    // Verify all data is present
    const beforeSubmit = store.get(entry.resumeToken);
    expect(beforeSubmit?.data).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
      age: 25,
    });

    // Submit
    const submitResponse = await handleSubmit(
      simpleIntake,
      { resumeToken: entry.resumeToken },
      store
    );

    expect(submitResponse.state).toBe(SubmissionState.COMPLETED);
    expect(submitResponse.data).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
      age: 25,
    });
  });

  it('should handle mixed valid and invalid set operations', async () => {
    const entry = store.create('simple_form', {});

    // Valid set
    const validSet = await handleSet(
      simpleIntake,
      {
        resumeToken: entry.resumeToken,
        data: { name: 'John' }
      },
      store
    );
    expect(validSet.state).toBe(SubmissionState.VALIDATING);

    // Invalid set (should not affect previous data)
    const invalidSet = await handleSet(
      simpleIntake,
      {
        resumeToken: entry.resumeToken,
        data: { email: 'invalid-email' }
      },
      store
    );
    expect(invalidSet).toHaveProperty('type', 'invalid');

    // Verify name is still there, email was not added due to validation failure
    const current = store.get(entry.resumeToken);
    expect(current?.data).toEqual({ name: 'John' });

    // Another valid set
    const validSet2 = await handleSet(
      simpleIntake,
      {
        resumeToken: entry.resumeToken,
        data: { email: 'john@example.com', age: 25 }
      },
      store
    );
    expect(validSet2.state).toBe(SubmissionState.VALIDATING);

    // Now submit should work
    const submit = await handleSubmit(
      simpleIntake,
      { resumeToken: entry.resumeToken },
      store
    );
    expect(submit.state).toBe(SubmissionState.COMPLETED);
  });
});