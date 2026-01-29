/**
 * FormBridge Form Renderer
 * React components and hooks for rendering forms in the agent-to-human handoff workflow
 */

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

// Components
export { ResumeFormPage } from './components/ResumeFormPage';
export type { ResumeFormPageProps } from './components/ResumeFormPage';
export { FieldWrapper } from './components/FieldWrapper';
export type { FieldWrapperProps } from './components/FieldWrapper';
export { ActorBadge } from './components/ActorBadge';
export type { ActorBadgeProps } from './components/ActorBadge';
export { FormBridgeForm } from './components/FormBridgeForm';
export type { FormBridgeFormProps, FormSchema, SchemaProperty } from './components/FormBridgeForm';
