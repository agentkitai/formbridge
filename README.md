# FormBridge MCP Server SDK

Auto-generate fully functional [Model Context Protocol (MCP)](https://spec.modelcontextprotocol.io/) tool servers from IntakeSchema definitions. Enable AI agents to discover and submit structured data to your intake workflows without building custom wrappers.

[![npm version](https://img.shields.io/npm/v/@formbridge/mcp-server-sdk.svg)](https://www.npmjs.com/package/@formbridge/mcp-server-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why FormBridge MCP Server SDK?

**The Problem:** Existing form and intake tools lack agent-native submission semantics. Typeform has no programmatic API. Retool has no agent interface. Form.io and Jotform don't support agent protocols. OpenAPI-to-MCP wrappers achieve only 76.5% success rates.

**The Solution:** FormBridge generates purpose-built, native MCP tool servers from your Zod schemas. Not a wrapper — the real thing.

### Key Features

- **🎯 Agent-Native**: Each intake form becomes a discoverable MCP tool with full type information
- **✨ Zero Boilerplate**: Generate complete MCP servers from Zod schemas in under 100ms
- **🔒 Type-Safe**: Full TypeScript support with automatic JSON Schema generation
- **🚦 Intake Contract**: Structured validation errors with semantic error taxonomy
- **🔌 Transport Flexible**: Built-in stdio and SSE transports for local and remote agents
- **📋 Multi-Step Forms**: Create, set, validate, and submit operations for progressive disclosure
- **✅ Validation Rules**: Automatic validation from Zod constraints with helpful error messages
- **🎛️ Approval Gates**: Conditional approval requirements based on submission data

## Installation

```bash
npm install @formbridge/mcp-server-sdk zod
```

**Requirements:**
- Node.js >= 18.0.0
- TypeScript >= 5.3.0 (for development)

## Quick Start

### 1. Define Your Intake Schema

```typescript
import { z } from 'zod';
import { FormBridgeMCPServer, IntakeDefinition } from '@formbridge/mcp-server-sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Define your intake form schema using Zod
const contactSchema = z.object({
  name: z.string().describe('Full name'),
  email: z.string().email().describe('Email address'),
  company: z.string().optional().describe('Company name'),
  message: z.string().describe('Your message')
});

// Create an IntakeDefinition
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
  }
};
```

### 2. Create and Start the MCP Server

```typescript
// Create the MCP server
const server = new FormBridgeMCPServer({
  name: 'contact-form-server',
  version: '1.0.0'
});

// Register your intake form
server.registerIntake(contactIntake);

// Connect transport and start server
const transport = new StdioServerTransport();
await server.getServer().connect(transport);

console.error('Contact form MCP server running on stdio');
```

### 3. Connect an MCP Client

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "contact-form": {
      "command": "node",
      "args": ["/path/to/your/server.js"]
    }
  }
}
```

Restart Claude Desktop and the contact form tools will be available!

## Core Concepts

### IntakeDefinition

An `IntakeDefinition` describes a structured intake form with validation rules, approval gates, and destination configuration:

```typescript
interface IntakeDefinition {
  id: string;                    // Unique identifier (e.g., 'vendor_onboarding')
  version: string;               // Semantic version (e.g., '1.0.0')
  name: string;                  // Human-readable name
  description: string;           // Description for AI agents
  schema: z.ZodObject<any>;      // Zod schema defining fields and validation
  approvalGates?: ApprovalGate[]; // Conditional approval requirements
  destination: Destination;       // Where to send completed submissions
  fieldHints?: FieldHints;        // UI hints for better agent interaction
  metadata?: Record<string, any>; // Custom metadata
}
```

### Generated MCP Tools

Each registered intake generates **four MCP tools**:

1. **`{intake_id}__create`** - Create a new submission with initial data
2. **`{intake_id}__set`** - Update fields in an existing submission
3. **`{intake_id}__validate`** - Validate data without persisting
4. **`{intake_id}__submit`** - Submit for processing and delivery

### Intake Contract Responses

All tool calls return structured responses following the Intake Contract:

**Success Response:**
```typescript
{
  success: true,
  submission_id: "sub_abc123",
  status: "submitted",
  resume_token: "tok_xyz789",
  data: { /* submitted data */ }
}
```

**Error Response:**
```typescript
{
  success: false,
  errors: [
    {
      code: "INVALID_INPUT",
      message: "Invalid email format",
      field: "email",
      type: "invalid",
      details: {
        provided: "not-an-email",
        expected: "valid email address"
      },
      next_action: {
        action: "fix_field",
        field: "email"
      }
    }
  ]
}
```

**Error Types:**
- `missing` - Required field not provided
- `invalid` - Field value doesn't meet validation rules
- `conflict` - Field conflicts with other data
- `needs_approval` - Approval gate triggered

## API Reference

### FormBridgeMCPServer

Main server class for hosting MCP tools.

#### Constructor

```typescript
new FormBridgeMCPServer(config: MCPServerConfig)
```

**MCPServerConfig:**
```typescript
interface MCPServerConfig {
  name: string;              // Server name
  version: string;           // Server version
  instructions?: string;     // Instructions for AI agents
}
```

#### Methods

**`registerIntake(intake: IntakeDefinition): void`**

Register an intake form. Generates four MCP tools for the intake.

```typescript
server.registerIntake(vendorIntake);
```

**`getServer(): Server`**

Get the underlying MCP SDK Server instance for transport connection.

```typescript
const mcpServer = server.getServer();
await mcpServer.connect(transport);
```

**`getIntakes(): IntakeDefinition[]`**

Get all registered intake definitions.

```typescript
const intakes = server.getIntakes();
console.log(`Registered ${intakes.length} intakes`);
```

### Transports

#### Stdio Transport

For local agent integration (Claude Desktop, MCP Inspector):

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
await server.getServer().connect(transport);
```

#### SSE Transport

For remote agent integration over HTTP:

```typescript
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const transport = new SSEServerTransport('/message', response);
await server.getServer().connect(transport);
```

## Examples

### Vendor Onboarding with Complex Validation

```typescript
import { z } from 'zod';

const vendorSchema = z.object({
  legal_name: z.string().describe('Legal business name'),
  country: z.string().length(2).describe('Two-letter country code'),
  tax_id: z.string().describe('Tax identification number'),
  bank_account: z.object({
    account_number: z.string(),
    routing_number: z.string(),
    account_holder_name: z.string()
  }).describe('Bank account information'),
  business_type: z.enum(['sole_proprietor', 'llc', 'corporation', 'partnership'])
    .describe('Type of business entity'),
  employees: z.number().min(1).describe('Number of employees'),
  annual_revenue: z.number().min(0).describe('Annual revenue in USD'),
  established_date: z.string().describe('Date established (ISO 8601)')
});

const vendorIntake: IntakeDefinition = {
  id: 'vendor_onboarding',
  version: '1.0.0',
  name: 'Vendor Onboarding',
  description: 'Onboard new vendors with banking, tax, and business information',
  schema: vendorSchema,
  approvalGates: [
    {
      id: 'high_revenue_approval',
      name: 'High Revenue Approval',
      description: 'Requires approval for vendors with annual revenue over $1M',
      condition: 'annual_revenue > 1000000',
      required: true
    }
  ],
  destination: {
    type: 'webhook',
    name: 'Vendor Management System',
    config: {
      url: 'https://api.example.com/vendors',
      method: 'POST'
    },
    webhookUrl: 'https://api.example.com/webhooks/vendor-created',
    retry: {
      maxAttempts: 3,
      delayMs: 1000,
      backoffMultiplier: 2
    }
  }
};

server.registerIntake(vendorIntake);
```

See [examples/vendor-onboarding](./examples/vendor-onboarding/README.md) for the complete working example.

### Multi-Step Form with Progressive Disclosure

```typescript
// Step 1: Create submission with basic info
const createResult = await callTool('contact__create', {
  name: 'John Doe',
  email: 'john@example.com'
});

// Step 2: Add more details
const setResult = await callTool('contact__set', {
  submission_id: createResult.submission_id,
  company: 'Acme Corp',
  message: 'I would like to learn more about your product'
});

// Step 3: Validate before submitting
const validateResult = await callTool('contact__validate', {
  submission_id: createResult.submission_id
});

// Step 4: Submit if validation passes
if (validateResult.success) {
  const submitResult = await callTool('contact__submit', {
    submission_id: createResult.submission_id
  });
}
```

### Nested Objects and Arrays

```typescript
const orderSchema = z.object({
  customer: z.object({
    name: z.string(),
    email: z.string().email(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      postal_code: z.string()
    })
  }),
  items: z.array(z.object({
    product_id: z.string(),
    quantity: z.number().min(1),
    price: z.number().min(0)
  })),
  total: z.number().min(0),
  notes: z.string().optional()
});
```

## Integration with MCP Clients

### Claude Desktop

1. Create your MCP server script
2. Add to `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "your-server": {
         "command": "node",
         "args": ["/absolute/path/to/server.js"]
       }
     }
   }
   ```
3. Restart Claude Desktop

### MCP Inspector

Test your server interactively:

```bash
npx @modelcontextprotocol/inspector node /path/to/server.js
```

The inspector provides a web UI to:
- List all available tools
- Inspect tool schemas
- Call tools with test data
- View validation responses

### Custom MCP Clients

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/server.js']
});

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: 'contact__create',
  arguments: {
    name: 'Jane Smith',
    email: 'jane@example.com'
  }
});
```

## Field Hints

Enhance agent interaction with UI hints:

```typescript
const intake: IntakeDefinition = {
  // ... other properties
  fieldHints: {
    legal_name: {
      label: 'Legal Business Name',
      placeholder: 'Acme Corporation',
      helpText: 'Enter the exact legal name as it appears on tax documents',
      order: 1
    },
    country: {
      label: 'Country',
      placeholder: 'US',
      helpText: 'Two-letter ISO country code',
      order: 2
    }
  }
};
```

## Approval Gates

Define conditional approval requirements:

```typescript
approvalGates: [
  {
    id: 'high_value_order',
    name: 'High Value Order Approval',
    description: 'Orders over $10,000 require manager approval',
    condition: 'total > 10000',
    required: true
  },
  {
    id: 'international_shipping',
    name: 'International Shipping Review',
    description: 'International orders require compliance review',
    condition: 'country != "US"',
    required: true
  }
]
```

When an approval gate triggers, the submission returns a `needs_approval` error.

## Development

### Build

```bash
npm run build
```

### Test

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Type checking
npm run typecheck
```

### Project Structure

```
src/
├── mcp/
│   ├── server.ts              # FormBridgeMCPServer implementation
│   ├── tool-generator.ts      # Generate MCP tools from IntakeDefinition
│   ├── submission-store.ts    # In-memory submission state management
│   └── transports/
│       ├── stdio.ts           # Stdio transport helpers
│       └── sse.ts             # SSE transport helpers
├── schemas/
│   ├── intake-schema.ts       # IntakeDefinition interface
│   └── json-schema-converter.ts # Zod to JSON Schema conversion
├── validation/
│   ├── validator.ts           # Zod validation helpers
│   └── error-mapper.ts        # Map Zod errors to Intake Contract
└── types/
    ├── intake-contract.ts     # Intake Contract type definitions
    └── mcp-types.ts           # MCP-specific type definitions
```

## Performance

The SDK is optimized for speed:

- **Tool Generation**: < 100ms for schemas with 10+ fields
- **Validation**: Sub-millisecond for typical forms
- **Memory**: Minimal overhead per registered intake

## Error Handling

All errors follow the Intake Contract error taxonomy:

| Code | Type | Description |
|------|------|-------------|
| `MISSING_INPUT` | `missing` | Required field not provided |
| `INVALID_INPUT` | `invalid` | Field doesn't meet validation rules |
| `FIELD_CONFLICT` | `conflict` | Field conflicts with other data |
| `NEEDS_APPROVAL` | `needs_approval` | Approval gate triggered |

Each error includes:
- `code`: Error code for programmatic handling
- `message`: Human-readable error message
- `field`: Field path (e.g., `contact_info.email`)
- `type`: Error category
- `details`: Additional context about the error
- `next_action`: Suggested action to resolve the error

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
  IntakeDefinition,
  IntakeError,
  SubmissionResponse,
  SubmissionState,
  MCPServerConfig
} from '@formbridge/mcp-server-sdk';
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT © FormBridge

## Learn More

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Zod Documentation](https://zod.dev/)
- [FormBridge Documentation](https://formbridge.dev/docs)
- [Example: Vendor Onboarding](./examples/vendor-onboarding/README.md)

## Support

- **Issues**: [GitHub Issues](https://github.com/formbridge/mcp-server-sdk/issues)
- **Documentation**: [FormBridge Docs](https://formbridge.dev/docs)
- **Community**: [Discord](https://discord.gg/formbridge)
