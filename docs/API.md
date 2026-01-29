# FormBridge MCP Server SDK - API Reference

Complete API reference for the FormBridge MCP Server SDK.

## Table of Contents

- [Core Classes](#core-classes)
  - [FormBridgeMCPServer](#formbridgemcpserver)
- [Type Definitions](#type-definitions)
  - [Intake Schema Types](#intake-schema-types)
  - [Intake Contract Types](#intake-contract-types)
  - [MCP Types](#mcp-types)
- [Functions](#functions)
  - [Tool Generation](#tool-generation)
  - [Validation](#validation)
  - [Error Mapping](#error-mapping)
  - [Schema Conversion](#schema-conversion)
- [Transport Helpers](#transport-helpers)
  - [Stdio Transport](#stdio-transport)
  - [SSE Transport](#sse-transport)
- [Type Guards](#type-guards)

---

## Core Classes

### FormBridgeMCPServer

The main server class for hosting MCP tools generated from intake form definitions.

#### Constructor

```typescript
new FormBridgeMCPServer(config: MCPServerConfig)
```

Creates a new FormBridge MCP server instance.

**Parameters:**
- `config: MCPServerConfig` - Server configuration object

**Example:**
```typescript
import { FormBridgeMCPServer } from '@formbridge/mcp-server-sdk';

const server = new FormBridgeMCPServer({
  name: 'my-intake-server',
  version: '1.0.0',
  instructions: 'Use these tools to submit intake forms',
  transport: { type: TransportType.STDIO }
});
```

#### Methods

##### `registerIntake(intake: IntakeDefinition): void`

Registers a single intake definition and generates its MCP tools.

**Parameters:**
- `intake: IntakeDefinition` - The intake definition to register

**Example:**
```typescript
const contactIntake: IntakeDefinition = {
  id: 'contact_form',
  version: '1.0.0',
  name: 'Contact Form',
  schema: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  destination: {
    type: 'webhook',
    name: 'Contact API',
    config: { url: 'https://api.example.com/contacts' }
  }
};

server.registerIntake(contactIntake);
```

##### `registerIntakes(intakes: IntakeDefinition[]): void`

Registers multiple intake definitions at once.

**Parameters:**
- `intakes: IntakeDefinition[]` - Array of intake definitions to register

**Example:**
```typescript
server.registerIntakes([contactIntake, vendorIntake, supportIntake]);
```

##### `start(): Promise<void>`

Starts the MCP server with the configured transport.

**Returns:** `Promise<void>` - Resolves when server is started

**Example:**
```typescript
await server.start();
console.error('Server started successfully');
```

##### `getServer(): Server`

Gets the underlying MCP SDK Server instance.

**Returns:** `Server` - The MCP SDK Server instance

**Example:**
```typescript
const mcpServer = server.getServer();
await mcpServer.connect(transport);
```

##### `getIntakes(): IntakeDefinition[]`

Gets all registered intake definitions.

**Returns:** `IntakeDefinition[]` - Array of all registered intakes

**Example:**
```typescript
const intakes = server.getIntakes();
console.log(`Registered ${intakes.length} intake forms`);
```

---

## Type Definitions

### Intake Schema Types

#### IntakeDefinition

Complete specification of an intake form.

```typescript
interface IntakeDefinition {
  id: string;                         // Unique identifier (e.g., 'vendor_onboarding')
  version: string;                    // Semantic version (e.g., '1.0.0')
  name: string;                       // Human-readable name
  description?: string;               // Description for AI agents
  schema: z.ZodType<any>;             // Zod schema defining fields and validation
  approvalGates?: ApprovalGate[];     // Conditional approval requirements
  destination: Destination;           // Where to send completed submissions
  metadata?: Record<string, unknown>; // Custom metadata
  errorMessages?: Record<string, string>; // Custom error messages
  fieldHints?: Record<string, {       // Field display hints
    label?: string;
    placeholder?: string;
    helpText?: string;
    order?: number;
    hidden?: boolean;
  }>;
}
```

**Example:**
```typescript
const vendorIntake: IntakeDefinition = {
  id: 'vendor_onboarding',
  version: '1.0.0',
  name: 'Vendor Onboarding',
  description: 'Onboard new vendors with banking and tax information',
  schema: z.object({
    legal_name: z.string().describe('Legal business name'),
    tax_id: z.string().describe('Tax identification number'),
    country: z.string().length(2).describe('Two-letter country code')
  }),
  approvalGates: [{
    id: 'high_revenue_approval',
    name: 'High Revenue Approval',
    condition: 'annual_revenue > 1000000',
    required: true
  }],
  destination: {
    type: 'webhook',
    name: 'Vendor Management System',
    config: {
      url: 'https://api.example.com/vendors',
      method: 'POST'
    }
  },
  fieldHints: {
    legal_name: {
      label: 'Legal Business Name',
      placeholder: 'Acme Corporation',
      helpText: 'Enter the exact legal name as it appears on tax documents'
    }
  }
};
```

#### ApprovalGate

Defines conditions requiring human approval.

```typescript
interface ApprovalGate {
  id: string;                  // Unique identifier
  name: string;                // Human-readable name
  description?: string;        // Description of when this gate triggers
  condition?: string;          // Condition expression (e.g., 'amount > 10000')
  triggerFields?: string[];    // Fields that trigger approval when modified
  required?: boolean;          // Whether gate is required (defaults to true)
}
```

**Example:**
```typescript
const approvalGate: ApprovalGate = {
  id: 'high_value_order',
  name: 'High Value Order Approval',
  description: 'Orders over $10,000 require manager approval',
  condition: 'total > 10000',
  required: true
};
```

#### Destination

Configuration for where submissions are delivered.

```typescript
interface Destination {
  type: string;                    // Destination type identifier
  name: string;                    // Human-readable destination name
  config: Record<string, unknown>; // Destination-specific configuration
  webhookUrl?: string;             // Optional webhook for notifications
  auth?: {                         // Optional authentication
    type: string;                  // Auth type (e.g., 'bearer', 'basic')
    credentials: Record<string, string>;
  };
  retry?: {                        // Optional retry configuration
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  };
}
```

**Example:**
```typescript
const destination: Destination = {
  type: 'webhook',
  name: 'CRM System',
  config: {
    url: 'https://api.crm.com/contacts',
    method: 'POST'
  },
  auth: {
    type: 'bearer',
    credentials: {
      token: process.env.CRM_API_TOKEN
    }
  },
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2
  }
};
```

### Intake Contract Types

#### SubmissionState

Enumeration of submission lifecycle states.

```typescript
enum SubmissionState {
  CREATED = 'created',               // Initial state
  VALIDATING = 'validating',         // Being validated
  INVALID = 'invalid',               // Validation failed
  VALID = 'valid',                   // Validation passed
  PENDING_APPROVAL = 'pending_approval', // Awaiting approval
  UPLOADING = 'uploading',           // File upload in progress
  SUBMITTING = 'submitting',         // Being processed
  COMPLETED = 'completed',           // Successfully completed
  FAILED = 'failed',                 // Processing failed
  CANCELLED = 'cancelled',           // Submission cancelled
  EXPIRED = 'expired'                // Submission expired
}
```

#### IntakeErrorType

Error type taxonomy for semantic categorization.

```typescript
type IntakeErrorType =
  | 'missing'           // Required field is missing
  | 'invalid'           // Field value is invalid
  | 'conflict'          // Field conflicts with another field
  | 'needs_approval'    // Submission requires human approval
  | 'upload_pending'    // File upload not yet complete
  | 'delivery_failed'   // Failed to deliver submission
  | 'expired'           // Submission or session expired
  | 'cancelled';        // Submission was cancelled
```

#### FieldError

Field-level validation error information.

```typescript
interface FieldError {
  field: string;        // Field name with error
  message: string;      // Human-readable error message
  type: IntakeErrorType; // Error type for programmatic handling
  constraint?: string;  // Violated constraint (e.g., 'min:5', 'email')
  value?: unknown;      // Current value that caused error
}
```

**Example:**
```typescript
const fieldError: FieldError = {
  field: 'email',
  message: 'Invalid email format',
  type: 'invalid',
  constraint: 'email',
  value: 'not-an-email'
};
```

#### NextAction

Suggested action for resolving errors.

```typescript
interface NextAction {
  type: string;                    // Action type identifier
  description: string;             // Human-readable description
  fields?: string[];               // Fields that need attention
  params?: Record<string, unknown>; // Optional action parameters
}
```

**Example:**
```typescript
const nextAction: NextAction = {
  type: 'fix_field',
  description: 'Provide a valid email address',
  fields: ['email']
};
```

#### Actor

Information about who performed an action.

```typescript
interface Actor {
  type: 'agent' | 'human'; // Actor type
  id: string;              // Unique identifier
  name?: string;           // Optional display name
  email?: string;          // Optional email address
}
```

#### IntakeError

Structured error response following Intake Contract.

```typescript
interface IntakeError {
  type: IntakeErrorType;           // Error type
  message: string;                 // High-level error message
  fields: FieldError[];            // Array of field-level errors
  nextActions: NextAction[];       // Suggested resolution actions
  resumeToken?: string;            // Token to continue submission
  idempotencyKey?: string;         // Idempotency key for retries
  timestamp?: string;              // When error occurred
}
```

**Example:**
```typescript
const error: IntakeError = {
  type: 'invalid',
  message: 'Validation failed',
  fields: [{
    field: 'email',
    message: 'Invalid email format',
    type: 'invalid',
    constraint: 'email'
  }],
  nextActions: [{
    type: 'fix_field',
    description: 'Provide a valid email address',
    fields: ['email']
  }],
  resumeToken: 'tok_abc123',
  timestamp: '2024-01-29T12:00:00Z'
};
```

#### SubmissionSuccess

Successful submission response.

```typescript
interface SubmissionSuccess {
  state: SubmissionState;          // Submission state
  submissionId: string;            // Unique submission ID
  message: string;                 // Success message
  data?: Record<string, unknown>;  // Optional data from destination
  actor?: Actor;                   // Who submitted
  timestamp?: string;              // When submitted
}
```

**Example:**
```typescript
const success: SubmissionSuccess = {
  state: SubmissionState.COMPLETED,
  submissionId: 'sub_abc123',
  message: 'Submission completed successfully',
  data: { crm_id: '12345' },
  timestamp: '2024-01-29T12:00:00Z'
};
```

#### SubmissionResponse

Union type for tool call responses.

```typescript
type SubmissionResponse = SubmissionSuccess | IntakeError;
```

### MCP Types

#### MCPServerConfig

Server configuration object.

```typescript
interface MCPServerConfig {
  name: string;              // Server name
  version: string;           // Server version (semantic versioning)
  description?: string;      // Optional server description
  instructions?: string;     // Optional instructions for AI agents
  transport: TransportConfig; // Transport configuration
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Optional log level
}
```

**Example:**
```typescript
const config: MCPServerConfig = {
  name: 'my-intake-server',
  version: '1.0.0',
  description: 'Intake forms for customer onboarding',
  instructions: 'Use these tools to collect and submit customer data',
  transport: { type: TransportType.STDIO },
  logLevel: 'info'
};
```

#### TransportType

Transport mechanism enumeration.

```typescript
enum TransportType {
  STDIO = 'stdio',  // Standard I/O transport
  SSE = 'sse'       // Server-Sent Events transport
}
```

#### TransportConfig

Transport configuration union type.

```typescript
type TransportConfig = StdioTransportConfig | SSETransportConfig;
```

#### StdioTransportConfig

Configuration for stdio transport.

```typescript
interface StdioTransportConfig {
  type: TransportType.STDIO;
}
```

**Example:**
```typescript
const stdioConfig: StdioTransportConfig = {
  type: TransportType.STDIO
};
```

#### SSETransportConfig

Configuration for SSE transport.

```typescript
interface SSETransportConfig {
  type: TransportType.SSE;
  port: number;              // HTTP port to listen on
  host?: string;             // Optional hostname (defaults to localhost)
  cors?: {                   // Optional CORS configuration
    origin?: string | string[];
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
  };
  path?: string;             // Optional path prefix (defaults to /sse)
}
```

**Example:**
```typescript
const sseConfig: SSETransportConfig = {
  type: TransportType.SSE,
  port: 3000,
  host: '0.0.0.0',
  cors: {
    origin: ['https://app.example.com'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/mcp-sse'
};
```

#### MCPToolDefinition

MCP tool definition structure.

```typescript
interface MCPToolDefinition {
  name: string;         // Unique tool name
  description: string;  // Tool description for LLM understanding
  inputSchema: {        // JSON Schema for tool inputs
    $schema?: string;
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
    [key: string]: unknown;
  };
  outputSchema?: {      // Optional JSON Schema for outputs
    $schema?: string;
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
    [key: string]: unknown;
  };
}
```

#### ToolOperation

Tool operation types.

```typescript
enum ToolOperation {
  CREATE = 'create',       // Create new submission
  SET = 'set',             // Update field values
  VALIDATE = 'validate',   // Validate without submitting
  SUBMIT = 'submit'        // Submit the form
}
```

---

## Functions

### Tool Generation

#### generateToolsFromIntake

Generates MCP tool definitions from an IntakeDefinition.

```typescript
function generateToolsFromIntake(
  intake: IntakeDefinition,
  options?: ToolGenerationOptions
): GeneratedTools
```

**Parameters:**
- `intake: IntakeDefinition` - The intake definition
- `options?: ToolGenerationOptions` - Optional generation options
  - `includeOptionalFields?: boolean` - Include optional fields in descriptions (default: true)
  - `includeConstraints?: boolean` - Include constraints in descriptions (default: true)
  - `maxFieldsInDescription?: number` - Max fields to list in description (default: 10)

**Returns:** `GeneratedTools` - Object containing all four tool definitions

**Example:**
```typescript
import { generateToolsFromIntake } from '@formbridge/mcp-server-sdk';

const tools = generateToolsFromIntake(vendorIntake, {
  includeOptionalFields: true,
  includeConstraints: true,
  maxFieldsInDescription: 15
});

console.log(tools.create.name);    // "vendor_onboarding__create"
console.log(tools.set.name);       // "vendor_onboarding__set"
console.log(tools.validate.name);  // "vendor_onboarding__validate"
console.log(tools.submit.name);    // "vendor_onboarding__submit"
```

#### parseToolName

Parses a tool name to extract intake ID and operation.

```typescript
function parseToolName(toolName: string): {
  intakeId: string;
  operation: ToolOperation;
} | null
```

**Parameters:**
- `toolName: string` - The tool name to parse (e.g., "vendor_onboarding__create")

**Returns:** Object with `intakeId` and `operation`, or `null` if invalid

**Example:**
```typescript
import { parseToolName } from '@formbridge/mcp-server-sdk';

const parsed = parseToolName('vendor_onboarding__create');
if (parsed) {
  console.log(parsed.intakeId);    // "vendor_onboarding"
  console.log(parsed.operation);   // ToolOperation.CREATE
}
```

### Validation

#### validateSubmission

Validates complete submission data against a Zod schema.

```typescript
function validateSubmission(
  schema: z.ZodType<any>,
  data: unknown
): { success: true; data: any } | { success: false; error: z.ZodError }
```

**Parameters:**
- `schema: z.ZodType<any>` - The Zod schema to validate against
- `data: unknown` - The data to validate

**Returns:** Validation result with success flag

**Example:**
```typescript
import { validateSubmission } from '@formbridge/mcp-server-sdk';

const result = validateSubmission(contactSchema, {
  name: 'John Doe',
  email: 'john@example.com'
});

if (result.success) {
  console.log('Valid:', result.data);
} else {
  console.log('Errors:', result.error.errors);
}
```

#### validatePartialSubmission

Validates partial submission data (for progressive disclosure).

```typescript
function validatePartialSubmission(
  schema: z.ZodType<any>,
  data: unknown
): { success: true; data: any } | { success: false; error: z.ZodError }
```

**Parameters:**
- `schema: z.ZodType<any>` - The Zod schema to validate against
- `data: unknown` - The partial data to validate

**Returns:** Validation result with success flag

**Example:**
```typescript
import { validatePartialSubmission } from '@formbridge/mcp-server-sdk';

// Validate partial data (some fields missing)
const result = validatePartialSubmission(contactSchema, {
  name: 'John Doe'
  // email is missing but that's okay for partial validation
});

if (result.success) {
  console.log('Partial data is valid so far');
}
```

### Error Mapping

#### mapToIntakeError

Maps Zod validation errors to Intake Contract error format.

```typescript
function mapToIntakeError(
  zodError: z.ZodError,
  options?: {
    resumeToken?: string;
    idempotencyKey?: string;
    includeTimestamp?: boolean;
  }
): IntakeError
```

**Parameters:**
- `zodError: z.ZodError` - The Zod validation error
- `options?` - Optional configuration
  - `resumeToken?: string` - Resume token to include in error
  - `idempotencyKey?: string` - Idempotency key to include
  - `includeTimestamp?: boolean` - Whether to include timestamp

**Returns:** `IntakeError` - Structured error following Intake Contract

**Example:**
```typescript
import { mapToIntakeError } from '@formbridge/mcp-server-sdk';

const validationResult = validateSubmission(schema, data);
if (!validationResult.success) {
  const intakeError = mapToIntakeError(validationResult.error, {
    resumeToken: 'tok_abc123',
    includeTimestamp: true
  });

  console.log(intakeError.type);        // 'invalid'
  console.log(intakeError.fields);      // Array of field errors
  console.log(intakeError.nextActions); // Suggested actions
}
```

### Schema Conversion

#### convertZodToJsonSchema

Converts a Zod schema to JSON Schema (Draft 2020-12).

```typescript
function convertZodToJsonSchema(
  zodSchema: z.ZodType<any>,
  options?: {
    name?: string;
    description?: string;
    includeSchemaProperty?: boolean;
  }
): JsonSchema
```

**Parameters:**
- `zodSchema: z.ZodType<any>` - The Zod schema to convert
- `options?` - Optional configuration
  - `name?: string` - Schema name for $id and title
  - `description?: string` - Schema description
  - `includeSchemaProperty?: boolean` - Include $schema property (default: true)

**Returns:** `JsonSchema` - JSON Schema object

**Example:**
```typescript
import { convertZodToJsonSchema } from '@formbridge/mcp-server-sdk';
import { z } from 'zod';

const zodSchema = z.object({
  name: z.string().describe('Full name'),
  age: z.number().min(18).describe('Age (must be 18+)')
});

const jsonSchema = convertZodToJsonSchema(zodSchema, {
  name: 'Person',
  description: 'A person schema'
});

console.log(jsonSchema);
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: {
//     name: { type: 'string', description: 'Full name' },
//     age: { type: 'number', minimum: 18, description: 'Age (must be 18+)' }
//   },
//   required: ['name', 'age']
// }
```

---

## Transport Helpers

### Stdio Transport

Helper functions for stdio transport setup.

#### createStdioTransport

Creates a stdio transport instance.

```typescript
function createStdioTransport(options?: {
  stdin?: Readable;
  stdout?: Writable;
}): StdioServerTransport
```

**Parameters:**
- `options?` - Optional custom streams
  - `stdin?: Readable` - Custom input stream (defaults to process.stdin)
  - `stdout?: Writable` - Custom output stream (defaults to process.stdout)

**Returns:** `StdioServerTransport` - Configured transport

**Example:**
```typescript
import { createStdioTransport } from '@formbridge/mcp-server-sdk';

const transport = createStdioTransport();
await server.getServer().connect(transport);
```

#### createConfiguredStdioTransport

Creates a stdio transport with event handlers.

```typescript
function createConfiguredStdioTransport(options?: {
  stdin?: Readable;
  stdout?: Writable;
  onError?: (error: Error) => void;
  onClose?: () => void;
}): StdioServerTransport
```

**Parameters:**
- `options?` - Configuration options
  - `stdin?: Readable` - Custom input stream
  - `stdout?: Writable` - Custom output stream
  - `onError?: (error: Error) => void` - Error handler
  - `onClose?: () => void` - Close handler

**Returns:** `StdioServerTransport` - Configured transport with handlers

**Example:**
```typescript
import { createConfiguredStdioTransport } from '@formbridge/mcp-server-sdk';

const transport = createConfiguredStdioTransport({
  onError: (error) => console.error('Transport error:', error),
  onClose: () => console.log('Transport closed')
});

await server.getServer().connect(transport);
```

### SSE Transport

Helper functions for SSE transport setup.

#### createSSETransport

Creates an SSE transport instance.

```typescript
function createSSETransport(
  endpoint: string,
  res: ServerResponse,
  options?: SSETransportOptions
): SSEServerTransport
```

**Parameters:**
- `endpoint: string` - URL where clients POST messages
- `res: ServerResponse` - HTTP response for SSE connection
- `options?: SSETransportOptions` - Optional configuration
  - `allowedHosts?: string[]` - Allowed host header values
  - `allowedOrigins?: string[]` - Allowed origin header values
  - `enableDnsRebindingProtection?: boolean` - Enable DNS rebinding protection
  - `onError?: (error: Error) => void` - Error handler
  - `onClose?: () => void` - Close handler
  - `onMessage?: (message: any) => void` - Message handler

**Returns:** `SSEServerTransport` - Configured transport

**Example:**
```typescript
import { createSSETransport } from '@formbridge/mcp-server-sdk';
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/sse') {
    const transport = createSSETransport('/message', res, {
      allowedHosts: ['localhost'],
      onError: (error) => console.error('SSE error:', error)
    });
    await transport.start();
    await mcpServer.connect(transport);
  }
});
```

#### handleSSEConnection

Helper to handle SSE GET requests.

```typescript
function handleSSEConnection(
  endpoint: string,
  res: ServerResponse,
  options?: SSETransportOptions
): Promise<SSEServerTransport>
```

**Parameters:**
- `endpoint: string` - URL where clients POST messages
- `res: ServerResponse` - HTTP response for SSE connection
- `options?: SSETransportOptions` - Optional configuration

**Returns:** `Promise<SSEServerTransport>` - Started transport

**Example:**
```typescript
import { handleSSEConnection } from '@formbridge/mcp-server-sdk';

const server = createServer(async (req, res) => {
  if (req.url === '/sse' && req.method === 'GET') {
    const transport = await handleSSEConnection('/message', res);
    await mcpServer.connect(transport);
  }
});
```

#### handleSSEMessage

Helper to handle SSE POST requests.

```typescript
function handleSSEMessage(
  transport: SSEServerTransport,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown
): Promise<void>
```

**Parameters:**
- `transport: SSEServerTransport` - The transport handling this session
- `req: IncomingMessage` - Incoming HTTP request
- `res: ServerResponse` - HTTP response object
- `parsedBody?: unknown` - Optional pre-parsed request body

**Returns:** `Promise<void>`

**Example:**
```typescript
import { handleSSEMessage } from '@formbridge/mcp-server-sdk';

// Store transports by session ID
const transports = new Map<string, SSEServerTransport>();

const server = createServer(async (req, res) => {
  if (req.url === '/message' && req.method === 'POST') {
    const sessionId = req.headers['x-session-id'] as string;
    const transport = transports.get(sessionId);
    if (transport) {
      await handleSSEMessage(transport, req, res);
    }
  }
});
```

---

## Type Guards

### isIntakeDefinition

Checks if an object is a valid IntakeDefinition.

```typescript
function isIntakeDefinition(obj: unknown): obj is IntakeDefinition
```

**Example:**
```typescript
import { isIntakeDefinition } from '@formbridge/mcp-server-sdk';

if (isIntakeDefinition(maybeIntake)) {
  server.registerIntake(maybeIntake);
}
```

### isIntakeError

Checks if a response is an IntakeError.

```typescript
function isIntakeError(response: SubmissionResponse): response is IntakeError
```

**Example:**
```typescript
import { isIntakeError } from '@formbridge/mcp-server-sdk';

if (isIntakeError(response)) {
  console.error('Submission failed:', response.message);
  for (const field of response.fields) {
    console.error(`  ${field.field}: ${field.message}`);
  }
}
```

### isSubmissionSuccess

Checks if a response is a SubmissionSuccess.

```typescript
function isSubmissionSuccess(
  response: SubmissionResponse
): response is SubmissionSuccess
```

**Example:**
```typescript
import { isSubmissionSuccess } from '@formbridge/mcp-server-sdk';

if (isSubmissionSuccess(response)) {
  console.log('Submission successful!');
  console.log('Submission ID:', response.submissionId);
  console.log('State:', response.state);
}
```

### isStdioTransport

Checks if a transport config is stdio.

```typescript
function isStdioTransport(
  config: TransportConfig
): config is StdioTransportConfig
```

**Example:**
```typescript
import { isStdioTransport } from '@formbridge/mcp-server-sdk';

if (isStdioTransport(config.transport)) {
  console.log('Using stdio transport');
}
```

### isSSETransport

Checks if a transport config is SSE.

```typescript
function isSSETransport(
  config: TransportConfig
): config is SSETransportConfig
```

**Example:**
```typescript
import { isSSETransport } from '@formbridge/mcp-server-sdk';

if (isSSETransport(config.transport)) {
  console.log('Using SSE transport on port', config.transport.port);
}
```

### isStdioServerTransport

Checks if a transport is a StdioServerTransport instance.

```typescript
function isStdioServerTransport(
  transport: unknown
): transport is StdioServerTransport
```

**Example:**
```typescript
import { isStdioServerTransport } from '@formbridge/mcp-server-sdk';

if (isStdioServerTransport(transport)) {
  console.log('Transport is stdio');
}
```

### isSSEServerTransport

Checks if a transport is an SSEServerTransport instance.

```typescript
function isSSEServerTransport(
  transport: unknown
): transport is SSEServerTransport
```

**Example:**
```typescript
import { isSSEServerTransport } from '@formbridge/mcp-server-sdk';

if (isSSEServerTransport(transport)) {
  console.log('Session ID:', transport.sessionId);
}
```

---

## Complete Example

Here's a complete example demonstrating the full API:

```typescript
import { z } from 'zod';
import {
  FormBridgeMCPServer,
  IntakeDefinition,
  TransportType,
  createStdioTransport,
  isIntakeError,
  isSubmissionSuccess
} from '@formbridge/mcp-server-sdk';

// Define intake schema
const contactSchema = z.object({
  name: z.string().describe('Full name'),
  email: z.string().email().describe('Email address'),
  company: z.string().optional().describe('Company name'),
  message: z.string().describe('Your message')
});

// Create intake definition
const contactIntake: IntakeDefinition = {
  id: 'contact_form',
  version: '1.0.0',
  name: 'Contact Form',
  description: 'Submit contact inquiries',
  schema: contactSchema,
  destination: {
    type: 'webhook',
    name: 'Contact API',
    config: {
      url: 'https://api.example.com/contacts',
      method: 'POST'
    }
  },
  fieldHints: {
    name: {
      label: 'Full Name',
      placeholder: 'John Doe',
      helpText: 'Enter your full name'
    },
    email: {
      label: 'Email Address',
      placeholder: 'john@example.com',
      helpText: 'We\'ll never share your email'
    }
  }
};

// Create server
const server = new FormBridgeMCPServer({
  name: 'contact-form-server',
  version: '1.0.0',
  description: 'Contact form intake server',
  instructions: 'Use these tools to submit contact inquiries',
  transport: { type: TransportType.STDIO }
});

// Register intake
server.registerIntake(contactIntake);

// Start server
await server.start();

console.error('Contact form MCP server running on stdio');
console.error(`Registered ${server.getIntakes().length} intake forms`);
```

---

## See Also

- [Main README](../README.md) - Quick start and overview
- [Vendor Onboarding Example](../examples/vendor-onboarding/README.md) - Complete working example
- [MCP Specification](https://spec.modelcontextprotocol.io/) - Model Context Protocol docs
- [Zod Documentation](https://zod.dev/) - Zod schema library docs
