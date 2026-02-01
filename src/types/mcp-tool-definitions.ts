/**
 * FormBridge MCP Server Type Definitions
 *
 * This module defines the types for MCP (Model Context Protocol) integration,
 * including tool definitions, server configuration, and transport options.
 */

import type { z } from 'zod';
import type { SubmissionResponse } from './intake-contract.js';
import type { StorageBackend } from '../storage/storage-backend.js';

/**
 * MCP Tool definition for intake forms
 *
 * Each intake form is exposed as a set of MCP tools that agents can discover
 * and call to submit structured data.
 */
export interface MCPToolDefinition {
  /** Unique tool name (e.g., "vendor_onboarding_create") */
  name: string;
  /** Human-readable tool description for LLM understanding */
  description: string;
  /** JSON Schema defining the tool's input parameters */
  inputSchema: {
    /** JSON Schema version (defaults to 2020-12) */
    $schema?: string;
    /** Type must be "object" for MCP tools */
    type: 'object';
    /** Field definitions */
    properties?: Record<string, object>;
    /** Required field names */
    required?: string[];
    /** Additional schema metadata */
    [key: string]: unknown;
  };
  /** JSON Schema defining the tool's output structure (optional) */
  outputSchema?: {
    /** JSON Schema version */
    $schema?: string;
    /** Type must be "object" */
    type: 'object';
    /** Output field definitions */
    properties?: Record<string, object>;
    /** Required output field names */
    required?: string[];
    /** Additional schema metadata */
    [key: string]: unknown;
  };
}

/**
 * Tool handler function type
 *
 * Handles execution of MCP tool calls and returns structured responses
 * conforming to the Intake Contract.
 */
export type MCPToolHandler = (
  args: Record<string, unknown>
) => Promise<SubmissionResponse>;

/**
 * Tool registration entry
 *
 * Associates a tool definition with its handler function.
 */
export interface MCPToolRegistration {
  /** Tool definition exposed to MCP clients */
  definition: MCPToolDefinition;
  /** Handler function that executes the tool logic */
  handler: MCPToolHandler;
}

/**
 * Transport type enumeration
 *
 * FormBridge MCP servers support multiple transport mechanisms
 * for different integration scenarios.
 */
export enum TransportType {
  /** Standard I/O transport for local agent integration */
  STDIO = 'stdio',
  /** Server-Sent Events transport for remote HTTP integration */
  SSE = 'sse'
}

/**
 * Base transport configuration
 */
export interface BaseTransportConfig {
  /** Transport type identifier */
  type: TransportType;
}

/**
 * Standard I/O transport configuration
 *
 * Uses stdin/stdout for communication with local MCP clients.
 * Ideal for Claude Desktop, CLI tools, and local agent integration.
 */
export interface StdioTransportConfig extends BaseTransportConfig {
  type: TransportType.STDIO;
}

/**
 * Server-Sent Events (SSE) transport configuration
 *
 * Exposes MCP server over HTTP using SSE for remote agent integration.
 * Ideal for web applications, cloud deployments, and remote agents.
 */
export interface SSETransportConfig extends BaseTransportConfig {
  type: TransportType.SSE;
  /** HTTP port to listen on */
  port: number;
  /** Optional hostname (defaults to localhost) */
  host?: string;
  /** Optional CORS configuration */
  cors?: {
    /** Allowed origins (defaults to *) */
    origin?: string | string[];
    /** Allowed methods */
    methods?: string[];
    /** Allowed headers */
    headers?: string[];
    /** Allow credentials */
    credentials?: boolean;
  };
  /** Optional path prefix for SSE endpoint (defaults to /sse) */
  path?: string;
}

/**
 * Transport configuration union type
 */
export type TransportConfig = StdioTransportConfig | SSETransportConfig;

/**
 * MCP Server configuration
 *
 * Defines the server's identity, capabilities, and behavior.
 */
export interface MCPServerConfig {
  /** Server name (e.g., "formbridge-vendor-onboarding") */
  name: string;
  /** Server version (semantic versioning recommended) */
  version: string;
  /** Optional human-readable server description */
  description?: string;
  /** Optional instructions for using the server */
  instructions?: string;
  /** Transport configuration */
  transport: TransportConfig;
  /** Optional logging level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Optional storage backend for file uploads */
  storageBackend?: StorageBackend;
}

/**
 * MCP Server capabilities
 *
 * Advertises which MCP features this server supports.
 */
export interface MCPServerCapabilities {
  /** Tools capability (always true for FormBridge) */
  tools?: {
    /** Whether the server supports listing tools */
    listChanged?: boolean;
  };
  /** Logging capability */
  logging?: {
    /** Supported log levels */
    levels?: Array<'debug' | 'info' | 'warn' | 'error'>;
  };
}

/**
 * Tool call context
 *
 * Provides additional context about the tool call execution environment.
 */
export interface MCPToolCallContext {
  /** Unique request ID for tracking and debugging */
  requestId?: string;
  /** Client information (if available) */
  client?: {
    /** Client name */
    name?: string;
    /** Client version */
    version?: string;
  };
  /** Session ID for multi-turn interactions */
  sessionId?: string;
  /** Additional metadata from the MCP request */
  meta?: Record<string, unknown>;
}

/**
 * Tool operation types
 *
 * FormBridge exposes multiple tools per intake form for different operations.
 */
export enum ToolOperation {
  /** Create a new submission session */
  CREATE = 'create',
  /** Set/update field values in an existing submission */
  SET = 'set',
  /** Validate current submission state without submitting */
  VALIDATE = 'validate',
  /** Submit the intake form */
  SUBMIT = 'submit',
  /** Request a signed URL for file upload */
  REQUEST_UPLOAD = 'requestUpload',
  /** Confirm completion of a file upload */
  CONFIRM_UPLOAD = 'confirmUpload'
}

/**
 * Tool name components
 *
 * Structured breakdown of a FormBridge MCP tool name.
 */
export interface ToolNameComponents {
  /** Intake form ID */
  intakeId: string;
  /** Operation type */
  operation: ToolOperation;
  /** Full tool name (e.g., "vendor_onboarding_create") */
  fullName: string;
}

/**
 * Type guard to check if a transport config is stdio
 */
export function isStdioTransport(
  config: TransportConfig
): config is StdioTransportConfig {
  return config.type === TransportType.STDIO;
}

/**
 * Type guard to check if a transport config is SSE
 */
export function isSSETransport(
  config: TransportConfig
): config is SSETransportConfig {
  return config.type === TransportType.SSE;
}

/**
 * Utility type for extracting Zod schema type
 */
export type ZodSchemaType<T> = T extends z.ZodType<infer U> ? U : never;
