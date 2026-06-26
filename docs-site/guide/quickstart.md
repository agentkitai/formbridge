# Quickstart

Get started with FormBridge in minutes.

## Installation

```bash
npm install @agentkitai/formbridge-mcp-server
```

## Create an Intake Definition

An intake definition describes the data you want to collect:

```typescript
import { createFormBridgeAppWithIntakes } from '@agentkitai/formbridge-mcp-server';

const vendorIntake = {
  id: 'vendor-onboarding',
  version: '1.0.0',
  name: 'Vendor Onboarding',
  description: 'Collect vendor registration data',
  schema: {
    type: 'object',
    properties: {
      companyName: { type: 'string', description: 'Legal company name' },
      taxId: { type: 'string', pattern: '^\\d{2}-\\d{7}$' },
      contactEmail: { type: 'string', format: 'email' },
    },
    required: ['companyName', 'taxId', 'contactEmail'],
  },
  destination: {
    kind: 'webhook',
    url: 'https://your-api.com/vendors',
  },
};
```

## Start the Server

```typescript
const app = createFormBridgeAppWithIntakes([vendorIntake]);
export default app; // Works with any Hono-compatible runtime
```

## Submit via HTTP

```bash
# Create submission
curl -X POST http://localhost:3000/intake/vendor-onboarding/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "actor": { "kind": "agent", "id": "my-agent" },
    "initialFields": { "companyName": "TechCorp" }
  }'
```

## Next Steps

- [Core Concepts](/guide/concepts) — Learn about the submission lifecycle
- [API Reference](/api/) — Full HTTP API documentation
- [MCP Integration](/mcp/) — Use with AI agents
