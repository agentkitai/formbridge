/**
 * FormBridge MCP Server SDK
 * Auto-generate MCP tool servers from IntakeSchema definitions
 */

// =============================================================================
// Main Server Class
// =============================================================================

export { FormBridgeMCPServer } from './mcp/server.js';

// =============================================================================
// Core Types
// =============================================================================

// Intake Schema
export type { IntakeDefinition } from './schemas/intake-schema.js';
export { validateIntakeDefinition, isIntakeDefinition } from './schemas/intake-schema.js';

// Intake Contract Types
export type {
  IntakeError,
  FieldError,
  SubmissionSuccess,
  NextAction,
  Actor,
  SubmissionState
} from './types/intake-contract.js';

// MCP Types
export type {
  MCPServerConfig,
  MCPToolDefinition,
  TransportConfig,
  TransportType,
  StdioTransportConfig,
  SSETransportConfig
} from './types/mcp-types.js';
export { TransportType as TransportTypes } from './types/mcp-types.js';

// =============================================================================
// Transport Utilities
// =============================================================================

// Stdio Transport
export {
  createStdioTransport,
  createConfiguredStdioTransport,
  isStdioServerTransport
} from './mcp/transports/stdio.js';
export type { StdioTransportOptions } from './mcp/transports/stdio.js';

// SSE Transport
export {
  createSSETransport,
  createConfiguredSSETransport,
  handleSSEConnection,
  handleSSEMessage,
  isSSEServerTransport
} from './mcp/transports/sse.js';
export type { SSETransportOptions } from './mcp/transports/sse.js';

// Re-export transport classes from MCP SDK
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
export { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// =============================================================================
// Schema Utilities
// =============================================================================

export { convertZodToJsonSchema, extractFieldDescriptions } from './schemas/json-schema-converter.js';
export type { JsonSchema, ConversionOptions } from './schemas/json-schema-converter.js';

// =============================================================================
// Validation Utilities
// =============================================================================

export {
  validateSubmission,
  validatePartialSubmission,
  isValidationSuccess,
  isValidationFailure
} from './validation/validator.js';
export type {
  ValidationResult,
  ValidationSuccess,
  ValidationFailure
} from './validation/validator.js';

export {
  mapToIntakeError,
  mapMultipleToIntakeError
} from './validation/error-mapper.js';
export type { ErrorMapperOptions } from './validation/error-mapper.js';

// =============================================================================
// Tool Generation (Advanced Usage)
// =============================================================================

export {
  generateToolsFromIntake,
  generateToolName,
  parseToolName
} from './mcp/tool-generator.js';
export type {
  ToolGenerationOptions,
  ToolOperation
} from './mcp/tool-generator.js';
