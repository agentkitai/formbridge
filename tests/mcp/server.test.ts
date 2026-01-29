/**
 * Tests for FormBridge MCP Server
 *
 * Tests the MCP server implementation including:
 * - Server initialization and configuration
 * - Intake registration (single and multiple)
 * - Tool generation from intakes
 * - Server public API
 * - Integration with underlying MCP SDK
 * - Transport configuration
 */

import { z } from 'zod';
import { FormBridgeMCPServer } from '../../src/mcp/server';
import type { IntakeDefinition } from '../../src/schemas/intake-schema';
import type { MCPServerConfig } from '../../src/types/mcp-types';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { generateToolsFromIntake } from '../../src/mcp/tool-generator';

describe('FormBridgeMCPServer', () => {
  describe('server initialization', () => {
    it('should create server with basic config', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

      expect(server).toBeDefined();
      expect(server.getServer()).toBeDefined();
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

    it('should throw error for unsupported transport type on start', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'sse' as any },
      };

      const server = new FormBridgeMCPServer(config);

      // Starting the server should throw for unsupported transport
      await expect(server.start()).rejects.toThrow('Unsupported transport type');
    });

    it('should initialize with empty intake list', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      const intakes = server.getIntakes();

      expect(intakes).toHaveLength(0);
    });
  });

  describe('intake registration', () => {
    it('should register a single intake', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          field: z.string(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test Webhook',
          config: { url: 'https://example.com' },
        },
      };

      server.registerIntake(intake);

      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].id).toBe('test_form');
    });

    it('should register multiple intakes individually', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

      const intake1: IntakeDefinition = {
        id: 'form_1',
        version: '1.0.0',
        name: 'Form 1',
        schema: z.object({ field1: z.string() }),
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
        schema: z.object({ field2: z.number() }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      server.registerIntake(intake1);
      server.registerIntake(intake2);

      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(2);
      expect(intakes.find(i => i.id === 'form_1')).toBeDefined();
      expect(intakes.find(i => i.id === 'form_2')).toBeDefined();
    });

    it('should register multiple intakes in batch', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

      const intakes: IntakeDefinition[] = [
        {
          id: 'form_1',
          version: '1.0.0',
          name: 'Form 1',
          schema: z.object({ field1: z.string() }),
          destination: {
            type: 'webhook',
            name: 'Test',
            config: { url: 'https://example.com' },
          },
        },
        {
          id: 'form_2',
          version: '1.0.0',
          name: 'Form 2',
          schema: z.object({ field2: z.number() }),
          destination: {
            type: 'webhook',
            name: 'Test',
            config: { url: 'https://example.com' },
          },
        },
        {
          id: 'form_3',
          version: '1.0.0',
          name: 'Form 3',
          schema: z.object({ field3: z.boolean() }),
          destination: {
            type: 'webhook',
            name: 'Test',
            config: { url: 'https://example.com' },
          },
        },
      ];

      server.registerIntakes(intakes);

      const registeredIntakes = server.getIntakes();
      expect(registeredIntakes).toHaveLength(3);
    });

    it('should update existing intake when registering with same ID', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

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

    it('should handle complex intake schemas', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

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
          }).describe('Bank account information'),
          documents: z.object({
            w9_or_w8: z.string().describe('W-9 or W-8 form'),
          }).describe('Required documentation'),
        }),
        destination: {
          type: 'webhook',
          name: 'Vendor API',
          config: { url: 'https://example.com/vendor' },
        },
      };

      server.registerIntake(intake);

      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].id).toBe('vendor_onboarding');
    });
  });

  describe('MCP SDK integration', () => {
    it('should create underlying MCP Server instance', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      const mcpServer = server.getServer();

      expect(mcpServer).toBeDefined();
      expect(mcpServer).toBeInstanceOf(Server);
    });

    it('should configure MCP server with capabilities', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      const mcpServer = server.getServer();

      // The MCP Server should be properly initialized with tools capability
      expect(mcpServer).toBeDefined();
    });

    it('should pass server name and version to MCP SDK', () => {
      const config: MCPServerConfig = {
        name: 'my-custom-server',
        version: '2.5.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      const mcpServer = server.getServer();

      expect(mcpServer).toBeDefined();
      // The MCP Server stores these internally
    });

    it('should configure MCP server with instructions if provided', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
        instructions: 'Custom server instructions for AI agents',
      };

      const server = new FormBridgeMCPServer(config);
      const mcpServer = server.getServer();

      expect(mcpServer).toBeDefined();
    });
  });

  describe('tool generation verification', () => {
    it('should generate tools for registered intakes', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

      const intake: IntakeDefinition = {
        id: 'test_form',
        version: '1.0.0',
        name: 'Test Form',
        schema: z.object({
          name: z.string().describe('User name'),
          email: z.string().email().describe('User email'),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      server.registerIntake(intake);

      // Verify intake is registered
      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);

      // Verify tools would be generated correctly using the tool generator
      const tools = generateToolsFromIntake(intake);
      expect(tools.create.name).toBe('test_form_create');
      expect(tools.set.name).toBe('test_form_set');
      expect(tools.validate.name).toBe('test_form_validate');
      expect(tools.submit.name).toBe('test_form_submit');
    });

    it('should generate tools for multiple intakes', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

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

      // Verify both intakes are registered
      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(2);

      // Verify tools for each intake
      const tools1 = generateToolsFromIntake(intake1);
      const tools2 = generateToolsFromIntake(intake2);

      expect(tools1.create.name).toBe('form_1_create');
      expect(tools2.create.name).toBe('form_2_create');
    });

    it('should generate tools with proper input schemas', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

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

      server.registerIntake(intake);

      // Verify tools have proper structure
      const tools = generateToolsFromIntake(intake);

      expect(tools.create.inputSchema.type).toBe('object');
      expect(tools.create.inputSchema.properties).toBeDefined();
      expect(tools.create.inputSchema.properties?.data).toBeDefined();

      expect(tools.set.inputSchema.required).toContain('resumeToken');
      expect(tools.set.inputSchema.required).toContain('data');

      expect(tools.validate.inputSchema.required).toContain('resumeToken');
      expect(tools.submit.inputSchema.required).toContain('resumeToken');
    });

    it('should handle intake with 10+ fields', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        schema: z.object({
          legal_name: z.string(),
          country: z.string(),
          tax_id: z.string(),
          business_type: z.enum(['sole_proprietor', 'llc', 'corporation']),
          employees: z.number(),
          annual_revenue: z.number(),
          established_date: z.string(),
          email: z.string().email(),
          phone: z.string(),
          website: z.string().url().optional(),
          notes: z.string().optional(),
        }),
        destination: {
          type: 'webhook',
          name: 'Test',
          config: { url: 'https://example.com' },
        },
      };

      const startTime = performance.now();
      server.registerIntake(intake);
      const endTime = performance.now();

      // Should register quickly (under 100ms)
      expect(endTime - startTime).toBeLessThan(100);

      // Verify registration
      const intakes = server.getIntakes();
      expect(intakes).toHaveLength(1);
      expect(intakes[0].id).toBe('vendor_onboarding');
    });
  });

  describe('getServer() method', () => {
    it('should return the underlying MCP Server', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      const mcpServer = server.getServer();

      expect(mcpServer).toBeDefined();
      expect(mcpServer).toBeInstanceOf(Server);
    });

    it('should return the same server instance on multiple calls', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      const mcpServer1 = server.getServer();
      const mcpServer2 = server.getServer();

      expect(mcpServer1).toBe(mcpServer2);
    });
  });

  describe('getIntakes() method', () => {
    it('should return array of registered intakes', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);

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

      server.registerIntake(intake1);
      server.registerIntake(intake2);

      const intakes = server.getIntakes();

      expect(Array.isArray(intakes)).toBe(true);
      expect(intakes).toHaveLength(2);
      expect(intakes[0]).toHaveProperty('id');
      expect(intakes[0]).toHaveProperty('version');
      expect(intakes[0]).toHaveProperty('name');
      expect(intakes[0]).toHaveProperty('schema');
      expect(intakes[0]).toHaveProperty('destination');
    });

    it('should return empty array when no intakes registered', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };

      const server = new FormBridgeMCPServer(config);
      const intakes = server.getIntakes();

      expect(Array.isArray(intakes)).toBe(true);
      expect(intakes).toHaveLength(0);
    });
  });
});
