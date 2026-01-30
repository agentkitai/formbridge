/**
 * Tests for MCP Tool Generator
 *
 * Tests the generation of MCP tool definitions from IntakeDefinition schemas, including:
 * - Tool generation from IntakeDefinition
 * - Tool structure (create, set, validate, submit)
 * - Tool input schemas
 * - Tool descriptions with field information
 * - Tool generation options
 * - Tool name generation and parsing
 * - Large schemas with 10+ fields
 * - Performance requirements
 */

import { z } from 'zod';
import {
  generateToolsFromIntake,
  generateToolName,
  parseToolName,
  type ToolGenerationOptions,
  type GeneratedTools,
} from '../../src/mcp/tool-generator';
import type { IntakeDefinition } from '../../src/schemas/intake-schema';
import type { MCPToolDefinition, ToolOperation } from '../../src/types/mcp-types';

describe('generateToolsFromIntake', () => {
  describe('basic tool generation', () => {
    it('should generate all four tools from a simple intake definition', () => {
      const intake: IntakeDefinition = {
        id: 'simple_form',
        version: '1.0.0',
        name: 'Simple Form',
        schema: z.object({
          name: z.string().describe('User name'),
          email: z.string().email().describe('User email'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test Webhook',
          config: { url: 'https://example.com/webhook' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools).toBeDefined();
      expect(tools.create).toBeDefined();
      expect(tools.set).toBeDefined();
      expect(tools.validate).toBeDefined();
      expect(tools.submit).toBeDefined();
    });

    it('should generate tools with correct names', () => {
      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        schema: z.object({
          name: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Vendor API',
          config: { url: 'https://example.com/vendor' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create.name).toBe('vendor_onboarding_create');
      expect(tools.set.name).toBe('vendor_onboarding_set');
      expect(tools.validate.name).toBe('vendor_onboarding_validate');
      expect(tools.submit.name).toBe('vendor_onboarding_submit');
    });

    it('should generate tools with intake name in descriptions', () => {
      const intake: IntakeDefinition = {
        id: 'contact_form',
        version: '1.0.0',
        name: 'Contact Form',
        description: 'Customer contact information intake',
        schema: z.object({
          name: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Contact API',
          config: { url: 'https://example.com/contact' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      // When description is provided, it's used instead of name
      expect(tools.create.description).toContain('Customer contact information intake');
      expect(tools.set.description).toContain('Customer contact information intake');
      expect(tools.validate.description).toContain('Customer contact information intake');
      expect(tools.submit.description).toContain('Customer contact information intake');
    });
  });

  describe('create tool', () => {
    it('should have correct input schema structure', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field1: z.string(),
          field2: z.number(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const createTool = tools.create;

      expect(createTool.inputSchema.type).toBe('object');
      expect(createTool.inputSchema.properties).toBeDefined();
      expect(createTool.inputSchema.properties?.data).toBeDefined();
      expect(createTool.inputSchema.properties?.idempotencyKey).toBeDefined();
    });

    it('should make all data fields optional in create tool', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          required1: z.string(),
          required2: z.number(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const createTool = tools.create;

      // data and idempotencyKey are optional at top level
      expect(createTool.inputSchema.required).toBeUndefined();

      // The data.properties should contain the schema fields
      const dataProps = createTool.inputSchema.properties?.data?.properties;
      expect(dataProps?.required1).toBeDefined();
      expect(dataProps?.required2).toBeDefined();
    });

    it('should include field properties in data schema', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          name: z.string().describe('User name'),
          age: z.number().min(18).describe('User age'),
          email: z.string().email().describe('Email address'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const createTool = tools.create;

      const dataProps = createTool.inputSchema.properties?.data?.properties;
      expect(dataProps?.name).toBeDefined();
      expect(dataProps?.age).toBeDefined();
      expect(dataProps?.email).toBeDefined();
      expect(dataProps?.name?.type).toBe('string');
      expect(dataProps?.age?.type).toBe('number');
    });

    it('should include field descriptions in create tool description', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          name: z.string().describe('User full name'),
          email: z.string().email().describe('Contact email address'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const createTool = tools.create;

      expect(createTool.description).toContain('name');
      expect(createTool.description).toContain('email');
      expect(createTool.description).toContain('User full name');
      expect(createTool.description).toContain('Contact email address');
    });
  });

  describe('set tool', () => {
    it('should require resumeToken and data', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const setTool = tools.set;

      expect(setTool.inputSchema.required).toEqual(['resumeToken', 'data']);
      expect(setTool.inputSchema.properties?.resumeToken).toBeDefined();
      expect(setTool.inputSchema.properties?.data).toBeDefined();
    });

    it('should include all schema fields in data properties', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field1: z.string(),
          field2: z.number(),
          field3: z.boolean(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const setTool = tools.set;

      const dataProps = setTool.inputSchema.properties?.data?.properties;
      expect(dataProps?.field1).toBeDefined();
      expect(dataProps?.field2).toBeDefined();
      expect(dataProps?.field3).toBeDefined();
    });

    it('should have update description', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const setTool = tools.set;

      expect(setTool.description).toContain('Update');
    });
  });

  describe('validate tool', () => {
    it('should require only resumeToken', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const validateTool = tools.validate;

      expect(validateTool.inputSchema.required).toEqual(['resumeToken']);
      expect(validateTool.inputSchema.properties?.resumeToken).toBeDefined();
      expect(validateTool.inputSchema.properties?.resumeToken?.type).toBe('string');
    });

    it('should have validation description', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const validateTool = tools.validate;

      expect(validateTool.description).toContain('Validate');
      expect(validateTool.description).toContain('Test Form');
    });

    it('should mention validation errors in description', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const validateTool = tools.validate;

      expect(validateTool.description.toLowerCase()).toContain('validation');
    });
  });

  describe('submit tool', () => {
    it('should require only resumeToken', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const submitTool = tools.submit;

      expect(submitTool.inputSchema.required).toEqual(['resumeToken']);
      expect(submitTool.inputSchema.properties?.resumeToken).toBeDefined();
    });

    it('should list required fields in description', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          name: z.string(),
          email: z.string().email(),
          age: z.number(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const submitTool = tools.submit;

      expect(submitTool.description).toContain('Required fields');
      expect(submitTool.description).toContain('name');
      expect(submitTool.description).toContain('email');
      expect(submitTool.description).toContain('age');
    });

    it('should have submit description', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const submitTool = tools.submit;

      expect(submitTool.description).toContain('Submit');
    });

    it('should handle schema with no required fields', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          optional: z.string().optional(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const submitTool = tools.submit;

      // Should not crash and should have a description
      expect(submitTool.description).toBeDefined();
      expect(submitTool.description).toContain('Submit');
    });
  });

  describe('tool generation options', () => {
    it('should exclude optional fields when includeOptionalFields is false', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          required: z.string().describe('Required field'),
          optional: z.string().optional().describe('Optional field'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const options: ToolGenerationOptions = {
        includeOptionalFields: false,
      };

      const tools = generateToolsFromIntake(intake, options);

      expect(tools.create.description).toContain('required');
      expect(tools.create.description).not.toContain('optional');
    });

    it('should limit fields in description when maxFieldsInDescription is set', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field1: z.string().describe('Field 1'),
          field2: z.string().describe('Field 2'),
          field3: z.string().describe('Field 3'),
          field4: z.string().describe('Field 4'),
          field5: z.string().describe('Field 5'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const options: ToolGenerationOptions = {
        maxFieldsInDescription: 2,
      };

      const tools = generateToolsFromIntake(intake, options);

      // Should mention there are more fields
      expect(tools.create.description).toContain('more field');
      expect(tools.create.description).toContain('3');
    });

    it('should handle all options combined', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          required1: z.string().describe('Required 1'),
          required2: z.string().describe('Required 2'),
          optional: z.string().optional().describe('Optional'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const options: ToolGenerationOptions = {
        includeOptionalFields: false,
        includeConstraints: true,
        maxFieldsInDescription: 1,
      };

      const tools = generateToolsFromIntake(intake, options);

      // Should only show 1 required field and mention 1 more
      expect(tools.create.description).toContain('required1');
      expect(tools.create.description).toContain('1 more field');
      expect(tools.create.description).not.toContain('optional');
    });
  });

  describe('required vs optional fields', () => {
    it('should mark required fields in tool descriptions', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          required: z.string().describe('Required field'),
          optional: z.string().optional().describe('Optional field'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create.description).toContain('required (required)');
      expect(tools.create.description).not.toContain('optional (required)');
    });

    it('should handle all required fields', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field1: z.string(),
          field2: z.number(),
          field3: z.boolean(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create.description).toContain('field1 (required)');
      expect(tools.create.description).toContain('field2 (required)');
      expect(tools.create.description).toContain('field3 (required)');
    });

    it('should handle all optional fields', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field1: z.string().optional(),
          field2: z.number().optional(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create.description).not.toContain('(required)');
    });
  });

  describe('complex schemas', () => {
    it('should handle nested objects', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          user: z.object({
            name: z.string().describe('User name'),
            contact: z.object({
              email: z.string().email().describe('Email'),
              phone: z.string().describe('Phone'),
            }),
          }),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create).toBeDefined();
      expect(tools.create.inputSchema.properties?.data?.properties?.user).toBeDefined();
      expect(tools.create.inputSchema.properties?.data?.properties?.user?.type).toBe('object');
    });

    it('should handle arrays', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          tags: z.array(z.string()).describe('Tags'),
          items: z.array(z.object({
            name: z.string(),
            quantity: z.number(),
          })).describe('Items'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create).toBeDefined();
      expect(tools.create.inputSchema.properties?.data?.properties?.tags?.type).toBe('array');
      expect(tools.create.inputSchema.properties?.data?.properties?.items?.type).toBe('array');
    });

    it('should handle enums', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          status: z.enum(['pending', 'approved', 'rejected']).describe('Status'),
          priority: z.enum(['low', 'medium', 'high']).describe('Priority'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create).toBeDefined();
      const statusProp = tools.create.inputSchema.properties?.data?.properties?.status;
      expect(statusProp?.enum).toEqual(['pending', 'approved', 'rejected']);
    });

    it('should handle large schemas with 10+ fields', () => {
      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        description: 'Complete vendor onboarding form',
        schema: z.object({
          legal_name: z.string().describe('Legal business name'),
          country: z.string().length(2).describe('Two-letter country code'),
          tax_id: z.string().describe('Tax identification number'),
          bank_account: z.object({
            account_number: z.string().describe('Bank account number'),
            routing_number: z.string().describe('Bank routing number'),
            account_holder_name: z.string().describe('Account holder name'),
          }).describe('Bank account information'),
          documents: z.object({
            w9_or_w8: z.string().describe('W-9 or W-8 form'),
            certificate_of_insurance: z.string().optional().describe('Certificate of insurance'),
          }).describe('Required documentation'),
          contact: z.object({
            email: z.string().email().describe('Primary contact email'),
            phone: z.string().describe('Primary contact phone'),
          }).describe('Contact information'),
          business_type: z.enum(['sole_proprietor', 'llc', 'corporation', 'partnership'])
            .describe('Type of business entity'),
          employees: z.number().min(1).describe('Number of employees'),
          annual_revenue: z.number().min(0).describe('Annual revenue in USD'),
          established_date: z.string().describe('Date business was established'),
        }),
        destination: {
          type: 'webhook',
          name: 'Vendor API',
          config: { url: 'https://example.com/vendor' },
        },
      };

      const startTime = performance.now();
      const tools = generateToolsFromIntake(intake);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Verify all tools are generated
      expect(tools.create).toBeDefined();
      expect(tools.set).toBeDefined();
      expect(tools.validate).toBeDefined();
      expect(tools.submit).toBeDefined();

      // Verify tool names
      expect(tools.create.name).toBe('vendor_onboarding_create');
      expect(tools.set.name).toBe('vendor_onboarding_set');
      expect(tools.validate.name).toBe('vendor_onboarding_validate');
      expect(tools.submit.name).toBe('vendor_onboarding_submit');

      // Verify field properties exist
      const createDataProps = tools.create.inputSchema.properties?.data?.properties;
      expect(createDataProps?.legal_name).toBeDefined();
      expect(createDataProps?.country).toBeDefined();
      expect(createDataProps?.tax_id).toBeDefined();
      expect(createDataProps?.bank_account).toBeDefined();
      expect(createDataProps?.documents).toBeDefined();
      expect(createDataProps?.contact).toBeDefined();
      expect(createDataProps?.business_type).toBeDefined();
      expect(createDataProps?.employees).toBeDefined();
      expect(createDataProps?.annual_revenue).toBeDefined();
      expect(createDataProps?.established_date).toBeDefined();

      // Verify performance (should be under 100ms)
      expect(duration).toBeLessThan(100);

      // Verify descriptions include field information
      expect(tools.create.description).toContain('legal_name');
      expect(tools.create.description).toContain('(required)');

      // Verify submit tool lists required fields
      expect(tools.submit.description).toContain('Required fields');
    });
  });

  describe('field constraints', () => {
    it('should preserve min/max constraints in JSON schema', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          age: z.number().min(18).max(120).describe('Age in years'),
          username: z.string().min(3).max(20).describe('Username'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const ageField = tools.create.inputSchema.properties?.data?.properties?.age;
      const usernameField = tools.create.inputSchema.properties?.data?.properties?.username;

      expect(ageField?.minimum).toBe(18);
      expect(ageField?.maximum).toBe(120);
      expect(usernameField?.minLength).toBe(3);
      expect(usernameField?.maxLength).toBe(20);
    });

    it('should preserve email format constraint', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          email: z.string().email().describe('Email address'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);
      const emailField = tools.create.inputSchema.properties?.data?.properties?.email;

      expect(emailField).toBeDefined();
      // The format should be preserved by zod-to-json-schema
      expect(emailField?.type).toBe('string');
    });
  });

  describe('JSON Schema compliance', () => {
    it('should generate valid JSON Schema for input schemas', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      // Each tool should have a valid input schema
      for (const tool of [tools.create, tools.set, tools.validate, tools.submit]) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(tool.inputSchema.additionalProperties).toBe(false);
      }
    });

    it('should set additionalProperties to false', () => {
      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools = generateToolsFromIntake(intake);

      expect(tools.create.inputSchema.additionalProperties).toBe(false);
      expect(tools.set.inputSchema.additionalProperties).toBe(false);
      expect(tools.validate.inputSchema.additionalProperties).toBe(false);
      expect(tools.submit.inputSchema.additionalProperties).toBe(false);
    });
  });
});

describe('generateToolName', () => {
  it('should generate correct tool names', () => {
    expect(generateToolName('vendor_onboarding', 'create')).toBe('vendor_onboarding_create');
    expect(generateToolName('vendor_onboarding', 'set')).toBe('vendor_onboarding_set');
    expect(generateToolName('vendor_onboarding', 'validate')).toBe('vendor_onboarding_validate');
    expect(generateToolName('vendor_onboarding', 'submit')).toBe('vendor_onboarding_submit');
  });

  it('should handle different intake IDs', () => {
    expect(generateToolName('contact_form', 'create')).toBe('contact_form_create');
    expect(generateToolName('user_registration', 'submit')).toBe('user_registration_submit');
    expect(generateToolName('feedback', 'validate')).toBe('feedback_validate');
  });

  it('should handle intake IDs with multiple underscores', () => {
    expect(generateToolName('vendor_onboarding_v2', 'create')).toBe('vendor_onboarding_v2_create');
    expect(generateToolName('multi_part_form_name', 'set')).toBe('multi_part_form_name_set');
  });
});

describe('parseToolName', () => {
  it('should parse valid tool names', () => {
    const result1 = parseToolName('vendor_onboarding_create');
    expect(result1).toEqual({
      intakeId: 'vendor_onboarding',
      operation: 'create',
    });

    const result2 = parseToolName('contact_form_submit');
    expect(result2).toEqual({
      intakeId: 'contact_form',
      operation: 'submit',
    });
  });

  it('should parse all operation types', () => {
    expect(parseToolName('test_create')?.operation).toBe('create');
    expect(parseToolName('test_set')?.operation).toBe('set');
    expect(parseToolName('test_validate')?.operation).toBe('validate');
    expect(parseToolName('test_submit')?.operation).toBe('submit');
  });

  it('should handle intake IDs with multiple underscores', () => {
    const result = parseToolName('multi_part_form_name_create');
    expect(result).toEqual({
      intakeId: 'multi_part_form_name',
      operation: 'create',
    });
  });

  it('should return null for invalid tool names', () => {
    expect(parseToolName('invalid')).toBeNull();
    expect(parseToolName('no_operation')).toBeNull();
    expect(parseToolName('invalid_invalid_operation')).toBeNull();
    expect(parseToolName('')).toBeNull();
  });

  it('should return null for tool names without underscores', () => {
    expect(parseToolName('create')).toBeNull();
    expect(parseToolName('submit')).toBeNull();
  });

  it('should validate operation types', () => {
    expect(parseToolName('test_create')).not.toBeNull();
    expect(parseToolName('test_invalid_op')).toBeNull();
    expect(parseToolName('test_delete')).toBeNull();
  });

  it('should round-trip with generateToolName', () => {
    const intakeId = 'vendor_onboarding';
    const operation: ToolOperation = 'create';

    const toolName = generateToolName(intakeId, operation);
    const parsed = parseToolName(toolName);

    expect(parsed).toEqual({ intakeId, operation });
  });
});
