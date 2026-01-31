# FormBridge

Mixed-mode agent-human form submission infrastructure. AI agents fill what they know, humans complete the rest — with full field-level attribution, approval workflows, and webhook delivery.

[![CI](https://github.com/amitpaz1/formbridge/actions/workflows/ci.yml/badge.svg)](https://github.com/amitpaz1/formbridge/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-912%20passing-brightgreen.svg)](#testing)

## The Problem

AI agents can gather _most_ of the data for a form — but some fields need a human: signatures, file uploads, identity verification, subjective preferences. Existing form tools force you to choose: fully automated _or_ fully manual. Nothing handles the handoff.

## How FormBridge Works

```
Agent                          FormBridge                        Human
  │                               │                                │
  ├─ POST /submissions ──────────►│  Creates draft, returns         │
  │  (fills known fields)         │  resumeToken + handoff URL      │
  │                               │                                │
  │                               │◄──── Opens link ────────────────┤
  │                               │  Pre-filled form with           │
  │                               │  attribution badges             │
  │                               │                                │
  │                               │◄──── Fills remaining fields ────┤
  │                               │◄──── Submits ──────────────────┤
  │                               │                                │
  │  ◄── Webhook delivery ───────┤  Validated, approved,           │
  │      (HMAC-signed)            │  delivered to destination       │
```

1. **Agent creates** a submission and fills fields it knows
2. **FormBridge generates** a secure resume URL with a rotating token
3. **Human opens** the link — sees pre-filled fields with "filled by agent" badges
4. **Human completes** remaining fields, uploads files, submits
5. **Submission flows** through validation → optional approval gates → webhook delivery
6. **Every field** tracks who filled it (agent, human, or system) and when

## Packages

| Package | Description |
|---------|-------------|
| `@formbridge/mcp-server` | Core server — HTTP API, MCP tools, submission lifecycle, storage backends |
| `@formbridge/form-renderer` | React components and hooks for rendering forms and resuming agent-started submissions |
| `@formbridge/create` | CLI scaffolding tool (`npx @formbridge/create`) |
| `@formbridge/schema-normalizer` | Converts Zod, JSON Schema, and OpenAPI specs into a unified IntakeSchema IR |
| `@formbridge/templates` | Ready-made intake templates (vendor onboarding, IT access, customer intake, expense report, bug report) |
| `@formbridge/admin-dashboard` | React SPA for managing intakes, reviewing submissions, and configuring approvals |

## Quick Start

### Installation

```bash
npm install @formbridge/mcp-server
```

### Option 1: HTTP API Server

```typescript
import { createFormBridgeApp } from '@formbridge/mcp-server';
import { serve } from '@hono/node-server';

const app = createFormBridgeApp({
  intakes: [{
    id: 'contact-form',
    version: '1.0.0',
    name: 'Contact Form',
    schema: {
      type: 'object',
      properties: {
        name:    { type: 'string', title: 'Full Name' },
        email:   { type: 'string', format: 'email', title: 'Email' },
        message: { type: 'string', title: 'Message' },
      },
      required: ['name', 'email', 'message'],
    },
    destination: {
      type: 'webhook',
      name: 'Contact API',
      config: { url: 'https://api.example.com/contacts', method: 'POST' },
    },
  }],
});

serve({ fetch: app.fetch, port: 3000 });
console.log('FormBridge running on http://localhost:3000');
```

**Full submission lifecycle:**

```bash
# 1. Agent creates a submission with known fields
curl -X POST http://localhost:3000/intake/contact-form/submissions \
  -H 'Content-Type: application/json' \
  -d '{
    "actor": { "kind": "agent", "id": "gpt-4" },
    "idempotencyKey": "req_abc123",
    "initialFields": { "name": "John Doe", "email": "john@example.com" }
  }'
# → { ok: true, submissionId: "sub_...", resumeToken: "rtok_...", state: "draft" }

# 2. Human completes remaining fields via resume token
curl -X PATCH http://localhost:3000/intake/contact-form/submissions/sub_.../fields \
  -H 'Content-Type: application/json' \
  -d '{
    "resumeToken": "rtok_...",
    "actor": { "kind": "human", "id": "user-1" },
    "fields": { "message": "I'd like to learn more about your product." }
  }'

# 3. Submit the completed form
curl -X POST http://localhost:3000/intake/contact-form/submissions/sub_.../submit \
  -H 'Content-Type: application/json' \
  -d '{
    "resumeToken": "rtok_...",
    "actor": { "kind": "human", "id": "user-1" }
  }'
# → Triggers validation, approval (if configured), and webhook delivery
```

### Option 2: MCP Server (for AI agents)

```typescript
import { FormBridgeMCPServer } from '@formbridge/mcp-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new FormBridgeMCPServer({
  name: 'my-formbridge',
  version: '1.0.0',
});

server.registerIntake({
  id: 'vendor_onboarding',
  version: '1.0.0',
  name: 'Vendor Onboarding',
  description: 'Register new vendors',
  schema: z.object({
    companyName: z.string().describe('Legal company name'),
    taxId:       z.string().describe('Tax identification number'),
    contact:     z.string().email().describe('Primary contact email'),
    w9Upload:    z.string().optional().describe('W-9 form upload (human-only)'),
  }),
  destination: {
    type: 'webhook',
    name: 'Vendor System',
    config: { url: 'https://api.example.com/vendors', method: 'POST' },
  },
});

// Each intake auto-generates 4 MCP tools:
//   vendor_onboarding__create   — Start a new submission
//   vendor_onboarding__set      — Update fields
//   vendor_onboarding__validate — Check completeness
//   vendor_onboarding__submit   — Submit for processing

const transport = new StdioServerTransport();
await server.getServer().connect(transport);
```

### Option 3: React Form Renderer

```tsx
import { FormBridgeForm, ResumeFormPage } from '@formbridge/form-renderer';

// Standalone form
function ContactPage() {
  return (
    <FormBridgeForm
      schema={contactSchema}
      endpoint="http://localhost:3000"
      actor={{ kind: 'human', id: 'user-1' }}
      onSuccess={(data, submissionId) => {
        console.log('Submitted:', submissionId);
      }}
    />
  );
}

// Resume an agent-started form (pre-filled fields + attribution badges)
function ResumePage() {
  const token = new URLSearchParams(location.search).get('token');
  return (
    <ResumeFormPage
      resumeToken={token}
      endpoint="http://localhost:3000"
    />
  );
}
```

### Option 4: CLI Scaffolding

```bash
# Interactive — walks you through setup
npx @formbridge/create

# Non-interactive
npx @formbridge/create --name my-intake --schema zod --interface http,mcp
```

## Features

### Core
- **Submission State Machine** — `draft → submitted → approved → delivered` with configurable transitions
- **Field Attribution** — Every field tracks which actor (agent, human, system) set it and when
- **Resume Tokens** — Secure, rotating tokens for handoff URLs (rotated on every state change)
- **Idempotent Submissions** — Duplicate requests with the same key return the existing submission
- **Schema Normalization** — Accept Zod schemas, JSON Schema, or OpenAPI specs as input

### Collaboration
- **Mixed-Mode Forms** — Agents fill what they can, humans complete the rest
- **Conditional Fields** — Show/hide fields based on other field values (dynamic schema)
- **Multi-Step Wizard** — Progressive disclosure with step indicators and navigation
- **File Upload Protocol** — Signed URL negotiation for secure file handling (S3-compatible)

### Production
- **Approval Gates** — Configurable review workflows that pause submissions until approved/rejected
- **Webhook Delivery** — HMAC-signed payloads with exponential backoff and delivery tracking
- **Event Stream** — Append-only audit trail for every state change, field update, and action
- **Auth & RBAC** — API key auth, OAuth provider, role-based access control, rate limiting
- **Multi-Tenancy** — Tenant isolation with configurable storage and access boundaries
- **Pluggable Storage** — In-memory (dev), SQLite (single-server), S3 (file uploads)

### Developer Experience
- **MCP Server** — Auto-generates MCP tools from intake definitions for AI agent integration
- **Admin Dashboard** — React SPA for managing intakes, reviewing submissions, analytics
- **CLI Scaffolding** — `npx @formbridge/create` generates a ready-to-run project
- **5 Starter Templates** — Vendor onboarding, IT access request, customer intake, expense report, bug report
- **VitePress Docs** — API reference, guides, walkthroughs, and concept docs
- **CI/CD** — GitHub Actions for lint, typecheck, and tests on Node 18/20/22

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/intake/:id/schema` | Get intake schema |
| `POST` | `/intake/:id/submissions` | Create submission |
| `GET` | `/intake/:id/submissions/:subId` | Get submission |
| `PATCH` | `/intake/:id/submissions/:subId/fields` | Update fields |
| `POST` | `/intake/:id/submissions/:subId/submit` | Submit |
| `GET` | `/intake/:id/submissions/:subId/events` | Get event stream |
| `POST` | `/intake/:id/submissions/:subId/approve` | Approve submission |
| `POST` | `/intake/:id/submissions/:subId/reject` | Reject submission |
| `POST` | `/intake/:id/submissions/:subId/uploads` | Request file upload URL |
| `POST` | `/intake/:id/submissions/:subId/uploads/:uploadId/verify` | Verify file upload |
| `GET` | `/webhooks/deliveries` | List webhook deliveries |
| `GET` | `/analytics` | Submission analytics |

### Submission States

```
draft → submitted → approved → delivered
                  ↘ rejected
```

- **draft** — Being filled by agent and/or human
- **submitted** — All required fields complete, pending review (or auto-approved)
- **approved** — Passed approval gates, queued for delivery
- **rejected** — Rejected by reviewer
- **delivered** — Webhook successfully delivered to destination

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     FormBridge Core                       │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Intake     │  │  Submission  │  │   Approval     │  │
│  │  Registry    │  │   Manager    │  │   Manager      │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Event      │  │   Webhook    │  │   Condition    │  │
│  │   Store      │  │   Manager    │  │   Evaluator    │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Storage Layer                           │ │
│  │  Memory (dev) │ SQLite (prod) │ S3 (file uploads)   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │   HTTP API        │  │   MCP Server                 │  │
│  │   (Hono)          │  │   (Stdio + SSE transports)   │  │
│  └──────────────────┘  └──────────────────────────────┘  │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │   Auth / RBAC     │  │   Rate Limiting              │  │
│  │   Multi-tenancy   │  │   CORS                       │  │
│  └──────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

┌────────────────────┐  ┌────────────────────────────────┐
│  React Form        │  │  Admin Dashboard               │
│  Renderer          │  │  (React SPA)                   │
└────────────────────┘  └────────────────────────────────┘

┌────────────────────┐  ┌────────────────────────────────┐
│  CLI Scaffolding   │  │  Schema Normalizer             │
│  (create-formbridge)│  │  (Zod/JSONSchema/OpenAPI → IR) │
└────────────────────┘  └────────────────────────────────┘
```

## Project Structure

```
src/
  auth/           # API key auth, OAuth, RBAC, rate limiting, tenant isolation
  core/           # Business logic — submission manager, approval gates, events,
                  #   state machine, condition evaluator, webhook delivery
  mcp/            # MCP server, tool generator, stdio + SSE transports
  middleware/     # Hono middleware (CORS, error handling)
  routes/         # HTTP route handlers (submissions, approvals, uploads, events,
                  #   webhooks, analytics, health)
  storage/        # Storage backends (memory, SQLite, S3) + migration utility
  types/          # TypeScript types and intake contract spec

packages/
  admin-dashboard/    # React SPA — intake management, submission review, analytics
  create-formbridge/  # CLI tool — interactive + non-interactive project scaffolding
  form-renderer/      # React components — FormBridgeForm, ResumeFormPage, WizardForm
  schema-normalizer/  # Converts Zod, JSON Schema, OpenAPI → unified IntakeSchema IR
  shared/             # Shared utilities across packages
  templates/          # 5 starter templates with full schema definitions
  demo/               # Demo app with sample intakes and pre-configured workflows

docs/               # VitePress documentation site
tests/              # 912 tests across 36 files
.github/workflows/  # CI (lint + typecheck + tests on Node 18/20/22) + release
```

## Development

```bash
# Install dependencies
npm install

# Run all 912 tests
npm run test:run

# Watch mode
npm test

# Type checking (zero errors)
npm run typecheck

# Lint (ESLint flat config v9)
npm run lint

# Build
npm run build

# Run the demo app
cd packages/demo && npm run dev
```

## Testing

The test suite covers:

- **Core logic** — Submission lifecycle, state machine transitions, approval workflows, field attribution
- **API endpoints** — Full HTTP request/response testing for all routes
- **MCP server** — Tool generation, server initialization, transport handling
- **Storage backends** — Memory, SQLite, and S3 storage with edge cases
- **CLI scaffolding** — End-to-end CLI tests (interactive + non-interactive)
- **Schema normalization** — Zod, JSON Schema, and OpenAPI conversion
- **Condition evaluation** — Dynamic field visibility rules
- **Webhook delivery** — HMAC signing, retry logic, delivery tracking

```
912 tests passing across 36 test files
74% code coverage (core modules 90%+)
```

## Roadmap

- [ ] npm package publishing
- [ ] PostgreSQL storage backend
- [ ] Real-time collaboration (WebSocket field locking)
- [ ] Email notifications for pending approvals
- [ ] Form analytics dashboard with charts
- [ ] Hosted cloud version

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/amitpaz1/formbridge.git
cd formbridge
npm install
npm run test:run   # All tests pass
npm run typecheck  # Zero errors
npm run lint       # Clean
```

## License

[MIT](./LICENSE) © 2026 Amit Paz
