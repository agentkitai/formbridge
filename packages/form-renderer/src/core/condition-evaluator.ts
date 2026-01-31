/**
 * Condition Evaluator — re-exports from @formbridge/shared.
 *
 * The canonical implementation lives in packages/shared/src/core/condition-evaluator.ts.
 * This file re-exports everything for backward compatibility.
 */

export {
  type ConditionOperator,
  type ConditionEffect,
  type FieldCondition,
  type CompositeCondition,
  type Condition,
  type ConditionResult,
  getFieldValue,
  isCompositeCondition,
  evaluateFieldCondition,
  evaluateCompositeCondition,
  evaluateCondition,
  evaluateConditions,
  detectCircularConditions,
} from '@formbridge/shared';
