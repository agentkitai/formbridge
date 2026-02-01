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
} from './types/mcp-tool-definitions.js';
export { TransportType as TransportTypes } from './types/mcp-tool-definitions.js';

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

// =============================================================================
// App Factory
// =============================================================================

export { createFormBridgeApp, createFormBridgeAppWithIntakes } from './app.js';
export type { FormBridgeAppOptions } from './app.js';

// =============================================================================
// HTTP Route Utilities (Advanced Usage)
// =============================================================================

export { createIntakeRouter } from './routes/intake.js';
export { createHonoSubmissionRouter } from './routes/hono-submissions.js';
export { createHonoEventRouter } from './routes/hono-events.js';
export { createHonoApprovalRouter } from './routes/hono-approvals.js';
export { createUploadRouter } from './routes/uploads.js';

// =============================================================================
// Core Business Logic
// =============================================================================

export { SubmissionManager } from './core/submission-manager.js';
export { ApprovalManager } from './core/approval-manager.js';
export { InMemoryEventStore } from './core/event-store.js';
export type { EventStore, EventFilters } from './core/event-store.js';
export { assertValidTransition, InvalidStateTransitionError, VALID_TRANSITIONS } from './core/state-machine.js';

// =============================================================================
// Webhook & Delivery
// =============================================================================

export { WebhookManager, signPayload, verifySignature } from './core/webhook-manager.js';
export type { WebhookManagerOptions, DeliveryPayload, DryRunResult } from './core/webhook-manager.js';
export { InMemoryDeliveryQueue, DEFAULT_RETRY_POLICY, calculateRetryDelay } from './core/delivery-queue.js';
export type { DeliveryQueue, DeliveryQueueStats } from './core/delivery-queue.js';
export { createHonoWebhookRouter } from './routes/hono-webhooks.js';

// =============================================================================
// Pluggable Storage
// =============================================================================

export type { FormBridgeStorage, SubmissionStorage, SubmissionFilter, PaginatedResult, PaginationOptions } from './storage/storage-interface.js';
export { MemoryStorage, InMemorySubmissionStorage } from './storage/memory-storage.js';
export { SqliteStorage } from './storage/sqlite-storage.js';
export type { SqliteStorageOptions } from './storage/sqlite-storage.js';
export { migrateStorage } from './storage/migration.js';
export type { MigrationResult, MigrationOptions } from './storage/migration.js';

// =============================================================================
// Analytics
// =============================================================================

export { createHonoAnalyticsRouter } from './routes/hono-analytics.js';
export type { AnalyticsDataProvider } from './routes/hono-analytics.js';

// =============================================================================
// Auth, Authorization & Multi-Tenancy
// =============================================================================

export {
  InMemoryApiKeyStore,
  generateApiKey,
  hashApiKey,
  isFormBridgeApiKey,
} from './auth/api-key-auth.js';
export type {
  ApiKey,
  ApiKeyOperation,
  ApiKeyStore,
  CreateApiKeyRequest,
  CreateApiKeyResult,
} from './auth/api-key-auth.js';

export { OAuthProvider } from './auth/oauth-provider.js';
export type {
  OAuthConfig,
  JwtClaims,
  TokenValidationResult,
} from './auth/oauth-provider.js';

export { hasPermission, getPermissions, getRoles, isValidRole, isRoleAtLeast } from './auth/rbac.js';
export type { Role, Permission } from './auth/rbac.js';

export { InMemoryTenantStore, getPlanLimits } from './auth/tenant-manager.js';
export type {
  Tenant,
  TenantPlan,
  TenantStore,
  CreateTenantRequest,
} from './auth/tenant-manager.js';

export { RateLimiter } from './auth/rate-limiter.js';
export type { RateLimitConfig, RateLimitResult } from './auth/rate-limiter.js';

export { createAuthMiddleware, requirePermission, getAuthContext } from './auth/middleware.js';
export type { AuthConfig, AuthContext } from './auth/middleware.js';
