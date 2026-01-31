# @formbridge/templates

> Pre-built intake templates for common form use cases, providing both Zod and JSON Schema definitions

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

## Overview

`@formbridge/templates` provides ready-made intake schema templates for common business workflows. Each template includes both a Zod schema and a JSON Schema representation, along with metadata describing the template's purpose and category.

## Available Templates

| ID | Name | Category | Description |
|----|------|----------|-------------|
| `vendor-onboarding` | Vendor Onboarding | procurement | Vendor registration and compliance data |
| `it-access-request` | IT Access Request | — | System and resource access requests |
| `customer-intake` | Customer Intake | — | Customer registration forms |
| `expense-report` | Expense Report | — | Employee expense submission |
| `bug-report` | Bug Report | — | Software issue tracking |

## Installation

```bash
npm install @formbridge/templates
```

## Quick Start

```ts
import { allTemplates } from '@formbridge/templates';

// Get a specific template
const vendorTemplate = allTemplates['vendor-onboarding'];

console.log(vendorTemplate.metadata.name);        // "Vendor Onboarding"
console.log(vendorTemplate.metadata.description);  // "Collect vendor registration..."
console.log(vendorTemplate.jsonSchema);            // JSON Schema object
```

## Template Structure

Each template exports a `TemplateExport` object:

```ts
interface TemplateExport {
  schema: ZodType;                      // Zod schema for runtime validation
  jsonSchema: Record<string, unknown>;  // JSON Schema representation
  metadata: TemplateMetadata;           // Template metadata
}

interface TemplateMetadata {
  id: string;          // Template identifier (e.g. "vendor-onboarding")
  name: string;        // Human-readable name
  description: string; // What the template collects
  category: string;    // Grouping category
  version: string;     // Semantic version
}
```

## Customization

Templates are designed as starting points. Use them with `@formbridge/create` to scaffold a new project, then modify the generated schema to fit your needs:

```bash
npx @formbridge/create --template vendor-onboarding --schema zod --interface http
```

## Related Packages

- `@formbridge/create-formbridge` — CLI scaffolder that uses these templates
- `@formbridge/schema-normalizer` — Converts templates between schema formats
