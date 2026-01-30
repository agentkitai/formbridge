# Feature 005 — React Form Renderer

> **Status:** IMPLEMENTED | **Phase:** 1 | **Priority:** must | **Complexity:** high | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as part of the FormBridge build. The React form renderer is the primary UI surface for FormBridge, providing an embeddable component that auto-renders web forms from IntakeSchema IR. Built as `packages/form-renderer` (~18.6K lines) with a companion Vite demo app in `packages/demo/`.

**Key files:**
- `packages/form-renderer/src/components/FormBridgeForm.tsx` — root form component
- `packages/form-renderer/src/components/fields/StringField.tsx` — string/text input field
- `packages/form-renderer/src/components/fields/NumberField.tsx` — numeric input field
- `packages/form-renderer/src/components/fields/BooleanField.tsx` — checkbox/toggle field
- `packages/form-renderer/src/components/fields/EnumField.tsx` — select/radio field
- `packages/form-renderer/src/components/fields/ArrayField.tsx` — repeatable field group
- `packages/form-renderer/src/components/fields/ObjectField.tsx` — nested object field group
- `packages/form-renderer/src/hooks/useFormState.ts` — form state management hook
- `packages/form-renderer/src/hooks/useValidation.ts` — client-side validation hook
- `packages/form-renderer/src/hooks/useFormSubmission.ts` — submission lifecycle hook
- `packages/form-renderer/src/utils/schemaParser.ts` — IntakeSchema to form config parser
- `packages/form-renderer/src/utils/validation.ts` — validation utility functions
- `packages/form-renderer/src/types/index.ts` — TypeScript type definitions
- `packages/form-renderer/src/styles/default.css` — BEM-style default theme
- `packages/form-renderer/src/styles/variables.css` — CSS custom property design tokens
- `packages/demo/` — Vite-based demo application

**Known issues:**
- IMPORTANT: API URL mismatch — client uses `POST /intakes/{intakeId}/submissions` (plural) vs server `POST /intake/:id/submissions` (singular). The path segment `intakes` vs `intake` will cause 404 errors against the real server.
- IMPORTANT: Idempotency key regenerates per click, defeating the purpose of idempotency. The key should be stable per logical submission attempt.
- IMPORTANT: `onChange` handler passes stale data due to shallow copy before `setField` call. State updates may not reflect the latest value in downstream callbacks.
- MINOR: `packages/react/` still exists as a stub alongside `packages/form-renderer/`, creating redundancy and potential confusion.
- MINOR: Demo app points to mock endpoint `https://api.formbridge.example.com` and will not work against a real backend without reconfiguration.

## Summary

The React Form Renderer is an embeddable React component that automatically renders web forms from IntakeSchema intermediate representation. It maps IntakeSchema field types to appropriate HTML controls, performs client-side validation according to schema constraints, and submits completed forms to the FormBridge HTTP API. The renderer supports all primitive and composite field types, provides accessible markup, and exposes BEM-style CSS with design tokens for full theme customization. A Vite-powered demo app is included for development and integration testing.

## Dependencies

**Upstream:**
- Feature 001 (IntakeSchema IR) — provides the schema format that drives form rendering
- Feature 002 (Schema Parsing) — schema parsing utilities for interpreting IntakeSchema
- Feature 004 (HTTP API) — submission endpoint for form data

**Downstream:**
- Feature 010 (Conditional Logic) — extends field rendering with show/hide logic
- Feature 015 (End-to-End Testing) — integration tests exercise the renderer
- Feature 017 (Accessibility Compliance) — builds on the renderer's base accessibility
- Feature 020 (Theming System) — extends design token and CSS architecture
- Feature 021 (Embed SDK) — wraps the renderer for third-party embedding

## Architecture & Design

The renderer follows a layered architecture:

1. **Schema Layer** — `schemaParser.ts` transforms IntakeSchema IR into an internal form configuration, resolving field types, constraints, defaults, and layout hints.
2. **State Layer** — `useFormState` manages form values, dirty tracking, and reset. `useValidation` runs constraint checks on blur and submit. `useFormSubmission` handles the submit lifecycle (prepare, send, handle response/error).
3. **Component Layer** — `FormBridgeForm` is the root component that iterates over parsed fields and delegates to type-specific field components (`StringField`, `NumberField`, `BooleanField`, `EnumField`, `ArrayField`, `ObjectField`). Each field component renders appropriate HTML controls with ARIA attributes.
4. **Style Layer** — BEM-naming convention with CSS custom properties (design tokens) in `variables.css`. The default theme in `default.css` provides a clean baseline. Consumers can override tokens or replace the stylesheet entirely.
5. **API Layer** — `useFormSubmission` calls the HTTP API with JSON payload and Idempotency-Key header. Handles success, validation errors (mapping server errors to field-level messages), and network failures.

Field type mapping:
| IntakeSchema Type | React Component | HTML Control |
|-------------------|----------------|--------------|
| `string` | `StringField` | `<input type="text">` or `<textarea>` |
| `number` / `integer` | `NumberField` | `<input type="number">` |
| `boolean` | `BooleanField` | `<input type="checkbox">` |
| `enum` | `EnumField` | `<select>` or `<input type="radio">` group |
| `array` | `ArrayField` | Repeatable field group with add/remove |
| `object` | `ObjectField` | Nested fieldset |

## Implementation Tasks

### Task 1: FormBridgeForm Root Component
- [x] Create `FormBridgeForm` component accepting IntakeSchema and config props
- [x] Implement schema-to-field iteration and type-based dispatch
- [x] Wire up form-level submit handler with prevent-default
- [x] Support controlled and uncontrolled modes via optional `value`/`onChange` props
- [x] Render form header, field list, error summary, and submit button

**Validation:** Component renders all field types from a sample IntakeSchema. Submit fires callback with form data.

### Task 2: Field Components
- [x] Implement `StringField` with text input and textarea variants
- [x] Implement `NumberField` with min/max/step support
- [x] Implement `BooleanField` with checkbox control
- [x] Implement `EnumField` with select and radio group variants
- [x] Implement `ArrayField` with add/remove item controls
- [x] Implement `ObjectField` with nested fieldset rendering
- [x] Each field component renders label, input, help text, and error message

**Validation:** Each field type renders correctly for its schema definition. Interactions (type, select, check) update state.

### Task 3: Form State Hook (useFormState)
- [x] Manage field values as a flat or nested object
- [x] Track dirty/touched state per field
- [x] Support initial values and reset
- [x] Expose `setField`, `getField`, `resetForm` methods
- [x] Handle array field add/remove operations

**Validation:** State updates propagate to field components. Dirty tracking reflects user interaction.

### Task 4: Validation Hook (useValidation)
- [x] Run required, minLength, maxLength, pattern, min, max constraints
- [x] Validate on blur and on submit
- [x] Map server-side validation errors to field paths
- [x] Expose per-field error state and form-level validity
- [x] Support custom validation functions

**Validation:** Invalid fields show error messages. Form cannot submit while invalid. Server errors map to correct fields.

### Task 5: Submission Hook (useFormSubmission)
- [x] Build JSON payload from form state
- [x] Send POST request to HTTP API endpoint
- [x] Include Idempotency-Key header
- [x] Handle success response (callback, redirect, reset)
- [x] Handle validation error response (map to field errors)
- [x] Handle network/server error (display message, allow retry)

**Validation:** Successful submission triggers callback. Validation errors appear on fields. Network errors show retry UI.

### Task 6: Schema Parser
- [x] Parse IntakeSchema IR into internal form configuration
- [x] Resolve field types, constraints, defaults
- [x] Handle nested objects and arrays
- [x] Extract layout hints and metadata

**Validation:** Parser output matches expected form configuration for sample schemas.

### Task 7: CSS and Theming
- [x] Define CSS custom properties (design tokens) in `variables.css`
- [x] Implement BEM-style class naming for all components
- [x] Create default theme in `default.css`
- [x] Document token override mechanism

**Validation:** Default theme renders cleanly. Token overrides change appearance. No style leakage to host page.

### Task 8: Accessibility
- [x] Add ARIA labels, describedby, and required attributes to all fields
- [x] Ensure error messages are linked to fields via `aria-describedby`
- [x] Support keyboard navigation (tab order, enter to submit)
- [x] Use semantic HTML elements (fieldset, legend, label)

**Validation:** Screen reader announces field labels, errors, and required state. Keyboard-only navigation works.

### Task 9: Demo Application
- [x] Create Vite-based demo app in `packages/demo/`
- [x] Load sample IntakeSchema and render form
- [x] Display submission result or errors
- [x] Provide theme switching examples

**Validation:** Demo app starts with `npm run dev`. Form renders and submits (to mock endpoint).

### Task 10: Unit and Integration Tests
- [x] Unit tests for schema parser
- [x] Unit tests for validation utilities
- [x] Component tests for each field type
- [x] Integration test for full form render and submit flow

**Validation:** All tests pass. Coverage meets project threshold.

## Test Plan

| Type | Description | Count |
|------|-------------|-------|
| Unit | Schema parser, validation utils, type mapping | ~25 |
| Component | Field components render, interact, show errors | ~30 |
| Integration | Full form render, fill, validate, submit cycle | ~10 |
| Accessibility | ARIA attributes, keyboard nav, screen reader | ~8 |
| Visual | Default theme renders correctly, token overrides work | ~5 |

## Documentation Tasks

- [x] Component API reference (props, callbacks, types)
- [x] Field type mapping documentation
- [x] Theming and CSS customization guide
- [x] Embedding integration guide
- [x] Demo app README with setup instructions

## Code Review Checklist

- [x] Type safety verified — all components and hooks fully typed
- [x] Patterns consistent — BEM naming, hook conventions, field component structure
- [x] No regressions — existing schema parsing unaffected
- [x] Performance acceptable — no unnecessary re-renders on field change
- [ ] API URL path mismatch needs correction before production use
- [ ] Idempotency key regeneration bug needs fix
- [ ] Stale onChange data issue needs fix

## Deployment & Release

- Package published as `@formbridge/form-renderer` (npm)
- Demo app deployable as static site (Vite build output)
- No server-side dependencies — purely client-side React component
- Peer dependencies: React 18+, ReactDOM 18+
- Bundle size target: < 50KB gzipped (excluding React)

## Observability & Monitoring

- Form render events (schema loaded, fields rendered)
- Validation events (field error count, validation pass/fail)
- Submission events (attempt, success, validation failure, network error)
- Client-side error boundary catches and reports render failures
- Optional analytics callback prop for custom telemetry

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API URL mismatch causes submission failures | High | High | Fix plural/singular path before production deployment |
| Idempotency key bug causes duplicate submissions | Medium | High | Stabilize key generation per logical submission |
| Stale onChange data causes form state bugs | Medium | Medium | Fix shallow copy timing in setField |
| Bundle size exceeds target | Low | Medium | Tree-shaking, lazy load field components |
| CSS leaks to/from host page | Low | Medium | Shadow DOM or stricter BEM scoping |
| Accessibility gaps in complex fields (Array, Object) | Medium | Medium | Manual screen reader testing, axe-core CI |

## Definition of Done

- [x] All acceptance criteria met (14/14)
- [x] Tests passing
- [x] Code reviewed
- [x] Documentation updated
- [ ] Known issues (API URL, idempotency key, stale onChange) tracked for resolution
