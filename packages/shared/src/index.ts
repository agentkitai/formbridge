/**
 * @formbridge/shared — Isomorphic utilities shared between server and client packages.
 *
 * Zero-dependency modules for condition evaluation, step validation,
 * and nested value accessors. Safe to use in both Node.js and browser environments.
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
} from './core/condition-evaluator.js';

export {
  type StepDefinition,
  type StepFieldSchema,
  type StepValidationResult,
  type StepFieldError,
  validateStep,
  isStepVisible,
  getVisibleSteps,
  getNextStep,
  getPreviousStep,
} from './core/step-validator.js';
