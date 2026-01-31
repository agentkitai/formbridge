# @formbridge/admin-dashboard

> React SPA for managing FormBridge intakes, submissions, approvals, and webhook deliveries

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

## Overview

`@formbridge/admin-dashboard` is a Vite-powered React single-page application for administering a FormBridge instance. It provides a visual interface for browsing intakes, inspecting submissions, managing approval queues, viewing analytics, and monitoring webhook deliveries.

## Features

- **Dashboard** — Overview metrics: total intakes, submissions, pending approvals, submissions by state, recent activity
- **Intake browser** — List all registered intakes with submission counts
- **Submission browser** — Paginated table with state filtering, drill-down to full detail
- **Submission detail** — Fields, event timeline, webhook deliveries, approve/reject actions
- **Approval queue** — Dedicated view for submissions awaiting review
- **Analytics** — Summary metrics, submission volume chart, per-intake completion rates
- **Webhook monitor** — Delivery status table with retry actions for failed deliveries

## Setup

```bash
cd packages/admin-dashboard
npm install
```

## Development

```bash
npm run dev    # Starts Vite dev server on port 3002
```

The dashboard expects a FormBridge API server running at `http://localhost:3000`. Configure the base URL via the `FormBridgeApiClient` constructor.

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Overview metrics and recent activity |
| `/intakes` | Intake List | All registered intakes with counts |
| `/submissions` | Submission Browser | Paginated, filterable submission table |
| `/submissions/:id` | Submission Detail | Full detail with events and deliveries |
| `/approvals` | Approval Queue | Submissions pending review |
| `/analytics` | Analytics | Volume charts and completion metrics |
| `/webhooks` | Webhook Monitor | Delivery status and retry actions |

## API Client

The dashboard communicates with FormBridge through a typed API client:

```ts
import { FormBridgeApiClient } from './api/client';

const client = new FormBridgeApiClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'optional-bearer-token',
});

const intakes = await client.listIntakes();
const summary = await client.getAnalyticsSummary();
```

See the [API client source](src/api/client.ts) for full method documentation.

## Build

```bash
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

## Related Packages

- `@formbridge/form-renderer` — React form rendering components
- `@formbridge/schema-normalizer` — Schema parsing and normalization
- `@formbridge/create-formbridge` — Project scaffolding CLI
