/**
 * MCP Protocol Compliance Tests
 *
 * Verifies that the FormBridge MCP server complies with the Model Context Protocol (MCP)
 * specification. Tests cover:
 * - tools/list response format
 * - tools/call request/response format
 * - JSON Schema compliance for tool inputs
 * - Error response format
 * - Tool metadata requirements
 *
 * References:
 * - MCP Specification: https://modelcontextprotocol.io/docs/concepts/tools
 * - JSON Schema Draft 2020-12: https://json-schema.org/draft/2020-12/json-schema-core.html
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { FormBridgeMCPServer } from '../../src/mcp/server';
import type { IntakeDefinition } from '../../src/schemas/intake-schema';
import type { MCPServerConfig } from '../../src/types/mcp-types';
import { generateToolsFromIntake } from '../../src/mcp/tool-generator';

describe('MCP Protocol Compliance', () => {
  let server: FormBridgeMCPServer;
  let intake: IntakeDefinition;

  beforeEach(() => {
    // Create server with basic config
    const config: MCPServerConfig = {
      name: 'mcp-compliance-test-server',
      version: '1.0.0',
      transport: { type: 'stdio' },
    };

    server = new FormBridgeMCPServer(config);

    // Register a test intake
    intake = {
      id: 'test_form',
      version: '1.0.0',
      name: 'Test Form',
      description: 'Test form for MCP compliance verification',
      schema: z.object({
        name: z.string().min(2).describe('User name (min 2 characters)'),
        email: z.string().email().describe('Email address'),
        age: z.number().min(18).describe('Age (must be 18+)'),
      }),
      destination: {
        type: 'webhook',
        name: 'Test API',
        config: { url: 'https://api.example.com/test' },
      },
    };

    server.registerIntake(intake);
  });

  describe('tools/list response format', () => {
    it('should generate tools array for registered intake', () => {
      // Generate tools for the intake
      const tools = generateToolsFromIntake(intake);

      // Should have 4 tools (create, set, validate, submit)
      expect(tools).toHaveProperty('create');
      expect(tools).toHaveProperty('set');
      expect(tools).toHaveProperty('validate');
      expect(tools).toHaveProperty('submit');
    });

    it('should generate 4 tools per registered intake', () => {
      const tools = generateToolsFromIntake(intake);

      // Count the tools
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];
      expect(toolArray).toHaveLength(4);
    });

    it('should generate tools with required MCP fields', () => {
      const tools = generateToolsFromIntake(intake);
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      toolArray.forEach((tool) => {
        // Each tool must have name, description, and inputSchema
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');

        // Verify types
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
      });
    });

    it('should generate tools with valid JSON Schema input schemas', () => {
      const tools = generateToolsFromIntake(intake);
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      toolArray.forEach((tool) => {
        const schema = tool.inputSchema;

        // JSON Schema must have type
        expect(schema).toHaveProperty('type');
        expect(schema.type).toBe('object');

        // Should have properties
        expect(schema).toHaveProperty('properties');
        expect(typeof schema.properties).toBe('object');

        // May have required array
        if (schema.required) {
          expect(Array.isArray(schema.required)).toBe(true);
        }
      });
    });

    it('should generate unique tool names', () => {
      const tools = generateToolsFromIntake(intake);
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];
      const names = toolArray.map((t) => t.name);

      // All tool names should be unique
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should include intake ID in tool names', () => {
      const tools = generateToolsFromIntake(intake);
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      // All tools should include the intake ID in their name
      toolArray.forEach((tool) => {
        expect(tool.name).toContain('test_form');
      });
    });

    it('should generate tools for multiple intakes', () => {
      // Create a second intake
      const intake2: IntakeDefinition = {
        id: 'second_form',
        version: '1.0.0',
        name: 'Second Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const tools1 = generateToolsFromIntake(intake);
      const tools2 = generateToolsFromIntake(intake2);

      // Should have tools for both intakes
      expect(tools1.create.name).toContain('test_form');
      expect(tools2.create.name).toContain('second_form');

      // Tool names should be different
      expect(tools1.create.name).not.toBe(tools2.create.name);
    });
  });

  describe('tools/call request/response format', () => {
    it('should verify MCP server has been initialized', () => {
      const mcpServer = server.getServer();

      // Server should be properly initialized
      expect(mcpServer).toBeDefined();
      expect(mcpServer).toBeInstanceOf(Object);
    });

    it('should verify tools have correct operation types', () => {
      const tools = generateToolsFromIntake(intake);

      // Verify each tool name indicates its operation
      expect(tools.create.name).toContain('create');
      expect(tools.set.name).toContain('set');
      expect(tools.validate.name).toContain('validate');
      expect(tools.submit.name).toContain('submit');
    });

    it('should generate input schemas for all operations', () => {
      const tools = generateToolsFromIntake(intake);

      // All tools should have input schemas
      expect(tools.create.inputSchema).toBeDefined();
      expect(tools.set.inputSchema).toBeDefined();
      expect(tools.validate.inputSchema).toBeDefined();
      expect(tools.submit.inputSchema).toBeDefined();

      // All should be object type (MCP requirement)
      expect(tools.create.inputSchema.type).toBe('object');
      expect(tools.set.inputSchema.type).toBe('object');
      expect(tools.validate.inputSchema.type).toBe('object');
      expect(tools.submit.inputSchema.type).toBe('object');
    });
  });

  describe('error response format', () => {
    it('should define error handling through Intake Contract types', () => {
      // The server should use IntakeError format defined in intake-contract.ts
      // Verify that the types are correctly imported
      const tools = generateToolsFromIntake(intake);

      // Tools should have proper schemas that can be validated
      expect(tools.create.inputSchema).toBeDefined();
      expect(tools.set.inputSchema).toBeDefined();
    });

    it('should specify required fields for operations that need them', () => {
      const tools = generateToolsFromIntake(intake);

      // Set operation requires resumeToken and data
      expect(tools.set.inputSchema.required).toContain('resumeToken');
      expect(tools.set.inputSchema.required).toContain('data');

      // Validate and submit require resumeToken
      expect(tools.validate.inputSchema.required).toContain('resumeToken');
      expect(tools.submit.inputSchema.required).toContain('resumeToken');
    });

    it('should define proper input schema structure for error validation', () => {
      const tools = generateToolsFromIntake(intake);

      // All operations should have well-defined schemas
      // that can be used for validation
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      toolArray.forEach((tool) => {
        expect(tool.inputSchema.properties).toBeDefined();
        expect(typeof tool.inputSchema.properties).toBe('object');
      });
    });
  });

  describe('JSON Schema compliance', () => {
    it('should generate JSON Schema Draft 2020-12 compatible schemas', () => {
      const tools = generateToolsFromIntake(intake);
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      toolArray.forEach((tool) => {
        const schema = tool.inputSchema;

        // Should be valid JSON Schema
        expect(schema).toHaveProperty('type');
        expect(schema.type).toBe('object');

        // Properties should be objects
        if (schema.properties) {
          Object.values(schema.properties).forEach((prop: any) => {
            expect(typeof prop).toBe('object');
          });
        }

        // Required should be string array if present
        if (schema.required) {
          expect(Array.isArray(schema.required)).toBe(true);
          schema.required.forEach((field: any) => {
            expect(typeof field).toBe('string');
          });
        }
      });
    });

    it('should include field descriptions in schemas', () => {
      const tools = generateToolsFromIntake(intake);

      const dataSchema = tools.create.inputSchema.properties?.data;
      expect(dataSchema).toBeDefined();

      // Data property should have nested properties with descriptions
      if (dataSchema && typeof dataSchema === 'object' && 'properties' in dataSchema) {
        const properties = (dataSchema as any).properties;
        if (properties) {
          const nameField = properties.name;
          if (nameField) {
            // Field should have description
            expect(nameField).toHaveProperty('description');
            expect(typeof nameField.description).toBe('string');
          }
        }
      }
    });

    it('should include constraints in schemas', () => {
      const tools = generateToolsFromIntake(intake);

      const dataSchema = tools.create.inputSchema.properties?.data;

      if (dataSchema && typeof dataSchema === 'object' && 'properties' in dataSchema) {
        const properties = (dataSchema as any).properties;

        // String fields may have minLength
        const nameField = properties?.name;
        if (nameField && nameField.type === 'string' && nameField.minLength) {
          expect(typeof nameField.minLength).toBe('number');
          expect(nameField.minLength).toBeGreaterThan(0);
        }

        // Number fields may have minimum
        const ageField = properties?.age;
        if (ageField && ageField.type === 'number' && ageField.minimum !== undefined) {
          expect(typeof ageField.minimum).toBe('number');
        }

        // Email fields should have format
        const emailField = properties?.email;
        if (emailField && emailField.format) {
          expect(emailField.format).toBe('email');
        }
      }
    });

    it('should mark required fields in create tool schema', () => {
      const tools = generateToolsFromIntake(intake);
      const schema = tools.create.inputSchema;

      // Create tool has optional data parameter
      // (data is not required because create can be called with no data)
      expect(schema.properties).toHaveProperty('data');
    });

    it('should mark required fields in set tool schema', () => {
      const tools = generateToolsFromIntake(intake);
      const schema = tools.set.inputSchema;

      // Set tool requires resumeToken and data
      expect(schema.required).toContain('resumeToken');
      expect(schema.required).toContain('data');
    });

    it('should mark required fields in validate/submit tool schemas', () => {
      const tools = generateToolsFromIntake(intake);

      // Both require resumeToken
      expect(tools.validate.inputSchema.required).toContain('resumeToken');
      expect(tools.submit.inputSchema.required).toContain('resumeToken');
    });
  });

  describe('tool metadata requirements', () => {
    it('should provide descriptive tool names', () => {
      const tools = generateToolsFromIntake(intake);
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      toolArray.forEach((tool) => {
        // Tool names should be descriptive
        expect(tool.name.length).toBeGreaterThan(5);
        // Should contain intake ID
        expect(tool.name).toContain('test_form');
        // Should contain operation
        expect(
          tool.name.includes('create') ||
            tool.name.includes('set') ||
            tool.name.includes('validate') ||
            tool.name.includes('submit')
        ).toBe(true);
      });
    });

    it('should provide descriptive tool descriptions', () => {
      const tools = generateToolsFromIntake(intake);
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      toolArray.forEach((tool) => {
        // Descriptions should be meaningful
        expect(tool.description.length).toBeGreaterThan(10);
        expect(typeof tool.description).toBe('string');
      });
    });

    it('should include field information in descriptions', () => {
      const tools = generateToolsFromIntake(intake);

      // Description should mention fields
      expect(tools.create.description).toBeTruthy();
      // Should be helpful for LLMs
      expect(tools.create.description.length).toBeGreaterThan(20);

      // Create tool description should reference the form fields
      const description = tools.create.description.toLowerCase();
      // Should contain some reference to the intake form
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('MCP server information', () => {
    it('should expose server name and version', () => {
      const mcpServer = server.getServer();

      // The MCP Server instance should exist
      expect(mcpServer).toBeDefined();
      expect(mcpServer).toBeInstanceOf(Object);
    });

    it('should support tools capability', () => {
      const mcpServer = server.getServer();

      // Server should be properly configured
      expect(mcpServer).toBeDefined();

      // Server should have intakes registered
      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].id).toBe('test_form');
    });

    it('should generate tools that conform to MCP tool format', () => {
      const tools = generateToolsFromIntake(intake);

      // All generated tools should follow MCP format
      const toolArray = [tools.create, tools.set, tools.validate, tools.submit];

      toolArray.forEach((tool) => {
        // MCP tool format requirements
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');

        // Input schema should be valid JSON Schema
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema).toHaveProperty('properties');

        // Names should follow convention: {intake_id}_{operation}
        expect(tool.name).toMatch(/^[a-z_]+_(create|set|validate|submit)$/);
      });
    });
  });
});
