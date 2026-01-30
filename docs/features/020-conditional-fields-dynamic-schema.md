# Feature 020 — Conditional Fields & Dynamic Schema

> **Status:** PLANNED | **Phase:** 5 | **Priority:** Could | **Complexity:** Medium | **Impact:** Medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Add declarative conditional field logic to FormBridge schemas. Conditions control field visibility (show/hide), requirement (required/optional), and validation rules based on other field values. Conditions are declared in the IntakeSchema IR and evaluated both client-side (React form renderer for instant feedback) and server-side (validator for authoritative enforcement). The MCP tool generator will include conditional hints in tool descriptions so agents understand field dependencies without being blocked by hidden-field validation errors. This feature addresses the reality that most real-world intake forms have dependencies between fields (e.g., "if country is US, require state and zip code"; "if request type is emergency, require justification").

## Dependencies

**Upstream:**
- Feature 2 (Schema Normalization) — conditions extend the IntakeSchema IR types in `packages/schema-normalizer/src/types/intake-schema.ts`
- Feature 3 (Form Renderer) — conditions must be evaluated in the React form at `packages/form-renderer/`
- Feature 5 (MCP Tool Generation) — MCP tool descriptions must reflect conditional field behavior from `src/mcp/tool-generator.ts`

**Downstream:** None

**Internal task ordering:** Condition type in IR (Task 1) and condition evaluator engine (Task 2) come first. Client-side hook (Task 3) and server-side integration (Task 4) depend on the evaluator. MCP generation (Task 5), nested conditions (Task 6), and circular dependency detection (Task 7) can follow in any order. Parser support (Task 8) is the last implementation task.

## Architecture & Design

### Condition Type in IntakeSchema IR

Extend `BaseField` in `packages/schema-normalizer/src/types/intake-schema.ts`:

```typescript
interface FieldCondition {
  /** Field path to evaluate (dot notation for nested, e.g. "address.country") */
  when: string;
  /** Operator for comparison */
  operator: 'eq' | 'neq' | 'in' | 'notIn' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'notExists' | 'matches';
  /** Value to compare against (not used for exists/notExists) */
  value?: unknown;
  /** What this condition controls */
  effect: 'visible' | 'required' | 'validation';
  /** For validation effect: override validation rule when condition is true */
  validationOverride?: Partial<StringConstraints | NumberConstraints | ArrayConstraints>;
}

interface CompositeCondition {
  /** Logical combination */
  logic: 'and' | 'or';
  /** Nested conditions */
  conditions: Array<FieldCondition | CompositeCondition>;
  /** What this condition controls */
  effect: 'visible' | 'required' | 'validation';
  validationOverride?: Partial<StringConstraints | NumberConstraints | ArrayConstraints>;
}

// Extend BaseField
interface BaseField {
  // ... existing fields ...
  conditions?: Array<FieldCondition | CompositeCondition>;
}
```

### Condition Evaluator Engine

A pure function evaluator in `src/core/condition-evaluator.ts` with no side effects:

```typescript
interface EvaluationContext {
  fields: Record<string, unknown>;  // current form values
}

interface EvaluationResult {
  visible: boolean;
  required: boolean;
  validationOverrides: Partial<StringConstraints | NumberConstraints | ArrayConstraints> | null;
}

function evaluateConditions(
  conditions: Array<FieldCondition | CompositeCondition>,
  context: EvaluationContext,
  baseRequired: boolean
): EvaluationResult;
```

The evaluator is isomorphic: it runs identically in Node.js (server) and the browser (React). It has no dependencies beyond the condition types.

### Client-Side React Hook

```typescript
// packages/form-renderer/src/hooks/useConditions.ts
function useConditions(
  fieldPath: string,
  conditions: Array<FieldCondition | CompositeCondition>,
  formValues: Record<string, unknown>,
  baseRequired: boolean
): EvaluationResult;
```

The hook calls the shared evaluator on every form value change. Hidden fields are removed from the DOM and excluded from submission data. Conditionally-required fields show/hide the required indicator dynamically.

### Server-Side Validator Integration

The validator in `src/core/validator.ts` calls the evaluator before validating each field. Hidden fields are skipped entirely (no validation errors for invisible fields). Conditionally-required fields are validated as required only when their condition is met. Validation overrides replace the base constraints when active.

### MCP Tool Description Generation

The tool generator in `src/mcp/tool-generator.ts` includes conditional hints in field descriptions:

```
"justification": {
  "type": "string",
  "description": "Reason for access request. Required when requestType is 'emergency'."
}
```

Agents cannot evaluate conditions dynamically, so the hints are textual. The tool schema includes all fields (not just currently-visible ones) with condition descriptions.

## Implementation Tasks

### Task 1: Condition Type in IntakeSchema IR
- [ ] Define `FieldCondition` interface with `when`, `operator`, `value`, `effect`, `validationOverride`
- [ ] Define `CompositeCondition` interface with `logic` (and/or), nested `conditions`, `effect`
- [ ] Add optional `conditions` array to `BaseField` in `packages/schema-normalizer/src/types/intake-schema.ts`
- [ ] Export new types from the schema-normalizer barrel
- [ ] Update IntakeSchema version to indicate condition support

**Dependencies:** None
**Effort:** S
**Validation:** Types compile; existing schemas remain valid (conditions are optional)

### Task 2: Condition Evaluator Engine
- [ ] Create `src/core/condition-evaluator.ts` with `evaluateConditions()` pure function
- [ ] Implement all operators: `eq`, `neq`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `exists`, `notExists`, `matches` (regex)
- [ ] Implement composite conditions with `and`/`or` logic
- [ ] Handle nested field path resolution (dot notation: `address.country`)
- [ ] Return `EvaluationResult` with `visible`, `required`, and `validationOverrides`
- [ ] Merge multiple conditions: visibility conditions combine with AND (all must be true to show); requirement conditions combine with OR (any can make required)
- [ ] Handle missing field values gracefully (treat as undefined)
- [ ] Ensure the evaluator is side-effect-free and importable in both Node.js and browser

**Dependencies:** Task 1
**Effort:** M
**Validation:** Unit tests cover all operators, composite logic, nested paths, and edge cases (missing values, type mismatches)

### Task 3: Client-Side React Hook
- [ ] Create `packages/form-renderer/src/hooks/useConditions.ts` with `useConditions()` hook
- [ ] Call shared evaluator with current form values on every change
- [ ] Memoize evaluation results to avoid unnecessary re-renders
- [ ] Integrate into `FormBridgeForm.tsx`: conditionally render fields based on `visible`
- [ ] Update required indicators based on conditional `required` state
- [ ] Strip hidden field values from submission data before sending
- [ ] Preserve hidden field values in local state (so they reappear if condition toggles back)

**Dependencies:** Task 2
**Effort:** M
**Validation:** Fields show/hide in real-time as dependent values change; required indicators toggle; hidden fields excluded from submission

### Task 4: Server-Side Validator Integration
- [ ] Modify `src/core/validator.ts` to accept conditions alongside schema for validation
- [ ] Before validating each field, evaluate its conditions against submitted data
- [ ] Skip validation for fields where `visible` evaluates to `false`
- [ ] Apply `required` override when condition evaluates to `true`
- [ ] Apply `validationOverride` constraints when condition is active
- [ ] Return structured validation errors that include condition context (why a field became required)

**Dependencies:** Task 2
**Effort:** M
**Validation:** Server rejects data missing conditionally-required fields; server accepts data missing hidden fields; validation overrides apply correctly

### Task 5: MCP Tool Description Generation
- [ ] Modify `src/mcp/tool-generator.ts` to scan field conditions
- [ ] Generate human-readable condition descriptions in field description text
- [ ] Format conditions as: "Required when {field} is {value}" or "Only applicable when {field} {operator} {value}"
- [ ] Include all fields in tool schema (not just currently-visible ones) since agents need the full picture
- [ ] Add `x-conditions` extension to JSON Schema output for programmatic consumption

**Dependencies:** Task 2
**Effort:** S
**Validation:** Generated tool descriptions accurately reflect conditions; agents can read conditional hints

### Task 6: Nested Condition Support
- [ ] Extend evaluator to handle conditions referencing fields inside nested objects and arrays
- [ ] Support array item conditions (e.g., "show field when items[0].type is 'other'")
- [ ] Support conditions across nesting levels (child field conditioned on parent field value)
- [ ] Handle array length conditions (e.g., "show summary when items.length > 3")

**Dependencies:** Task 2
**Effort:** M
**Validation:** Conditions work across nested objects and arrays; array length conditions evaluate correctly

### Task 7: Circular Dependency Detection
- [ ] Build dependency graph from all field conditions at schema load time
- [ ] Detect cycles using topological sort (Kahn's algorithm or DFS with coloring)
- [ ] Throw a descriptive error at schema registration time if cycles are detected
- [ ] Include cycle path in error message (e.g., "Circular dependency: fieldA -> fieldB -> fieldC -> fieldA")
- [ ] Add `validateConditions()` function callable independently for schema authoring tools

**Dependencies:** Task 1
**Effort:** S
**Validation:** Circular dependencies detected and reported with clear messages; valid schemas pass detection

### Task 8: Parser Support (Zod / JSON Schema)
- [ ] Extend Zod parser in `packages/schema-normalizer/src/parsers/zod-parser.ts` to read condition metadata from `.describe()` or custom Zod extensions
- [ ] Extend JSON Schema parser to read conditions from `x-conditions` or `if/then/else` keywords
- [ ] Extend JSON Schema serializer to output `x-conditions` extension
- [ ] Document the convention for expressing conditions in each source format

**Dependencies:** Tasks 1, 2
**Effort:** M
**Validation:** Conditions survive round-trip through Zod -> IR -> JSON Schema -> IR; JSON Schema `if/then/else` maps to FormBridge conditions

### Task 9: Comprehensive Testing
- [ ] Write evaluator unit tests for every operator with various data types
- [ ] Write composite condition tests (AND, OR, nested AND/OR)
- [ ] Write React integration tests for show/hide behavior
- [ ] Write React integration tests for conditional required behavior
- [ ] Write server validator tests for conditional validation
- [ ] Write MCP description generation tests
- [ ] Write circular dependency detection tests
- [ ] Write end-to-end test: form with conditions renders, validates client-side, submits, validates server-side

**Dependencies:** Tasks 1-8
**Effort:** L
**Validation:** All tests pass; condition behavior is identical client-side and server-side

## Test Plan

| Type | Description | Target Count |
|------|-------------|--------------|
| Unit | Evaluator operators (all 11 operators x multiple data types) | 35 |
| Unit | Composite condition logic (AND, OR, nested) | 12 |
| Unit | Nested path resolution | 8 |
| Unit | Circular dependency detection | 6 |
| Unit | MCP description generation | 8 |
| Integration | React hook show/hide behavior | 10 |
| Integration | React hook conditional required | 8 |
| Integration | Server validator with conditions | 12 |
| Integration | Parser round-trip with conditions | 6 |
| E2E | Full form with conditional fields | 3 |

## Documentation Tasks

- [ ] Document condition types and operators in IntakeSchema specification
- [ ] Add condition examples to each example template (Feature 018) where appropriate
- [ ] Document the JSON Schema `x-conditions` extension format
- [ ] Write guide for common condition patterns (show/hide, conditional required, dependent dropdowns)
- [ ] Document how MCP agents should interpret conditional hints

## Code Review Checklist

- [ ] Type safety: condition types are fully discriminated; no `any` in evaluator
- [ ] Patterns consistent: evaluator is a pure function importable in all environments
- [ ] No regressions: existing schemas without conditions work identically
- [ ] Performance acceptable: condition evaluation adds < 1ms per field on form value change
- [ ] Client-server parity: same condition evaluates identically in React and Node.js

## Deployment & Release

- **Breaking changes:** None; conditions are additive and optional on `BaseField`
- **New exports:** `FieldCondition`, `CompositeCondition`, `evaluateConditions`, `useConditions`, `validateConditions`
- **Bundle impact:** Condition evaluator adds ~2KB minified; tree-shakeable if unused
- **Feature detection:** Schemas without conditions are processed exactly as before

## Observability & Monitoring

- Log condition evaluation results at debug level for troubleshooting
- Include condition context in validation error responses (which condition made a field required)
- Track circular dependency detection errors as schema registration errors
- Monitor client-side condition evaluation latency (React DevTools profiling guidance)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Client-server condition evaluation divergence | Medium | High | Shared isomorphic evaluator; E2E tests verify parity |
| Performance impact on large forms with many conditions | Low | Medium | Memoize evaluation results; benchmark with 50+ field forms |
| Condition syntax too complex for schema authors | Medium | Medium | Provide common pattern examples; add validation tooling |
| JSON Schema `if/then/else` mapping is lossy | Medium | Low | Document limitations; use `x-conditions` as canonical format |
| Agents misinterpret conditional hints in tool descriptions | Medium | Medium | Use clear, templated language; test with multiple LLM models |

## Definition of Done

- [ ] Conditional visibility works (show field X when field Y = Z)
- [ ] Conditional required works (require field X when field Y is present)
- [ ] Conditional validation works (validate field X with pattern P when field Y = Z)
- [ ] Conditions are declarative in IntakeSchema IR
- [ ] Client-side evaluation in React form renderer with instant feedback
- [ ] Server-side evaluation in validator for authoritative enforcement
- [ ] MCP tool descriptions include conditional hints
- [ ] Nested conditions supported (AND/OR composition)
- [ ] Circular dependency detection with clear error messages
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No regressions
