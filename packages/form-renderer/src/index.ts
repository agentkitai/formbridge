/**
 * @formbridge/react-form-renderer
 *
 * React component library for rendering forms from FormBridge IntakeSchema IR.
 * Provides automatic form rendering, validation, and submission handling.
 *
 * @example
 * ```tsx
 * import { FormBridgeForm } from '@formbridge/react-form-renderer';
 * import '@formbridge/react-form-renderer/styles'; // Import default styles
 *
 * function App() {
 *   return (
 *     <FormBridgeForm
 *       schema={{
 *         intakeId: 'vendor-onboarding',
 *         title: 'Vendor Onboarding',
 *         type: 'object',
 *         properties: {
 *           companyName: {
 *             type: 'string',
 *             title: 'Company Name'
 *           }
 *         },
 *         required: ['companyName']
 *       }}
 *       endpoint="https://api.formbridge.example.com"
 *       onSuccess={(data, submissionId) => console.log('Success!', submissionId)}
 *     />
 *   );
 * }
 * ```
 */

// Import default styles (extracted to separate CSS file during build)
import './styles/default.css';

// Main form component
export { FormBridgeForm } from './components/FormBridgeForm';

// Field components (for advanced customization)
export { StringField } from './components/fields/StringField';
export { NumberField } from './components/fields/NumberField';
export { BooleanField } from './components/fields/BooleanField';
export { EnumField } from './components/fields/EnumField';
export { ObjectField } from './components/fields/ObjectField';
export { ArrayField } from './components/fields/ArrayField';

// Helper components (for advanced customization)
export { FieldWrapper } from './components/FieldWrapper';
export { ErrorDisplay } from './components/ErrorDisplay';

// Hooks (for advanced usage and custom form implementations)
export { useFormState } from './hooks/useFormState';
export { useValidation } from './hooks/useValidation';
export { useFormSubmission } from './hooks/useFormSubmission';

// API client (for direct API interaction)
export {
  FormBridgeApiClient,
  createApiClient,
  ApiClientError,
  type ApiClientConfig,
  type SetFieldsRequest,
  type SetFieldsResponse,
  type ValidateRequest,
  type ValidateResponse,
  type GetSubmissionResponse,
} from './api/client';

// Utility functions (for advanced usage)
export {
  parseSchema,
  parseObjectFields,
  getFieldValue,
  setFieldValue,
} from './utils/schemaParser';

export {
  validateField,
  validateForm,
  getErrorMap,
  getFieldError,
  hasFieldError,
} from './utils/validation';

// Re-export all types
export type {
  // Schema types
  IntakeSchema,
  JSONSchema,
  JSONSchemaType,
  JSONSchemaProperty,
  FormData,
  FieldPath,
  FieldMetadata,
  UIHints,
  FieldHint,
  StepDefinition,

  // Error types
  IntakeError,
  IntakeErrorType,
  FieldErrorCode,
  FieldError,
  FormErrors,
  SubmissionError,
  ValidationResult,
  SubmissionState,

  // Component prop types
  FormBridgeFormProps,
  BaseFieldProps,
  FieldWrapperProps,
  StringFieldProps,
  NumberFieldProps,
  BooleanFieldProps,
  EnumFieldProps,
  ObjectFieldProps,
  ArrayFieldProps,

  // Actor and submission types
  Actor,
  FormSubmissionState,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  SubmitRequest,
  SubmitResponse,

  // Hook return types
  UseFormStateReturn,
  UseValidationReturn,
  UseFormSubmissionReturn,

  // Validation options
  ValidationOptions,
} from './types';
