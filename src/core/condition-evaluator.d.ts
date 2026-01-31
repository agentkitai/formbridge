export type ConditionOperator = "eq" | "neq" | "in" | "notIn" | "gt" | "gte" | "lt" | "lte" | "exists" | "notExists" | "matches";
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
export declare function getFieldValue(fields: Record<string, unknown>, path: string): unknown;
export declare function isCompositeCondition(condition: Condition): condition is CompositeCondition;
export declare function evaluateFieldCondition(condition: FieldCondition, fields: Record<string, unknown>): boolean;
export declare function evaluateCompositeCondition(condition: CompositeCondition, fields: Record<string, unknown>): boolean;
export declare function evaluateCondition(condition: Condition, fields: Record<string, unknown>): boolean;
export declare function evaluateConditions(conditions: Condition[] | undefined, fields: Record<string, unknown>, schemaRequired?: boolean): ConditionResult;
export declare function detectCircularConditions(fieldConditions: Record<string, Condition[]>): string[][];
//# sourceMappingURL=condition-evaluator.d.ts.map