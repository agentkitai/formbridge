# @formbridge/form-renderer

> React component library for rendering FormBridge intake schemas as interactive forms with agent-human attribution tracking

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

## Overview

`@formbridge/form-renderer` provides a complete React toolkit for the FormBridge mixed-mode form system. It renders JSON Schema-based intake definitions as interactive forms, tracks which actor (agent or human) filled each field, and supports the full submission lifecycle including agent-to-human handoff and reviewer approval workflows.

## Features

- **Schema-driven rendering** — Automatically generates form fields from JSON Schema definitions
- **Field attribution** — Visual badges show which actor (agent/human) filled each field
- **Agent-to-human handoff** — `ResumeFormPage` loads submissions by resume token for human completion
- **Approval workflow** — `ReviewerView` and `ApprovalActions` for review/approve/reject flows
- **Multi-step wizards** — `WizardForm` with step validation, navigation, and progress tracking
- **7 field types** — String, Number, Boolean, Enum, Object, Array, and File fields
- **React hooks** — `useFormState`, `useValidation`, `useFormSubmission`, `useResumeSubmission`
- **Built-in API client** — Typed client for all FormBridge HTTP endpoints

## Installation

```bash
npm install @formbridge/form-renderer
```

Peer dependencies:

```bash
npm install react react-dom
```

## Quick Start

```tsx
import { FormBridgeForm } from '@formbridge/form-renderer';
import '@formbridge/form-renderer/styles.css';

const schema = {
  type: 'object',
  properties: {
    companyName: { type: 'string', title: 'Company Name' },
    email: { type: 'string', format: 'email', title: 'Email' },
  },
  required: ['companyName', 'email'],
};

function MyForm() {
  return (
    <FormBridgeForm
      schema={schema}
      fields={{}}
      fieldAttribution={{}}
      currentActor={{ kind: 'human', id: 'user-1' }}
      onFieldChange={(path, value, actor) => console.log(path, value)}
      onSubmit={(fields) => console.log('Submit:', fields)}
    />
  );
}
```

### Resume Flow (Agent-to-Human Handoff)

```tsx
import { ResumeFormPage } from '@formbridge/form-renderer';

// Renders a full form from a resume token (typically from a URL like /resume?token=rt_xyz)
function ResumePage() {
  return (
    <ResumeFormPage
      endpoint="http://localhost:3000"
      onLoad={(submissionId) => console.log('Loaded:', submissionId)}
    />
  );
}
```

### Approval Workflow

```tsx
import { ReviewerView, ApprovalActions } from '@formbridge/form-renderer';

function ReviewPage({ submission, schema }) {
  const reviewer = { kind: 'human', id: 'reviewer@acme.com' };

  return (
    <ReviewerView
      submission={submission}
      schema={schema}
      reviewer={reviewer}
      approvalActions={
        <ApprovalActions
          submissionId={submission.id}
          resumeToken={submission.resumeToken}
          reviewer={reviewer}
          onApprove={(data) => fetch('/approve', { method: 'POST', body: JSON.stringify(data) })}
          onReject={(data) => fetch('/reject', { method: 'POST', body: JSON.stringify(data) })}
        />
      }
    />
  );
}
```

## API Surface

### Components

| Component | Description |
|-----------|-------------|
| `FormBridgeForm` | Main form component — renders schema as interactive fields |
| `StringField` | Text input (supports email, url, date, textarea formats) |
| `NumberField` | Numeric input with min/max constraints |
| `BooleanField` | Checkbox input |
| `EnumField` | Select dropdown or radio group |
| `ObjectField` | Nested field group |
| `ArrayField` | List with add/remove controls |
| `FileField` | File upload with drag-and-drop |
| `WizardForm` | Multi-step progressive form |
| `ResumeFormPage` | Agent-to-human handoff page |
| `ReviewerView` | Read-only submission review |
| `ApprovalActions` | Approve/reject/request-changes buttons |
| `ActorBadge` | Visual actor attribution badge |
| `FieldWrapper` | Field label, description, and error wrapper |
| `ErrorDisplay` | Structured error display |
| `StepIndicator` | Wizard step progress indicator |

### Hooks

| Hook | Description |
|------|-------------|
| `useFormState` | Form data management with dirty tracking |
| `useValidation` | Schema-based validation |
| `useFormSubmission` | Full submission lifecycle (validate → submit → track) |
| `useResumeSubmission` | Fetch submission by resume token |
| `useWizardNavigation` | Wizard step state and navigation |
| `useConditions` | Conditional field visibility |

### API Client

| Export | Description |
|--------|-------------|
| `FormBridgeApiClient` | Typed HTTP client for FormBridge API |
| `createApiClient` | Factory function |
| `defaultApiClient` | Singleton client instance |

## Styling

Import the default stylesheet:

```tsx
import '@formbridge/form-renderer/styles.css';
```

All components accept a `className` prop. Default CSS classes use the `formbridge-` prefix.

## Documentation

Full component and hook reference: [React Form Renderer docs](../docs-site/react/)

## Testing

```bash
cd packages/form-renderer
npx vitest run                    # Run all tests
npx vitest run src/components/    # Run component tests only
```

Tests use `jsdom` environment for DOM simulation.

## Related Packages

- `@formbridge/schema-normalizer` — Schema parsing and normalization
- `@formbridge/admin-dashboard` — Admin UI for managing submissions
- `@formbridge/create-formbridge` — Project scaffolding CLI
