/**
 * Step Validator — re-exports from @agentkitai/formbridge-shared.
 *
 * The canonical implementation lives in packages/shared/src/core/step-validator.ts.
 * This file re-exports everything for backward compatibility.
 */

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
} from '@agentkitai/formbridge-shared';
