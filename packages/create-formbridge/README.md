# @formbridge/create

> CLI scaffolding tool for creating new FormBridge projects with schema, interface, and template options

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

## Overview

`@formbridge/create` generates a new FormBridge project with the right schema format, server interfaces, and optional starter template. It can run interactively (prompting for each option) or non-interactively with all flags specified.

## Usage

### Interactive Mode

```bash
npx @formbridge/create
```

Prompts for project name, schema format, interfaces, and optional template.

### Non-Interactive Mode

```bash
npx @formbridge/create \
  --name my-intake \
  --schema zod \
  --interface mcp,http \
  --template vendor-onboarding
```

## CLI Options

| Flag | Type | Values | Description |
|------|------|--------|-------------|
| `--name` | string | any | Project directory name |
| `--schema` | string | `zod`, `json-schema`, `openapi` | Schema definition format |
| `--interface` | string | `react`, `mcp`, `http` (comma-separated) | Server/client interfaces to include |
| `--template` | string | template ID or omit | Starter template to seed the schema |

## Generated Files

The scaffolder creates a complete project directory with:

| File | Condition | Description |
|------|-----------|-------------|
| `package.json` | always | Dependencies based on selected interfaces |
| `tsconfig.json` | always | TypeScript configuration |
| `src/schema.ts` | `--schema zod` | Zod schema definition |
| `src/schema.json.ts` | `--schema json-schema` | JSON Schema definition |
| `src/schema.openapi.ts` | `--schema openapi` | OpenAPI specification |
| `src/server.ts` | `--interface http` | Hono HTTP server |
| `src/mcp-server.ts` | `--interface mcp` | MCP server with tool generation |
| `src/Form.tsx` | `--interface react` | React form component |
| `README.md` | always | Project documentation |
| `.env.example` | always | Environment variable template |
| `.gitignore` | always | Git ignore rules |

When a `--template` is specified, the schema file is pre-populated with the template's field definitions.

## Available Templates

| ID | Name | Description |
|----|------|-------------|
| `vendor-onboarding` | Vendor Onboarding | Vendor registration and compliance data collection |
| `it-access-request` | IT Access Request | System and resource access request forms |
| `customer-intake` | Customer Intake | Customer registration forms |
| `expense-report` | Expense Report | Employee expense submission |
| `bug-report` | Bug Report | Software issue tracking |

## Example

```bash
# Create a vendor onboarding project with HTTP API and MCP server
npx @formbridge/create --name vendor-intake --schema zod --interface http,mcp --template vendor-onboarding

cd vendor-intake
npm install
npm run dev
```

## Related Packages

- `@formbridge/templates` — Template definitions used by the scaffolder
- `@formbridge/schema-normalizer` — Schema parsing and normalization
- `@formbridge/form-renderer` — React form rendering components
