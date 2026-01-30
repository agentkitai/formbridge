# Feature 021 — Multi-Step Wizard Forms

> **Status:** PLANNED | **Phase:** 5 | **Priority:** Could | **Complexity:** Medium | **Impact:** Medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Enable intake schemas to define multi-step wizard flows where fields are grouped into sequential steps. The form renderer displays one step at a time with forward/back navigation and a progress indicator. Each step validates independently, allowing users and agents to save partial progress without passing the full-form validation. The HTTP API exposes step-level validation endpoints so agents can submit and validate one step at a time, and resume tokens enable step-by-step agent fills across multiple tool calls. Step transitions generate audit events, and conditional step visibility allows steps to be skipped when irrelevant based on prior answers.

## Dependencies

**Upstream:**
- Feature 3 (Form Renderer) — wizard UI is built in `packages/form-renderer/`
- Feature 5 (MCP Tool Generation) — step-level MCP tools generated from `src/mcp/tool-generator.ts`
- Feature 9 (Resume Tokens) — resume tokens enable step-by-step progression across tool calls

**Downstream:** None

**Internal task ordering:** Step type in schema IR (Task 1) must come first. WizardForm component (Task 2) and StepIndicator (Task 3) can proceed in parallel. Step navigation logic (Task 4) depends on Tasks 2-3. Per-step validation (Task 5) depends on Task 1. HTTP endpoints (Task 6) and MCP tools (Task 7) depend on Task 5. Step events (Task 8) and conditional step visibility (Task 9) are independent follow-ups.

## Architecture & Design

### Step Definition in IntakeSchema IR

Extend `IntakeSchema` in `packages/schema-normalizer/src/types/intake-schema.ts`:

```typescript
interface StepDefinition {
  /** Unique step identifier */
  id: string;
  /** Human-readable step title */
  title: string;
  /** Optional step description */
  description?: string;
  /** Field paths included in this step */
  fields: string[];
  /** Optional condition for step visibility (uses Feature 020 condition system if available) */
  condition?: FieldCondition | CompositeCondition;
}

// Extend IntakeSchema
interface IntakeSchema {
  // ... existing fields ...
  steps?: StepDefinition[];
}
```

When `steps` is defined, the form renderer operates in wizard mode. When `steps` is absent, the form renders all fields on a single page (current behavior, preserved).

### Wizard Form Component Architecture

```
WizardForm
  ├── StepIndicator        (progress bar / numbered steps)
  ├── StepContent           (renders fields for current step)
  │     └── FormBridgeForm  (existing field renderer, scoped to step fields)
  └── StepNavigation        (back / next / submit buttons)
```

### Step-Level Validation

Each step validates only the fields assigned to that step. Moving forward requires the current step to pass validation. Moving backward always succeeds (no validation on back). The final step's "Submit" button validates the current step AND runs a full-form validation before submission.

### HTTP API Step Endpoints

```
POST /intakes/:intakeId/submissions/:submissionId/steps/:stepId/validate
  Body: { resumeToken, fields: { ... } }
  Response: { ok: true, step: "contact_info", valid: true, nextStep: "company_details" }
           | { ok: false, step: "contact_info", errors: [...] }

POST /intakes/:intakeId/submissions/:submissionId/steps/:stepId/complete
  Body: { resumeToken, fields: { ... }, actor: {...} }
  Response: { ok: true, step: "contact_info", state: "in_progress", nextStep: "company_details", resumeToken: "rtok_..." }
```

### MCP Step-Level Tools

When steps are defined, the tool generator creates per-step tools:

```
formbridge_vendor_onboarding_step_contact_info
formbridge_vendor_onboarding_step_company_details
formbridge_vendor_onboarding_step_review_submit
```

Each tool's input schema contains only the fields for that step. The tool description includes step position (e.g., "Step 1 of 3: Contact Information") and lists the remaining steps.

### State Machine Integration

Step progression integrates with the existing submission state machine:

```
draft -> in_progress (on first step completion)
in_progress -> in_progress (on subsequent step completions)
in_progress -> submitted (on final step submission)
in_progress -> needs_review (if approval gates configured)
```

Step events are appended to the existing event stream for full audit trail visibility.

## Implementation Tasks

### Task 1: Step Type in Schema IR
- [ ] Define `StepDefinition` interface in `packages/schema-normalizer/src/types/intake-schema.ts`
- [ ] Add optional `steps` array to `IntakeSchema` interface
- [ ] Add `currentStep` field to `Submission` type in `src/types.ts` for tracking wizard progress
- [ ] Add `completedSteps` array to `Submission` type for tracking which steps have been completed
- [ ] Export new types from the schema-normalizer barrel
- [ ] Validate that step field paths reference fields that exist in the schema

**Dependencies:** None
**Effort:** S
**Validation:** Types compile; existing schemas without steps remain valid; step field paths are validated

### Task 2: WizardForm Component
- [ ] Create `packages/form-renderer/src/components/WizardForm.tsx`
- [ ] Accept IntakeSchema with steps and render one step at a time
- [ ] Manage current step index in component state
- [ ] Pass only current step's fields to the existing `FormBridgeForm` component
- [ ] Handle transition animations between steps (CSS transition or fade)
- [ ] Fall back to single-page mode when no steps are defined

**Dependencies:** Task 1
**Effort:** M
**Validation:** Wizard form renders fields for the current step only; transitions between steps are smooth; single-page fallback works

### Task 3: StepIndicator Component
- [ ] Create `packages/form-renderer/src/components/StepIndicator.tsx`
- [ ] Display step titles with visual progress indicator (numbered circles or bar)
- [ ] Highlight current step, completed steps (checkmark), and remaining steps
- [ ] Support clickable step indicators for direct navigation to completed steps
- [ ] Responsive design: collapse to minimal indicator on small screens
- [ ] Animate transitions when current step changes

**Dependencies:** Task 1
**Effort:** S
**Validation:** Step indicator renders correctly; completed/current/remaining states are visually distinct; click navigation works for completed steps

### Task 4: Step Navigation Logic
- [ ] Implement `useWizardNavigation` hook with `goNext()`, `goBack()`, `goToStep()`, `canGoNext`, `canGoBack`, `isLastStep`, `isFirstStep`
- [ ] `goNext()` triggers step validation before advancing; blocks if validation fails
- [ ] `goBack()` always succeeds; preserves field values
- [ ] `goToStep()` allows jumping to any completed step
- [ ] Track completed steps in state
- [ ] On the last step, replace "Next" button with "Submit" button
- [ ] Emit step change callbacks for parent component integration

**Dependencies:** Tasks 2, 3
**Effort:** M
**Validation:** Navigation works correctly; cannot advance past invalid step; can always go back; direct navigation to completed steps works

### Task 5: Per-Step Validation
- [ ] Create `validateStep(stepId, fields, schema)` function that validates only the fields in the given step
- [ ] Integrate with existing validator in `src/core/validator.ts`
- [ ] On "Next" button click, validate current step fields
- [ ] Display validation errors inline within the current step
- [ ] On "Submit" button click, validate current step AND run full-form validation
- [ ] Clear step-specific errors when user modifies fields
- [ ] Handle cross-step validation (fields in step 3 depend on values from step 1)

**Dependencies:** Task 1
**Effort:** M
**Validation:** Step validation catches errors in current step only; full validation runs on final submit; cross-step dependencies work

### Task 6: HTTP API Step Endpoints
- [ ] Add `POST /intakes/:intakeId/submissions/:submissionId/steps/:stepId/validate` endpoint to `src/routes/submissions.ts`
- [ ] Add `POST /intakes/:intakeId/submissions/:submissionId/steps/:stepId/complete` endpoint
- [ ] Validate request body includes resume token and step fields
- [ ] Save step fields and update `currentStep` and `completedSteps` on submission
- [ ] Rotate resume token on step completion
- [ ] Return next step ID in response (or indicate final step)
- [ ] Return 400 if step ID does not exist in schema
- [ ] Return 400 if attempting to complete a step out of order (unless step is already completed)

**Dependencies:** Task 5
**Effort:** M
**Validation:** HTTP endpoints accept step data, validate, and advance correctly; resume token rotates; out-of-order steps rejected

### Task 7: MCP Step-Level Tools
- [ ] Modify `src/mcp/tool-generator.ts` to detect steps in intake definition
- [ ] Generate one MCP tool per step with scoped input schema
- [ ] Include step position and remaining steps in tool description
- [ ] Each tool returns the resume token for the next step
- [ ] Generate a final "submit" tool for the last step that triggers full submission
- [ ] Fall back to single-tool generation when no steps are defined

**Dependencies:** Task 5
**Effort:** M
**Validation:** Per-step tools generated with correct field scoping; tool descriptions include step context; agent can complete multi-step form

### Task 8: Step Events in Audit Trail
- [ ] Define new event types: `step.started`, `step.completed`, `step.validation_failed`
- [ ] Add event types to `IntakeEventType` in `src/types/intake-contract.ts`
- [ ] Emit `step.started` when a step is first visited
- [ ] Emit `step.completed` when a step passes validation and is completed
- [ ] Emit `step.validation_failed` when step validation fails (include error details)
- [ ] Include step metadata (stepId, stepTitle, stepIndex) in event payload

**Dependencies:** Tasks 5, 6
**Effort:** S
**Validation:** Step events appear in submission event history; events contain correct step metadata

### Task 9: Conditional Step Visibility
- [ ] Add optional `condition` to `StepDefinition` using the same condition types as Feature 020
- [ ] Evaluate step conditions against current form values
- [ ] Hidden steps are skipped in navigation (next goes to the next visible step)
- [ ] Step indicator shows only visible steps
- [ ] Recalculate step visibility when form values change
- [ ] Handle the case where the current step becomes hidden (navigate to nearest visible step)
- [ ] If Feature 020 is not yet implemented, support a simplified condition format (field equals value)

**Dependencies:** Tasks 1, 4
**Effort:** M
**Validation:** Steps show/hide based on field values; navigation skips hidden steps; step indicator updates dynamically

### Task 10: Comprehensive Testing
- [ ] Write unit tests for step validation logic
- [ ] Write unit tests for wizard navigation (forward, back, direct jump)
- [ ] Write React component tests for WizardForm rendering
- [ ] Write React component tests for StepIndicator states
- [ ] Write HTTP endpoint tests for step validate and complete
- [ ] Write MCP tool generation tests for step-level tools
- [ ] Write E2E test: multi-step form renders, validates per-step, submits successfully
- [ ] Write E2E test: agent completes multi-step form via MCP step tools

**Dependencies:** Tasks 1-9
**Effort:** L
**Validation:** All tests pass; wizard behavior is consistent across client, server, and MCP

## Test Plan

| Type | Description | Target Count |
|------|-------------|--------------|
| Unit | Step validation (valid/invalid per step) | 12 |
| Unit | Wizard navigation logic | 10 |
| Unit | Conditional step visibility | 8 |
| Unit | MCP step-level tool generation | 8 |
| Unit | Step event emission | 6 |
| Component | WizardForm rendering and transitions | 10 |
| Component | StepIndicator visual states | 6 |
| Integration | HTTP step endpoints | 12 |
| E2E | Full wizard flow (human) | 2 |
| E2E | Full wizard flow (agent via MCP) | 2 |

## Documentation Tasks

- [ ] Document step definition syntax in IntakeSchema specification
- [ ] Write "Building a Multi-Step Wizard" guide with examples
- [ ] Document HTTP step API endpoints with request/response examples
- [ ] Document MCP step-level tool usage for agent developers
- [ ] Add a multi-step example to the templates library (Feature 018)

## Code Review Checklist

- [ ] Type safety: step definitions are fully typed; field paths validated at schema load time
- [ ] Patterns consistent: wizard mode is opt-in; single-page forms work identically to before
- [ ] No regressions: forms without steps render and validate exactly as before
- [ ] Performance acceptable: step transitions are instant; no full-form re-render on step change
- [ ] Accessibility: step indicator is ARIA-compliant; keyboard navigation works between steps

## Deployment & Release

- **Breaking changes:** None; steps are optional on IntakeSchema
- **New components:** `WizardForm`, `StepIndicator`, `useWizardNavigation`
- **New endpoints:** `POST .../steps/:stepId/validate`, `POST .../steps/:stepId/complete`
- **New event types:** `step.started`, `step.completed`, `step.validation_failed`
- **Bundle impact:** ~5KB minified for wizard components; tree-shakeable if unused

## Observability & Monitoring

- Step events in the audit trail provide step-level funnel analytics
- Track step completion rates to identify where users/agents drop off
- Log step validation failures at info level for form design feedback
- Monitor average time per step for UX optimization

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Step ordering conflicts with conditional logic | Medium | Medium | Define clear evaluation order; step conditions evaluated before rendering |
| Cross-step validation is complex | Medium | Medium | Full-form validation on final submit catches cross-step issues; document limitations |
| Agent confusion with per-step tools | Low | Medium | Clear tool descriptions with step context and remaining step count |
| Step indicator accessibility issues | Low | Medium | Follow WAI-ARIA step indicator patterns; test with screen readers |
| Performance with many steps (10+) | Low | Low | Lazy-load step content; virtualize step indicator if needed |

## Definition of Done

- [ ] Step definitions in IntakeSchema IR
- [ ] One step at a time with next/back navigation
- [ ] Progress indicator showing completed/current/remaining steps
- [ ] Independent per-step validation (cannot advance past invalid step)
- [ ] Back navigation always succeeds and preserves data
- [ ] HTTP step-level validation and completion endpoints
- [ ] MCP step-level tools generated with scoped field schemas
- [ ] Step events in audit trail (step.started, step.completed, step.validation_failed)
- [ ] Conditional step visibility (skip irrelevant steps)
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No regressions
