# MCP Integration

FormBridge auto-generates MCP (Model Context Protocol) tools from intake definitions.

## Overview

The MCP server exposes tools that allow AI agents to:
- Create submissions
- Set fields with attribution
- Submit for processing
- Generate handoff URLs

## Quick Setup

```typescript
import { FormBridgeMCPServer } from '@agentkitai/formbridge-mcp-server';

const server = new FormBridgeMCPServer({
  name: 'my-formbridge',
  intakes: [vendorIntake],
});
```
