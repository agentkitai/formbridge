/**
 * End-to-End Integration Tests for MCP Tool Server Generation
 *
 * Tests the complete flow from IntakeSchema definition to working MCP server:
 * 1. Create IntakeDefinition with Zod schema
 * 2. Generate MCP server
 * 3. Register intakes
 * 4. Verify tools are generated
 * 5. Test validation and error mapping
 *
 * Validates that the entire system works together correctly and meets
 * the acceptance criteria from the spec.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { FormBridgeMCPServer } from '../../src/mcp/server';
import type { IntakeDefinition } from '../../src/schemas/intake-schema';
import type { MCPServerConfig } from '../../src/types/mcp-types';
import { generateToolsFromIntake } from '../../src/mcp/tool-generator';
import { validateSubmission } from '../../src/validation/validator';
import { mapToIntakeError } from '../../src/validation/error-mapper';
import {
  isIntakeError,
  type IntakeError,
} from '../../src/types/intake-contract';

describe('End-to-End Integration Tests', () => {
  describe('schema to server generation', () => {
    it('should generate MCP server from IntakeDefinition', () => {
      // Step 1: Create IntakeDefinition with Zod schema
      const intake: IntakeDefinition = {
        id: 'user_registration',
        version: '1.0.0',
        name: 'User Registration',
        description: 'Register a new user account',
        schema: z.object({
          username: z.string().min(3).describe('Username (min 3 characters)'),
          email: z.string().email().describe('Email address'),
          age: z.number().min(18).describe('Age (must be 18+)'),
        }),
        destination: {
          type: 'webhook',
          name: 'User API',
          config: { url: 'https://api.example.com/users' },
        },
      };

      // Step 2: Generate MCP server
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      server.registerIntake(intake);

      // Step 3: Verify server is created
      expect(server).toBeDefined();
      expect(server.getServer()).toBeDefined();

      // Step 4: Verify intake is registered
      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].id).toBe('user_registration');

      // Step 5: Verify tools are generated
      const tools = generateToolsFromIntake(intake);
      expect(tools.create.name).toBe('user_registration_create');
      expect(tools.set.name).toBe('user_registration_set');
      expect(tools.validate.name).toBe('user_registration_validate');
      expect(tools.submit.name).toBe('user_registration_submit');
    });

    it('should generate tools with proper input schemas', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field1: z.string().describe('Field 1'),
          field2: z.number().describe('Field 2'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      // Verify create tool schema
      expect(tools.create.inputSchema.type).toBe('object');
      expect(tools.create.inputSchema.properties).toBeDefined();
      expect(tools.create.inputSchema.properties?.data).toBeDefined();

      // Verify set tool schema
      expect(tools.set.inputSchema.required).toContain('resumeToken');
      expect(tools.set.inputSchema.required).toContain('data');

      // Verify validate tool schema
      expect(tools.validate.inputSchema.required).toContain('resumeToken');

      // Verify submit tool schema
      expect(tools.submit.inputSchema.required).toContain('resumeToken');
    });

    it('should handle multiple intakes', () => {
      const server = new FormBridgeMCPServer({
        name: 'multi-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      });

      const intake1: IntakeDefinition = {
        id: 'form_1',
        version: '1.0.0',
        name: 'Form 1',
        schema: z.object({ field: z.string() }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const intake2: IntakeDefinition = {
        id: 'form_2',
        version: '1.0.0',
        name: 'Form 2',
        schema: z.object({ field: z.number() }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      server.registerIntakes([intake1, intake2]);

      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(2);
      expect(intakes.find((i) => i.id === 'form_1')).toBeDefined();
      expect(intakes.find((i) => i.id === 'form_2')).toBeDefined();
    });
  });

  describe('validation and error handling', () => {
    it('should validate submission data correctly', () => {
      const schema = z.object({
        name: z.string().min(2),
        email: z.string().email(),
        age: z.number().min(18),
      });

      // Valid data
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      };

      const validResult = validateSubmission(schema, validData);
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toEqual(validData);
      }

      // Invalid data
      const invalidData = {
        name: 'J', // Too short
        email: 'invalid', // Invalid email
        age: 15, // Too young
      };

      const invalidResult = validateSubmission(schema, invalidData);
      expect(invalidResult.success).toBe(false);
    });

    it('should map validation errors to IntakeError format', () => {
      const schema = z.object({
        required_field: z.string(),
        email_field: z.string().email(),
      });

      const invalidData = {
        email_field: 'not-an-email',
        // required_field is missing
      };

      const result = validateSubmission(schema, invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        const error = mapToIntakeError(result.error);
        expect(isIntakeError(error)).toBe(true);
        expect(error.fields).toBeDefined();
        expect(error.fields.length).toBeGreaterThan(0);
        expect(error.nextActions).toBeDefined();
        expect(error.nextActions.length).toBeGreaterThan(0);
      }
    });

    it('should categorize missing vs invalid fields correctly', () => {
      const schema = z.object({
        required: z.string(),
        email: z.string().email(),
        min_length: z.string().min(5),
      });

      // Missing fields
      const missingData = {};
      const missingResult = validateSubmission(schema, missingData);
      expect(missingResult.success).toBe(false);

      if (!missingResult.success) {
        const error = mapToIntakeError(missingResult.error);
        expect(error.type).toBe('missing');
        expect(error.fields.every((f) => f.type === 'missing')).toBe(true);
      }

      // Invalid fields
      const invalidData = {
        required: 'ok',
        email: 'invalid-email',
        min_length: 'ab', // Too short
      };
      const invalidResult = validateSubmission(schema, invalidData);
      expect(invalidResult.success).toBe(false);

      if (!invalidResult.success) {
        const error = mapToIntakeError(invalidResult.error);
        expect(error.type).toBe('invalid');
        expect(error.fields.every((f) => f.type === 'invalid')).toBe(true);
      }
    });
  });

  describe('vendor onboarding example (10+ fields)', () => {
    it('should handle complex schema with 10+ fields in under 100ms', () => {
      const vendorSchema = z.object({
        legal_name: z.string().describe('Legal business name'),
        country: z.string().length(2).describe('Two-letter country code'),
        tax_id: z.string().describe('Tax identification number'),
        bank_account: z
          .object({
            account_number: z.string().describe('Bank account number'),
            routing_number: z.string().describe('Bank routing number'),
            account_holder_name: z.string().describe('Account holder name'),
          })
          .describe('Bank account information'),
        documents: z
          .object({
            w9_or_w8: z.string().describe('W-9 or W-8 form upload'),
          })
          .describe('Required tax documents'),
        contact_info: z
          .object({
            name: z.string().describe('Primary contact name'),
            email: z.string().email().describe('Primary contact email'),
            phone: z.string().describe('Primary contact phone'),
          })
          .describe('Contact information'),
        business_type: z
          .enum(['sole_proprietor', 'llc', 'corporation', 'partnership'])
          .describe('Type of business entity'),
        employees: z.number().min(1).describe('Number of employees'),
        annual_revenue: z.number().min(0).describe('Annual revenue in USD'),
        established_date: z
          .string()
          .describe('Date business was established'),
      });

      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        description: 'Onboard new vendors',
        schema: vendorSchema,
        destination: {
          type: 'webhook',
          name: 'Vendor API',
          config: { url: 'https://api.example.com/vendors' },
        },
      };

      const server = new FormBridgeMCPServer({
        name: 'vendor-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      });

      // Measure tool generation time
      const startTime = performance.now();
      server.registerIntake(intake);
      const endTime = performance.now();

      // Should generate tools in under 100ms (acceptance criteria)
      expect(endTime - startTime).toBeLessThan(100);

      // Verify registration
      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].id).toBe('vendor_onboarding');

      // Verify tools are generated
      const tools = generateToolsFromIntake(intake);
      expect(tools.create).toBeDefined();
      expect(tools.set).toBeDefined();
      expect(tools.validate).toBeDefined();
      expect(tools.submit).toBeDefined();
    });

    it('should validate vendor data with nested objects', () => {
      const vendorSchema = z.object({
        legal_name: z.string(),
        bank_account: z.object({
          account_number: z.string(),
          routing_number: z.string(),
        }),
        contact_info: z.object({
          email: z.string().email(),
        }),
      });

      // Valid nested data
      const validData = {
        legal_name: 'Acme Corp',
        bank_account: {
          account_number: '123456',
          routing_number: '789012',
        },
        contact_info: {
          email: 'contact@acme.com',
        },
      };

      const validResult = validateSubmission(vendorSchema, validData);
      expect(validResult.success).toBe(true);

      // Invalid nested email
      const invalidData = {
        legal_name: 'Test Corp',
        bank_account: {
          account_number: '123456',
          routing_number: '789012',
        },
        contact_info: {
          email: 'not-an-email',
        },
      };

      const invalidResult = validateSubmission(vendorSchema, invalidData);
      expect(invalidResult.success).toBe(false);

      if (!invalidResult.success) {
        const error = mapToIntakeError(invalidResult.error);
        const emailError = error.fields.find((f) =>
          f.field.includes('email')
        );
        expect(emailError).toBeDefined();
        expect(emailError?.type).toBe('invalid');
      }
    });

    it('should handle enums in schema', () => {
      const schema = z.object({
        business_type: z.enum([
          'sole_proprietor',
          'llc',
          'corporation',
          'partnership',
        ]),
      });

      // Valid enum value
      const validData = { business_type: 'corporation' };
      const validResult = validateSubmission(schema, validData);
      expect(validResult.success).toBe(true);

      // Invalid enum value
      const invalidData = { business_type: 'invalid_type' };
      const invalidResult = validateSubmission(schema, invalidData as any);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('tool metadata', () => {
    it('should generate tools with descriptive names and descriptions', () => {
      const intake: IntakeDefinition = {
        id: 'feedback_form',
        version: '1.0.0',
        name: 'Feedback Form',
        description: 'Collect user feedback',
        schema: z.object({
          rating: z.number().min(1).max(5).describe('Rating from 1 to 5'),
          comment: z.string().min(10).describe('Feedback comment'),
        }),
        destination: {
          type: 'webhook',
          name: 'Feedback API',
          config: { url: 'https://api.example.com/feedback' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      // Create tool
      expect(tools.create.name).toBe('feedback_form_create');
      expect(tools.create.description).toBeDefined();
      expect(tools.create.description.length).toBeGreaterThan(0);

      // Set tool
      expect(tools.set.name).toBe('feedback_form_set');
      expect(tools.set.description).toContain('Update');

      // Validate tool
      expect(tools.validate.name).toBe('feedback_form_validate');
      expect(tools.validate.description).toContain('Validate');

      // Submit tool
      expect(tools.submit.name).toBe('feedback_form_submit');
      expect(tools.submit.description).toContain('Submit');
    });

    it('should include field descriptions in tool metadata', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field1: z.string().describe('First field description'),
          field2: z.number().describe('Second field description'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      // Tool descriptions should reference the fields
      expect(tools.create.description).toContain('field1');
      expect(tools.create.description).toContain('field2');
    });
  });

  describe('MCP protocol compliance', () => {
    it('should have tools with valid JSON Schema input schemas', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          name: z.string(),
          age: z.number(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      // All tools should have valid JSON Schema
      [tools.create, tools.set, tools.validate, tools.submit].forEach(
        (tool) => {
          expect(tool.inputSchema).toBeDefined();
          expect(tool.inputSchema.type).toBe('object');
          expect(tool.inputSchema.properties).toBeDefined();
        }
      );
    });

    it('should generate unique tool names for each intake', () => {
      const intake1: IntakeDefinition = {
        id: 'form_a',
        version: '1.0.0',
        name: 'Form A',
        schema: z.object({ field: z.string() }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const intake2: IntakeDefinition = {
        id: 'form_b',
        version: '1.0.0',
        name: 'Form B',
        schema: z.object({ field: z.string() }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools1 = generateToolsFromIntake(intake1);
      const tools2 = generateToolsFromIntake(intake2);

      expect(tools1.create.name).not.toBe(tools2.create.name);
      expect(tools1.set.name).not.toBe(tools2.set.name);
      expect(tools1.validate.name).not.toBe(tools2.validate.name);
      expect(tools1.submit.name).not.toBe(tools2.submit.name);
    });
  });

  describe('performance', () => {
    it('should generate tools for 10+ field schema in under 100ms', () => {
      // Create complex schema with 10+ fields (acceptance criteria)
      const complexSchema = z.object({
        legal_name: z.string().describe('Legal business name'),
        country: z.string().length(2).describe('Two-letter country code'),
        tax_id: z.string().describe('Tax identification number'),
        bank_account: z
          .object({
            account_number: z.string().describe('Bank account number'),
            routing_number: z.string().describe('Bank routing number'),
            account_holder_name: z.string().describe('Account holder name'),
          })
          .describe('Bank account information'),
        documents: z
          .object({
            w9_or_w8: z.string().describe('W-9 or W-8 form upload'),
          })
          .describe('Required tax documents'),
        contact_info: z
          .object({
            name: z.string().describe('Primary contact name'),
            email: z.string().email().describe('Primary contact email'),
            phone: z.string().describe('Primary contact phone'),
          })
          .describe('Contact information'),
        business_type: z
          .enum(['sole_proprietor', 'llc', 'corporation', 'partnership'])
          .describe('Type of business entity'),
        employees: z.number().min(1).describe('Number of employees'),
        annual_revenue: z.number().min(0).describe('Annual revenue in USD'),
        established_date: z
          .string()
          .describe('Date business was established'),
      });

      const intake: IntakeDefinition = {
        id: 'performance_test',
        version: '1.0.0',
        name: 'Performance Test Form',
        description: 'Test form for performance validation',
        schema: complexSchema,
        destination: {
          type: 'webhook',
          name: 'Performance API',
          config: { url: 'https://api.example.com/test' },
        },
      };

      const server = new FormBridgeMCPServer({
        name: 'performance-test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      });

      // Measure tool generation time
      const startTime = performance.now();
      server.registerIntake(intake);
      const tools = generateToolsFromIntake(intake);
      const endTime = performance.now();

      const duration = endTime - startTime;

      // Should generate tools in under 100ms (acceptance criteria)
      expect(duration).toBeLessThan(100);

      // Verify tools are generated correctly
      expect(tools.create).toBeDefined();
      expect(tools.set).toBeDefined();
      expect(tools.validate).toBeDefined();
      expect(tools.submit).toBeDefined();

      // Verify intake is registered
      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].id).toBe('performance_test');
    });
  });

  describe('server configuration', () => {
    it('should create server with basic config', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

      expect(server).toBeDefined();
      expect(server.getServer()).toBeDefined();
      expect(server.getIntakes()).toEqual([]);
    });

    it('should create server with instructions', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
        instructions: 'Test server instructions',
      };

      const server = new FormBridgeMCPServer(config);

      expect(server).toBeDefined();
    });

    it('should handle server updates when re-registering intake', () => {
      const server = new FormBridgeMCPServer({
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      });

      const intake1: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form V1',
        schema: z.object({ field: z.string() }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const intake2: IntakeDefinition = {
        id: 'test_form',
        version: '2.0.0',
        name: 'Test Form V2',
        schema: z.object({ field: z.string(), newField: z.number() }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      server.registerIntake(intake1);
      server.registerIntake(intake2);

      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].version).toBe('2.0.0');
      expect(intakes[0].name).toBe('Test Form V2');
    });
  });
});
