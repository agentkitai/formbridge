/**
 * Condition Evaluator — Pure isomorphic function for evaluating field conditions.
 *
 * Zero dependencies. Runs in Node.js and browser environments.
 * Used by:
 * - Server-side validator (before validation, hide non-visible fields)
 * - React form renderer (useConditions hook)
 * - MCP tool generator (conditional hints)
 */

// =============================================================================
// § Types (inlined for zero-dep isomorphic usage)
// =============================================================================

export type ConditionOperator =
  | "eq"
  | "neq"
  | "in"
  | "notIn"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "notExists"
  | "matches";

export type ConditionEffect = "visible" | "required" | "validation";

export interface FieldCondition {
  when: string;
  operator: ConditionOperator;
  value?: unknown;
  effect: ConditionEffect;
}

export interface CompositeCondition {
  logic: "and" | "or";
  conditions: Array<FieldCondition | CompositeCondition>;
  effect: ConditionEffect;
}

export type Condition = FieldCondition | CompositeCondition;

export interface ConditionResult {
  visible: boolean;
  required: boolean;
  validationEnabled: boolean;
}

// =============================================================================
// § Helpers
// =============================================================================

/**
 * Get a nested value from an object using a dot-separated path.
 */
export function getFieldValue(
  fields: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split(".");
  let current: unknown = fields;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Check if a condition is a composite condition.
 */
export function isCompositeCondition(
  condition: Condition
): condition is CompositeCondition {
  return "logic" in condition && "conditions" in condition;
}

// =============================================================================
// § Single Condition Evaluation
// =============================================================================

/**
 * Evaluate a single field condition against current form values.
 */
export function evaluateFieldCondition(
  condition: FieldCondition,
  fields: Record<string, unknown>
): boolean {
  const fieldValue = getFieldValue(fields, condition.when);

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;

    case "neq":
      return fieldValue !== condition.value;

    case "in":
      if (!Array.isArray(condition.value)) return false;
      return (condition.value as unknown[]).includes(fieldValue);

    case "notIn":
      if (!Array.isArray(condition.value)) return true;
      return !(condition.value as unknown[]).includes(fieldValue);

    case "gt":
      return typeof fieldValue === "number" && typeof condition.value === "number"
        ? fieldValue > condition.value
        : false;

    case "gte":
      return typeof fieldValue === "number" && typeof condition.value === "number"
        ? fieldValue >= condition.value
        : false;

    case "lt":
      return typeof fieldValue === "number" && typeof condition.value === "number"
        ? fieldValue < condition.value
        : false;

    case "lte":
      return typeof fieldValue === "number" && typeof condition.value === "number"
        ? fieldValue <= condition.value
        : false;

    case "exists":
      return fieldValue !== undefined && fieldValue !== null;

    case "notExists":
      return fieldValue === undefined || fieldValue === null;

    case "matches":
      if (typeof fieldValue !== "string" || typeof condition.value !== "string")
        return false;
      try {
        return new RegExp(condition.value).test(fieldValue);
      } catch {
        return false;
      }

    default:
      return false;
  }
}

// =============================================================================
// § Composite Condition Evaluation
// =============================================================================

/**
 * Evaluate a composite condition (AND/OR) against current form values.
 */
export function evaluateCompositeCondition(
  condition: CompositeCondition,
  fields: Record<string, unknown>
): boolean {
  const results = condition.conditions.map((c) =>
    evaluateCondition(c, fields)
  );

  if (condition.logic === "and") {
    return results.every(Boolean);
  }
  return results.some(Boolean);
}

/**
 * Evaluate any condition (field or composite).
 */
export function evaluateCondition(
  condition: Condition,
  fields: Record<string, unknown>
): boolean {
  if (isCompositeCondition(condition)) {
    return evaluateCompositeCondition(condition, fields);
  }
  return evaluateFieldCondition(condition, fields);
}

// =============================================================================
// § Field Condition Evaluation
// =============================================================================

/**
 * Evaluate all conditions for a field and determine its effective state.
 *
 * Default (no conditions): visible=true, required=from schema, validationEnabled=true
 *
 * With conditions:
 * - visible: ALL 'visible' conditions must pass for field to be visible
 * - required: ANY 'required' condition passing makes field required
 * - validationEnabled: ALL 'validation' conditions must pass
 */
export function evaluateConditions(
  conditions: Condition[] | undefined,
  fields: Record<string, unknown>,
  schemaRequired: boolean = false
): ConditionResult {
  const result: ConditionResult = {
    visible: true,
    required: schemaRequired,
    validationEnabled: true,
  };

  if (!conditions || conditions.length === 0) {
    return result;
  }

  const visibilityConditions = conditions.filter(
    (c) => c.effect === "visible"
  );
  const requiredConditions = conditions.filter(
    (c) => c.effect === "required"
  );
  const validationConditions = conditions.filter(
    (c) => c.effect === "validation"
  );

  // Visibility: ALL visible conditions must pass
  if (visibilityConditions.length > 0) {
    result.visible = visibilityConditions.every((c) =>
      evaluateCondition(c, fields)
    );
  }

  // If not visible, field is not required and validation is disabled
  if (!result.visible) {
    result.required = false;
    result.validationEnabled = false;
    return result;
  }

  // Required: if any required condition passes, field is required
  if (requiredConditions.length > 0) {
    result.required = requiredConditions.some((c) =>
      evaluateCondition(c, fields)
    );
  }

  // Validation: ALL validation conditions must pass
  if (validationConditions.length > 0) {
    result.validationEnabled = validationConditions.every((c) =>
      evaluateCondition(c, fields)
    );
  }

  return result;
}

// =============================================================================
// § Circular Dependency Detection
// =============================================================================

/**
 * Detect circular dependencies in condition references.
 * Returns array of field paths involved in cycles, or empty array if none.
 */
export function detectCircularConditions(
  fieldConditions: Record<string, Condition[]>
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const path: string[] = [];

  function extractDependencies(conditions: Condition[]): string[] {
    const deps: string[] = [];
    for (const condition of conditions) {
      if (isCompositeCondition(condition)) {
        deps.push(...extractDependencies(condition.conditions));
      } else {
        deps.push(condition.when);
      }
    }
    return deps;
  }

  function dfs(field: string): void {
    if (path.includes(field)) {
      const cycleStart = path.indexOf(field);
      cycles.push([...path.slice(cycleStart), field]);
      return;
    }
    if (visited.has(field)) return;

    path.push(field);
    const conditions = fieldConditions[field];
    if (conditions) {
      const deps = extractDependencies(conditions);
      for (const dep of deps) {
        dfs(dep);
      }
    }
    path.pop();
    visited.add(field);
  }

  for (const field of Object.keys(fieldConditions)) {
    visited.clear();
    dfs(field);
  }

  return cycles;
}
