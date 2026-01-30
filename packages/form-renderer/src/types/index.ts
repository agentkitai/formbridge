/**
 * Main types and interfaces for @formbridge/react-form-renderer
 */

import { ReactNode } from 'react';
import { IntakeSchema, FormData, FieldPath, FieldMetadata, UIHints } from './schema';
import { FormErrors, SubmissionError, ValidationResult } from './error';

// Re-export types from schema and error modules
export * from './schema';
export * from './error';

/**
 * Actor identity for submission operations
 */
export interface Actor {
  /** Actor type */
  kind: 'agent' | 'human' | 'system';
  /** Unique identifier */
  id: string;
  /** Display name */
  name?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Form submission state
 */
export type FormSubmissionState = 'idle' | 'validating' | 'submitting' | 'success' | 'error';

/**
 * Props for the main FormBridgeForm component
 */
export interface FormBridgeFormProps {
  /** IntakeSchema IR or URL to fetch schema from */
  schema: IntakeSchema | string;
  /** Submission endpoint URL */
  endpoint: string;
  /** Initial form data */
  initialData?: FormData;
  /** Actor identity */
  actor?: Actor;
  /** Callback fired when form is successfully submitted */
  onSuccess?: (data: FormData, submissionId: string) => void;
  /** Callback fired when submission fails */
  onError?: (error: SubmissionError) => void;
  /** Callback fired when form data changes */
  onChange?: (data: FormData) => void;
  /** Callback fired when validation state changes */
  onValidate?: (result: ValidationResult) => void;
  /** UI hints for customizing field rendering */
  uiHints?: UIHints;
  /** Custom CSS class for the form container */
  className?: string;
  /** Whether to validate on blur (default: true) */
  validateOnBlur?: boolean;
  /** Whether to validate on change (default: false) */
  validateOnChange?: boolean;
  /** Submit button text (default: "Submit") */
  submitText?: string;
  /** Whether to show required field indicators (default: true) */
  showRequiredIndicator?: boolean;
  /** Whether to disable the form */
  disabled?: boolean;
  /** Custom loading component */
  loadingComponent?: ReactNode;
  /** Custom error component */
  errorComponent?: (error: SubmissionError) => ReactNode;
  /** Custom success component */
  successComponent?: (submissionId: string) => ReactNode;
}

/**
 * Base props for all field components
 */
export interface BaseFieldProps {
  /** Field path (dot notation) */
  path: FieldPath;
  /** Field metadata from schema */
  metadata: FieldMetadata;
  /** Current field value */
  value: unknown;
  /** Change handler */
  onChange: (value: unknown) => void;
  /** Blur handler */
  onBlur?: () => void;
  /** Error message (if any) */
  error?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * Props for the FieldWrapper component
 */
export interface FieldWrapperProps {
  /** Field path */
  path: FieldPath;
  /** Field label */
  label: string;
  /** Field description */
  description?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Error message */
  error?: string;
  /** Custom CSS class */
  className?: string;
  /** Field input element */
  children: ReactNode;
}

/**
 * Props for field-specific components
 */

export interface StringFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export interface NumberFieldProps extends BaseFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export interface BooleanFieldProps extends BaseFieldProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface EnumFieldProps extends BaseFieldProps {
  value: unknown;
  onChange: (value: unknown) => void;
  /** Enum values from schema */
  options: unknown[];
  /** Whether to render as radio buttons (vs select dropdown) */
  asRadio?: boolean;
}

export interface ObjectFieldProps extends BaseFieldProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  /** Child field metadata */
  fields: FieldMetadata[];
}

export interface ArrayFieldProps extends BaseFieldProps {
  value: unknown[];
  onChange: (value: unknown[]) => void;
  /** Item schema */
  itemSchema: FieldMetadata;
  /** Minimum number of items */
  minItems?: number;
  /** Maximum number of items */
  maxItems?: number;
}

/**
 * Hook return types
 */

/**
 * Return type for useFormState hook
 */
export interface UseFormStateReturn {
  /** Current form data */
  data: FormData;
  /** Set a field value */
  setField: (path: FieldPath, value: unknown) => void;
  /** Set multiple fields at once */
  setFields: (fields: Partial<FormData>) => void;
  /** Get a field value */
  getField: (path: FieldPath) => unknown;
  /** Reset form to initial state */
  reset: () => void;
  /** Whether form has been modified */
  isDirty: boolean;
}

/**
 * Return type for useValidation hook
 */
export interface UseValidationReturn {
  /** Current validation errors */
  errors: FormErrors;
  /** Validate the entire form */
  validate: () => Promise<ValidationResult>;
  /** Validate a single field */
  validateField: (path: FieldPath) => Promise<boolean>;
  /** Clear all errors */
  clearErrors: () => void;
  /** Clear error for a specific field */
  clearFieldError: (path: FieldPath) => void;
  /** Set a field error */
  setFieldError: (path: FieldPath, message: string) => void;
  /** Whether validation is in progress */
  isValidating: boolean;
}

/**
 * Return type for useFormSubmission hook
 */
export interface UseFormSubmissionReturn {
  /** Submit the form */
  submit: () => Promise<void>;
  /** Current submission state */
  state: FormSubmissionState;
  /** Submission error (if any) */
  error: SubmissionError | null;
  /** Submission ID (if successful) */
  submissionId: string | null;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Whether submission was successful */
  isSuccess: boolean;
  /** Whether submission failed */
  isError: boolean;
  /** Reset submission state */
  reset: () => void;
}

/**
 * API client types
 */

/**
 * Create submission request
 */
export interface CreateSubmissionRequest {
  intakeId: string;
  idempotencyKey?: string;
  actor: Actor;
  initialFields?: FormData;
  ttlMs?: number;
}

/**
 * Create submission response
 */
export interface CreateSubmissionResponse {
  ok: true;
  submissionId: string;
  state: 'draft' | 'in_progress';
  resumeToken: string;
  schema: IntakeSchema;
  missingFields?: string[];
}

/**
 * Submit request
 */
export interface SubmitRequest {
  submissionId: string;
  resumeToken: string;
  idempotencyKey: string;
  actor: Actor;
}

/**
 * Submit response
 */
export interface SubmitResponse {
  ok: true;
  submissionId: string;
  state: 'submitted' | 'needs_review' | 'finalized';
  resumeToken: string;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Whether to validate all fields or only touched fields */
  validateAll?: boolean;
  /** Whether to abort validation on first error */
  abortEarly?: boolean;
}
