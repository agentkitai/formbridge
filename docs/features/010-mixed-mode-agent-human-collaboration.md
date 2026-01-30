# Feature 010 — Mixed-Mode Agent-Human Collaboration

> **Status:** IMPLEMENTED | **Phase:** 3 | **Priority:** should | **Complexity:** high | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Mixed-mode agent-human collaboration is implemented as a first-class workflow pattern. An agent fills known fields, generates a resume URL via the MCP `handoffToHuman` tool, and a human completes the rest in a pre-filled form. The submission tracks field-level actor attribution (`FieldAttribution` map keyed by field path to `Actor`), enabling audit trails that show who filled each field. The React form renderer displays agent-filled fields with visual "Filled by agent" badges via the `ActorBadge` component. The `FieldWrapper` component reads attribution data to render badges on individual fields. The `ResumeFormPage` component handles the human side of the handoff flow, loading the submission by resume token and presenting a pre-filled, editable form. Handoff events (`handoff.link_issued`, `handoff.resumed`) are defined in the event type system.

**Key files:**
- `src/core/submission-manager.ts` -- field-level actor attribution in `setFields()`, `generateHandoffUrl()` method, `FieldAttribution` tracking
- `src/mcp/tool-generator.ts` -- `handoffToHuman` MCP tool registration, resume URL generation
- `src/types.ts` -- `FieldAttribution` interface, `Submission` interface with `fieldAttribution` field
- `src/types/intake-contract.ts` -- `Actor` interface (`kind: agent | human | system`), `handoff.link_issued` and `handoff.resumed` event types
- `src/routes/submissions.ts` -- HTTP routes for submission operations with actor tracking
- `packages/form-renderer/src/components/FormBridgeForm.tsx` -- main form orchestrator with attribution-aware rendering
- `packages/form-renderer/src/components/FieldWrapper.tsx` -- field wrapper with actor badge display
- `packages/form-renderer/src/components/ActorBadge.tsx` -- visual badge component for actor attribution
- `packages/form-renderer/src/components/ResumeFormPage.tsx` -- resume form page for human handoff
- `packages/form-renderer/src/hooks/useFormState.ts` -- form state management hook
- `tests/integration/agent-handoff.test.ts` -- integration tests for handoff flow

**Known issues:** None specific to this feature.

## Summary

Mixed-mode agent-human collaboration enables a workflow where an AI agent fills known fields of a submission, generates a shareable resume URL, and a human completes the remaining fields. The same submission is used throughout, with field-level actor attribution tracking whether each field was filled by an agent, human, or system actor. The form renderer visually distinguishes agent-filled fields with badges. Both the agent and human operate through the same Intake Contract flow -- the same validation pipeline, the same events, and the same webhooks.

## Dependencies

**Upstream:** Feature 005 (React Form Renderer), Feature 009 (Resumable Sessions with Resume Tokens)
**Downstream:** None (end-user feature)

## Architecture & Design

### Actor Model
The `Actor` interface (`src/types/intake-contract.ts`) defines three actor kinds:
```typescript
interface Actor {
  kind: "agent" | "human" | "system";
  id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
```

### Field-Level Attribution
The `FieldAttribution` interface (`src/types.ts`) maps field paths to the actor who filled them:
```typescript
interface FieldAttribution {
  [fieldPath: string]: Actor;
}
```

Every call to `setFields()` records the requesting actor against each field path in `submission.fieldAttribution`. This creates an immutable audit trail of who filled each field.

### Handoff Flow
1. Agent creates a submission and fills known fields via MCP tools or HTTP API
2. Agent calls `handoffToHuman` MCP tool (or `generateHandoffUrl()` programmatically)
3. Server generates a resume URL containing the resume token
4. Server emits `handoff.link_issued` event
5. Human opens the resume URL in the `ResumeFormPage` component
6. Form renders with pre-filled fields showing `ActorBadge` badges
7. Human fills remaining fields, which are attributed to the human actor
8. Human submits; server emits `handoff.resumed` event on first human interaction

### UI Components
- `ActorBadge` -- BEM-styled badge with kind-specific CSS classes (`formbridge-actor-badge--agent`, `--human`, `--system`), configurable prefix text, size variants, ARIA labels
- `FieldWrapper` -- wraps each form field, renders `ActorBadge` when `fieldAttribution` data is present for that field
- `ResumeFormPage` -- standalone page component that loads a submission by resume token and renders the form with pre-filled values

## Implementation Tasks

### Task 1: Field-Level Actor Attribution
- [x] Define `FieldAttribution` interface mapping field paths to `Actor`
- [x] Add `fieldAttribution` field to `Submission` interface
- [x] Track actor attribution in `SubmissionManager.setFields()` for each field update
- [x] Track actor attribution in `SubmissionManager.createSubmission()` for initial fields
- [x] Preserve attribution across multiple setFields calls from different actors
**Validation:** `setFields()` iterates `Object.entries(request.fields)` and sets `submission.fieldAttribution[fieldPath] = request.actor` for each field. Confirmed in `submission-manager.ts` lines ~254-257.

### Task 2: Resume URL Generation (MCP)
- [x] Implement `generateHandoffUrl()` method on `SubmissionManager`
- [x] Register `handoffToHuman` MCP tool in `tool-generator.ts`
- [x] Tool accepts `submissionId` and optional `actor` parameters
- [x] Tool returns JSON with `resumeUrl`, `submissionId`, and `resumeToken`
- [x] Emit `handoff.link_issued` event on URL generation
**Validation:** `handoffToHuman` tool registered in `tool-generator.ts` with Zod schema validation. Calls `submissionManager.generateHandoffUrl()`.

### Task 3: Pre-Filled Form Rendering
- [x] Create `ResumeFormPage` component for loading submissions by resume token
- [x] Populate form fields from `submission.fields` on load
- [x] Display form in editable mode for human completion
- [x] Handle loading, error, and expired states
**Validation:** `ResumeFormPage.tsx` component exists in `packages/form-renderer/src/components/`.

### Task 4: Agent Badge UI
- [x] Create `ActorBadge` component with kind-specific styling
- [x] Support `agent`, `human`, and `system` actor kinds
- [x] Add configurable prefix text (default: "Filled by")
- [x] Add `showName` prop for displaying actor name
- [x] Add size variants (`small`, `medium`, `large`)
- [x] Include ARIA accessibility attributes (`aria-label`, `role="status"`)
- [x] Use BEM CSS class naming (`formbridge-actor-badge`, `formbridge-actor-badge--agent`)
**Validation:** `ActorBadge.tsx` implements all props. Uses `data-actor-kind` and `data-actor-id` attributes. ARIA label computed as `${prefix} ${actor.kind}: ${actor.name}`.

### Task 5: FieldWrapper Attribution Integration
- [x] Modify `FieldWrapper` to accept `fieldAttribution` data
- [x] Render `ActorBadge` when attribution exists for the wrapped field
- [x] Visual distinction between agent-filled and human-filled fields
**Validation:** `FieldWrapper.tsx` component exists with attribution-aware rendering.

### Task 6: Handoff Events
- [x] Define `handoff.link_issued` event type in `IntakeEventType`
- [x] Define `handoff.resumed` event type in `IntakeEventType`
- [x] Emit events at appropriate lifecycle points
**Validation:** Both event types defined in `intake-contract.ts` `IntakeEventType` union.

### Task 7: Validation Pipeline Sharing
- [x] Ensure agent submissions and human submissions use the same validation pipeline
- [x] Same `IntakeError` response format for both actors
- [x] Same `NextAction` guidance for both actors
**Validation:** Single `SubmissionManager` handles both actor types with the same validation logic.

### Task 8: Security (Resume URL)
- [x] Resume URLs are token-based (capability credential model from Feature 009)
- [x] Token rotation prevents replay of old handoff URLs
- [x] TTL expiration limits window of access
**Validation:** Inherits security model from Feature 009. Resume token rotation on every state change.

## Test Plan

| Type | Description | Count |
|------|-------------|-------|
| Unit | ActorBadge renders correct CSS classes per actor kind | 3 |
| Unit | ActorBadge accessibility (ARIA label, role) | 1 |
| Unit | FieldAttribution tracks actor per field in setFields | 1 |
| Unit | handoffToHuman MCP tool returns valid resume URL | 1 |
| Integration | Agent fills fields, generates handoff URL, human completes | 1 |
| Integration | Attribution preserved across agent and human setFields calls | 1 |
| Integration | Resume form page loads pre-filled submission | 1 |
| Component | ReviewerView displays attribution badges on agent-filled fields | 1 |
| Component | ResumeFormPage handles expired submission | 1 |

## Documentation Tasks

- [x] Actor model documented in type definitions (JSDoc)
- [x] Handoff flow documented in RESUME_TOKENS_DESIGN.md (cross-actor sections)
- [x] ActorBadge component with usage examples in JSDoc
- [x] MCP handoffToHuman tool description in tool-generator.ts
- [x] Event types documented in intake-contract.ts

## Code Review Checklist

- [x] Type safety verified -- `FieldAttribution` maps `string` to `Actor`; `Actor` interface enforced on all operations
- [x] Patterns consistent -- actor tracking follows the same pattern in `createSubmission()` and `setFields()`
- [x] No regressions -- existing single-actor submission flows work unchanged
- [x] Performance acceptable -- attribution is a simple object property assignment per field

## Deployment & Release

- No separate deployment required; included in standard server deployment
- React components (`ActorBadge`, `FieldWrapper`, `ResumeFormPage`) available in `@formbridge/form-renderer` package
- MCP `handoffToHuman` tool automatically registered when MCP server starts
- No database migrations required (attribution stored within submission record)

## Observability & Monitoring

- `handoff.link_issued` event emitted when resume URL is generated
- `handoff.resumed` event emitted when human resumes a submission
- `field.updated` events include actor attribution for audit trail
- All events include full `Actor` object with `kind`, `id`, and optional `name`

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent and human overwrite each other's fields | Low | Medium | Attribution tracking provides audit trail; last-write-wins is intentional |
| Resume URL shared with unintended recipient | Low | Medium | Token-based access with TTL; no persistent auth required |
| Actor badge clutters UI on forms with many fields | Low | Low | Badge is lightweight; CSS can be customized via BEM classes |
| Attribution data grows large on submissions with many edits | Low | Low | Attribution stores latest actor per field path, not full history |

## Definition of Done

- [x] All acceptance criteria met (9/9)
- [x] Agent fills fields, receives resume URL
- [x] Human sees pre-filled form
- [x] Agent-filled fields visually distinguished (ActorBadge)
- [x] Submission tracks actor per field (FieldAttribution)
- [x] Same validation pipeline for both actors
- [x] Same events and webhooks for both actors
- [x] Resume URL token-based with TTL
- [x] Agent notified when human completes (via event stream)
- [x] Both operate through same Intake Contract flow
- [x] Tests passing
- [x] Code reviewed
- [x] Documentation updated
