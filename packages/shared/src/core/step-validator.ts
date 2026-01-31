/**
 * Step Validator — validates individual wizard steps.
 *
 * Validates only the fields belonging to a specific step,
 * using the condition evaluator for conditional visibility.
 */

import { evaluateConditions, type Condition } from "./condition-evaluator.js";

// =============================================================================
// § Types
// =============================================================================

export interface StepDefinition {
  id: string;
  title: string;
  description?: string;
  fields: string[];
  conditions?: Condition[];
}

export interface StepFieldSchema {
  required?: boolean;
  type?: string;
  conditions?: Condition[];
}

export interface StepValidationResult {
  valid: boolean;
  stepId: string;
  errors: StepFieldError[];
}

export interface StepFieldError {
  field: string;
  message: string;
  type: "missing" | "invalid";
}

// =============================================================================
// § Step Validation
// =============================================================================

/**
 * Validate a single step's fields.
 *
 * @param step - The step definition
 * @param fields - All form field values
 * @param fieldSchemas - Schema info for each field (required, type, conditions)
 */
export function validateStep(
  step: StepDefinition,
  fields: Record<string, unknown>,
  fieldSchemas: Record<string, StepFieldSchema>
): StepValidationResult {
  const errors: StepFieldError[] = [];

  for (const fieldPath of step.fields) {
    const schema = fieldSchemas[fieldPath];
    if (!schema) continue;

    // Evaluate conditions for this field
    const condResult = evaluateConditions(
      schema.conditions,
      fields,
      schema.required ?? false
    );

    // Skip hidden fields
    if (!condResult.visible) continue;

    // Check required
    if (condResult.required) {
      const value = fields[fieldPath];
      if (value === undefined || value === null || value === "") {
        errors.push({
          field: fieldPath,
          message: `Field '${fieldPath}' is required`,
          type: "missing",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    stepId: step.id,
    errors,
  };
}

/**
 * Check if a step should be visible based on its conditions.
 */
export function isStepVisible(
  step: StepDefinition,
  fields: Record<string, unknown>
): boolean {
  if (!step.conditions || step.conditions.length === 0) {
    return true;
  }

  const result = evaluateConditions(step.conditions, fields);
  return result.visible;
}

/**
 * Get the ordered list of visible steps.
 */
export function getVisibleSteps(
  steps: StepDefinition[],
  fields: Record<string, unknown>
): StepDefinition[] {
  return steps.filter((step) => isStepVisible(step, fields));
}

/**
 * Get the next step after the current one.
 */
export function getNextStep(
  steps: StepDefinition[],
  currentStepId: string,
  fields: Record<string, unknown>
): StepDefinition | null {
  const visibleSteps = getVisibleSteps(steps, fields);
  const currentIndex = visibleSteps.findIndex((s) => s.id === currentStepId);
  if (currentIndex === -1 || currentIndex >= visibleSteps.length - 1) {
    return null;
  }
  return visibleSteps[currentIndex + 1] ?? null;
}

/**
 * Get the previous step before the current one.
 */
export function getPreviousStep(
  steps: StepDefinition[],
  currentStepId: string,
  fields: Record<string, unknown>
): StepDefinition | null {
  const visibleSteps = getVisibleSteps(steps, fields);
  const currentIndex = visibleSteps.findIndex((s) => s.id === currentStepId);
  if (currentIndex <= 0) {
    return null;
  }
  return visibleSteps[currentIndex - 1] ?? null;
}
