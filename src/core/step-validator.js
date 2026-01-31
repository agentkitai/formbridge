import { evaluateConditions } from "./condition-evaluator.js";
export function validateStep(step, fields, fieldSchemas) {
    const errors = [];
    for (const fieldPath of step.fields) {
        const schema = fieldSchemas[fieldPath];
        if (!schema)
            continue;
        const condResult = evaluateConditions(schema.conditions, fields, schema.required ?? false);
        if (!condResult.visible)
            continue;
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
export function isStepVisible(step, fields) {
    if (!step.conditions || step.conditions.length === 0) {
        return true;
    }
    const result = evaluateConditions(step.conditions, fields);
    return result.visible;
}
export function getVisibleSteps(steps, fields) {
    return steps.filter((step) => isStepVisible(step, fields));
}
export function getNextStep(steps, currentStepId, fields) {
    const visibleSteps = getVisibleSteps(steps, fields);
    const currentIndex = visibleSteps.findIndex((s) => s.id === currentStepId);
    if (currentIndex === -1 || currentIndex >= visibleSteps.length - 1) {
        return null;
    }
    return visibleSteps[currentIndex + 1] ?? null;
}
export function getPreviousStep(steps, currentStepId, fields) {
    const visibleSteps = getVisibleSteps(steps, fields);
    const currentIndex = visibleSteps.findIndex((s) => s.id === currentStepId);
    if (currentIndex <= 0) {
        return null;
    }
    return visibleSteps[currentIndex - 1] ?? null;
}
//# sourceMappingURL=step-validator.js.map