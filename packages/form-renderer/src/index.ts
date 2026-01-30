/**
 * FormBridge Form Renderer
 * React components and hooks for rendering forms in the agent-to-human handoff workflow
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
export { FileField } from './components/fields/FileField';

// Helper components (for advanced customization)
export { FieldWrapper } from './components/FieldWrapper';
export type { FieldWrapperProps } from './components/FieldWrapper';
export { ErrorDisplay } from './components/ErrorDisplay';

// Hooks (for advanced usage and custom form implementations)
export { useFormState } from './hooks/useFormState';
export { useValidation } from './hooks/useValidation';
export { useFormSubmission } from './hooks/useFormSubmission';

// API Client
export {
  FormBridgeApiClient,
  createApiClient,
  defaultApiClient,
} from './api';

export type {
  EmitEventResponse,
  ApiClientOptions,
} from './api';

// Hooks
export {
  useResumeSubmission,
} from './hooks';

export type {
  Submission,
  UseResumeSubmissionReturn,
  UseResumeSubmissionOptions,
} from './hooks';

// Types
export type {
  // Component prop types
  FormBridgeFormProps,
  BaseFieldProps,
  StringFieldProps,
  NumberFieldProps,
  BooleanFieldProps,
  EnumFieldProps,
  ObjectFieldProps,
  ArrayFieldProps,
  FileFieldProps,
} from './types';

// Components
export { ResumeFormPage } from './components/ResumeFormPage';
export type { ResumeFormPageProps } from './components/ResumeFormPage';
export { ActorBadge } from './components/ActorBadge';
export type { ActorBadgeProps } from './components/ActorBadge';
export type { FormSchema, SchemaProperty } from './components/FormBridgeForm';
export { ReviewerView } from './components/ReviewerView';
export type { ReviewerViewProps, ReviewSubmission } from './components/ReviewerView';
export { ApprovalActions } from './components/ApprovalActions';
export type { ApprovalActionsProps, FieldComment } from './components/ApprovalActions';
