# Vendor Onboarding MCP Server Example

This example demonstrates a realistic vendor onboarding intake form with 10+ fields including nested objects, enums, and various validation constraints. It showcases how FormBridge generates MCP tool servers from IntakeSchema definitions.

## Overview

The vendor onboarding example includes:

- **Complex Schema**: 10+ fields including personal info, business details, banking information, and required documents
- **Nested Objects**: Bank account information, contact details, and document uploads
- **Validation Rules**: Type constraints, enums, email validation, and custom business logic
- **Approval Gates**: Automatic approval gate for vendors with annual revenue over $1M
- **Destination Config**: Webhook delivery with retry logic for vendor management systems

## Schema Structure

```typescript
{
  legal_name: string              // Legal business name
  country: string                 // Two-letter country code (ISO 3166-1 alpha-2)
  tax_id: string                  // Tax identification number
  bank_account: {                 // Bank account information
    account_number: string
    routing_number: string
    account_holder_name: string
  }
  documents: {                    // Required tax documents
    w9_or_w8: string
  }
  contact_info: {                 // Contact information
    name: string
    email: string
    phone: string
  }
  business_type: enum             // sole_proprietor | llc | corporation | partnership
  employees: number               // Number of employees (min: 1)
  annual_revenue: number          // Annual revenue in USD (min: 0)
  established_date: string        // Date business was established (ISO 8601)
}
```

## Running the Server

### Prerequisites

- Node.js >= 18.0.0
- TypeScript project with tsx loader

### Start the Server

```bash
# From the project root
node --loader tsx examples/vendor-onboarding/server.ts
```

The server will start using stdio transport and wait for MCP client connections.

### CLI Options

```bash
# Show help
node --loader tsx examples/vendor-onboarding/server.ts --help

# Show version
node --loader tsx examples/vendor-onboarding/server.ts --version
```

## Testing with MCP Clients

### Using Claude Desktop

1. Add the server to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "vendor-onboarding": {
      "command": "node",
      "args": [
        "--loader",
        "tsx",
        "/absolute/path/to/examples/vendor-onboarding/server.ts"
      ]
    }
  }
}
```

2. Restart Claude Desktop

3. The vendor onboarding tools will be available for Claude to use

### Using MCP Inspector

```bash
# Install MCP Inspector (if not already installed)
npm install -g @modelcontextprotocol/inspector

# Run the inspector
npx @modelcontextprotocol/inspector node --loader tsx examples/vendor-onboarding/server.ts
```

The inspector will open a web interface where you can:
- List available tools
- Inspect tool schemas
- Call tools with test data
- View validation responses

## Available MCP Tools

The server exposes four MCP tools for the vendor onboarding intake:

### 1. `vendor_onboarding__create`
Create a new vendor submission with initial data.

**Example:**
```json
{
  "legal_name": "Acme Corporation",
  "country": "US",
  "business_type": "corporation"
}
```

### 2. `vendor_onboarding__set`
Update fields in an existing submission.

**Example:**
```json
{
  "submission_id": "sub_123",
  "legal_name": "Acme Corp Inc.",
  "employees": 50
}
```

### 3. `vendor_onboarding__validate`
Validate submission data without persisting it.

**Example:**
```json
{
  "legal_name": "Acme Corporation",
  "country": "US",
  "tax_id": "12-3456789",
  "business_type": "corporation",
  "employees": 50,
  "annual_revenue": 2000000,
  "established_date": "2020-01-15"
}
```

### 4. `vendor_onboarding__submit`
Submit vendor information for processing.

**Example:**
```json
{
  "submission_id": "sub_123"
}
```

## Validation Examples

### Successful Submission

```json
{
  "success": true,
  "submission_id": "sub_123",
  "status": "submitted",
  "data": { /* complete vendor data */ }
}
```

### Validation Errors

```json
{
  "success": false,
  "errors": [
    {
      "code": "INVALID_INPUT",
      "message": "Invalid email format",
      "field": "contact_info.email",
      "details": {
        "provided": "not-an-email",
        "expected": "valid email address"
      }
    }
  ]
}
```

### Approval Gate Triggered

When annual revenue exceeds $1M:

```json
{
  "success": false,
  "errors": [
    {
      "code": "NEEDS_APPROVAL",
      "message": "Requires approval for vendors with annual revenue over $1M",
      "field": "annual_revenue",
      "gate_id": "high_revenue_approval"
    }
  ]
}
```

## Features Demonstrated

### Type Safety
All fields are fully typed and validated using Zod schemas. Invalid types are caught at validation time.

### Nested Object Validation
Bank account and contact information are validated as nested objects with their own constraints.

### Enum Constraints
Business type is restricted to specific values: `sole_proprietor`, `llc`, `corporation`, `partnership`.

### Email Validation
Contact email is validated using Zod's built-in email validator.

### Numeric Constraints
- `employees`: Must be at least 1
- `annual_revenue`: Must be non-negative

### Approval Gates
Vendors with annual revenue over $1M automatically trigger the `high_revenue_approval` gate.

### Field Hints
The intake includes helpful labels, placeholders, and help text for each field to guide AI agents and users.

### Destination Configuration
Configured webhook destination with:
- POST to `https://api.example.com/vendors`
- Webhook notification to `https://api.example.com/webhooks/vendor-created`
- Retry logic: 3 attempts with exponential backoff

## Next Steps

1. **Customize the Schema**: Modify `schema.ts` to add/remove fields for your use case
2. **Add Approval Gates**: Define custom approval gates based on your business rules
3. **Configure Destination**: Update webhook URLs to point to your actual vendor management system
4. **Add Field Hints**: Enhance field hints with better labels and help text for your users
5. **Test with Real Agents**: Connect Claude, ChatGPT, or other MCP-compatible agents to test the workflow

## Learn More

- [FormBridge MCP Server SDK Documentation](../../README.md)
- [Model Context Protocol (MCP) Specification](https://spec.modelcontextprotocol.io/)
- [Zod Schema Validation](https://zod.dev/)
