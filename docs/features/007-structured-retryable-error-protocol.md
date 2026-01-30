# Feature 007 — Structured Retryable Error Protocol

> **Status:** IMPLEMENTED | **Phase:** 2 | **Priority:** must | **Complexity:** medium | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as part of the FormBridge build. This was a documentation-focused task that expanded the existing error protocol defined in `INTAKE_CONTRACT_SPEC.md` Section 3. The protocol ensures every error returned by FormBridge includes sufficient structured information for LLM agents to deterministically converge to a valid submission through retry loops. Clean QA pass with 10/10 subtasks completed.

**Key files:**
- `docs/INTAKE_CONTRACT_SPEC.md` (Section 3) — canonical error protocol definition (IntakeError, FieldError, NextAction)
- `docs/` — error type documentation, FieldError code examples, NextAction examples, error summary format, agent retry loop pseudocode

**Known issues:** None. Clean QA pass.

## Summary

The Structured Retryable Error Protocol defines a purpose-built error format for LLM retry loops. Every error response from FormBridge — whether from the HTTP API or MCP tools — includes a structured payload with error category, field path, human-readable message, stable error code, and an actionable hint. Error categories (`missing`, `invalid`, `conflict`, `needs_approval`) map to distinct recovery strategies. The `NextAction` object tells agents exactly what to do next. This protocol enables LLM agents to parse errors deterministically and converge to valid submissions without human intervention.

## Dependencies

**Upstream:**
- Feature 003 (Intake Contract Spec) — defines the base contract that the error protocol extends
- Feature 006 (MCP Tool Server) — MCP tools return errors following this protocol

**Downstream:**
- Feature 015 (End-to-End Testing) — tests verify error protocol compliance across interfaces

## Architecture & Design

The error protocol is built on three core structures defined in `INTAKE_CONTRACT_SPEC.md` Section 3:

### IntakeError
Top-level error envelope returned by all FormBridge interfaces:
```
{
  "status": "error",
  "error_code": "VALIDATION_FAILED",
  "message": "Submission has 3 validation errors",
  "errors": [ ...FieldError[] ],
  "next_action": { ...NextAction },
  "summary": "Fix: company_name (required), tax_id (invalid format), contact.email (invalid)"
}
```

### FieldError
Per-field error detail with stable code and actionable hint:
```
{
  "field_path": "contact.email",
  "category": "invalid",
  "code": "FORMAT_MISMATCH",
  "message": "Email address is not valid",
  "hint": "Provide a valid email address (e.g., user@example.com)",
  "constraint": { "pattern": "^[^@]+@[^@]+\\.[^@]+$" }
}
```

### NextAction
Deterministic guidance for the agent's next step:
```
{
  "action": "fix_and_resubmit",
  "fields_to_fix": ["company_name", "tax_id", "contact.email"],
  "can_retry": true,
  "idempotency_key_valid": true
}
```

### Error Categories

| Category | Meaning | Recovery Strategy |
|----------|---------|-------------------|
| `missing` | Required field not provided | Agent supplies the missing value |
| `invalid` | Value does not meet constraints | Agent corrects the value per hint/constraint |
| `conflict` | Value conflicts with another field or state | Agent resolves the conflict (may need to change multiple fields) |
| `needs_approval` | Value requires human approval before proceeding | Agent surfaces to user for approval gate |

### Error Codes
Error codes are stable strings (not numeric) designed for programmatic matching:
- `REQUIRED_FIELD` — field is required but missing
- `FORMAT_MISMATCH` — value does not match expected pattern
- `OUT_OF_RANGE` — numeric value outside min/max bounds
- `INVALID_OPTION` — enum value not in allowed set
- `TYPE_MISMATCH` — value type does not match schema
- `ARRAY_LENGTH` — array has too few or too many items
- `DUPLICATE_VALUE` — value conflicts with existing submission
- `APPROVAL_REQUIRED` — field value requires human approval

### Error Summary
A single-line summary string for quick LLM parsing:
```
"Fix: company_name (required), tax_id (invalid format), contact.email (invalid)"
```

### Agent Retry Loop
The protocol documentation includes pseudocode for an optimal agent retry loop:
1. Call `submit`
2. If success, done
3. If error, parse `next_action`
4. If `can_retry` is true, fix listed fields using hints
5. Re-call `submit` with same idempotency key
6. Repeat until success or max retries exceeded

## Implementation Tasks

### Task 1: Error Type Definitions
- [x] Define `IntakeError` top-level error envelope structure
- [x] Define `FieldError` per-field error structure with all required fields
- [x] Define `NextAction` guidance structure
- [x] Document all error categories with semantic meaning

**Validation:** Error structures are fully defined in spec with all required and optional fields documented.

### Task 2: FieldError Code Documentation
- [x] Define stable string error codes for all constraint types
- [x] Document each error code with description and example
- [x] Ensure codes are unique and programmatically matchable
- [x] Map error codes to IntakeSchema constraint types

**Validation:** Every IntakeSchema constraint type has a corresponding error code. Codes are unambiguous.

### Task 3: NextAction Guidance Documentation
- [x] Define `action` enum values (`fix_and_resubmit`, `contact_support`, `wait_for_approval`)
- [x] Document `fields_to_fix` array semantics
- [x] Document `can_retry` and `idempotency_key_valid` flags
- [x] Provide examples for each action type

**Validation:** NextAction examples cover all error categories. Agent can determine next step from NextAction alone.

### Task 4: Error Summary Format
- [x] Define single-line summary format specification
- [x] Document field list formatting with error category in parentheses
- [x] Ensure summary is parseable by LLMs and readable by humans

**Validation:** Summary strings are concise, consistent, and include all errored fields.

### Task 5: Agent Retry Loop Documentation
- [x] Write pseudocode for optimal retry loop
- [x] Document convergence guarantees (finite steps for valid input)
- [x] Document max retry recommendations
- [x] Include examples of multi-step convergence

**Validation:** Pseudocode is implementable by agent framework developers. Convergence logic is sound.

### Task 6: Cross-Interface Consistency Verification
- [x] Verify HTTP API returns errors in protocol format
- [x] Verify MCP tools return errors in protocol format
- [x] Document any interface-specific error wrapping (e.g., MCP content blocks)
- [x] Ensure error codes and categories are identical across interfaces

**Validation:** Same logical error produces structurally equivalent responses across HTTP and MCP interfaces.

### Task 7: Error Protocol Examples
- [x] Create complete examples for each error category
- [x] Create multi-error example showing summary, errors array, and next_action together
- [x] Create MCP-specific error response examples
- [x] Create HTTP API-specific error response examples

**Validation:** Examples are complete, syntactically valid JSON, and cover all documented structures.

## Test Plan

| Type | Description | Count |
|------|-------------|-------|
| Specification | Error structure completeness and consistency review | ~5 |
| Example | All examples are valid JSON and match schema definitions | ~10 |
| Cross-interface | HTTP and MCP error responses follow protocol | ~6 |
| Documentation | All error codes, categories, and actions are documented | ~4 |

## Documentation Tasks

- [x] IntakeError structure reference
- [x] FieldError code reference table
- [x] NextAction guidance reference
- [x] Error summary format specification
- [x] Agent retry loop pseudocode and guide
- [x] Cross-interface error response examples

## Code Review Checklist

- [x] Type safety verified — all error structures have TypeScript definitions
- [x] Patterns consistent — error format identical across HTTP and MCP interfaces
- [x] No regressions — existing error handling unaffected
- [x] Performance acceptable — N/A (documentation task)

## Deployment & Release

- Documentation-only feature; no runtime deployment required
- Error protocol spec published as part of `docs/INTAKE_CONTRACT_SPEC.md`
- Agent framework developers reference the spec for error handling integration
- Error codes are part of the public API contract and must remain stable across versions

## Observability & Monitoring

- Error category distribution tracking (which categories occur most)
- Retry convergence rate (percentage of submissions that succeed after retry)
- Average retries to convergence per error category
- Fields with highest error frequency (indicates UX or schema issues)
- Agents failing to converge after max retries (indicates protocol gaps)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Error codes change between versions breaking agent parsers | Low | High | Semantic versioning, code stability guarantee in spec |
| Hints insufficient for LLM to fix errors | Medium | Medium | Iterative testing with multiple LLM models, user feedback |
| Summary format too terse for complex multi-error cases | Low | Low | Summary is supplementary; full errors array has complete detail |
| New constraint types added without error codes | Low | Medium | Checklist: new constraint = new error code requirement |

## Definition of Done

- [x] All acceptance criteria met (10/10)
- [x] Tests passing (specification review complete)
- [x] Code reviewed
- [x] Documentation updated
