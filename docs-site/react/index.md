# React Form Renderer

The `@formbridge/form-renderer` package provides React components for rendering forms from intake schemas, handling agent-to-human handoff, and managing approval workflows.

## Installation

```bash
npm install @formbridge/form-renderer
```

Peer dependencies: `react` (>=18), `react-dom` (>=18).

## Quick Start

```tsx
import { FormBridgeForm } from '@formbridge/form-renderer';
import '@formbridge/form-renderer/styles.css';

function MyForm() {
  const schema = {
    type: 'object',
    properties: {
      companyName: { type: 'string', title: 'Company Name' },
      email: { type: 'string', format: 'email', title: 'Email' },
    },
    required: ['companyName', 'email'],
  };

  return (
    <FormBridgeForm
      schema={schema}
      fields={{}}
      fieldAttribution={{}}
      currentActor={{ kind: 'human', id: 'user-1' }}
      onSubmit={(fields) => console.log('Submitted:', fields)}
    />
  );
}
```

## FormBridgeForm

The main form component. Renders a complete form from a JSON Schema with field-level attribution tracking.

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `schema` | `FormSchema` | Yes | JSON Schema defining form fields |
| `fields` | `Record<string, unknown>` | Yes | Current field values |
| `fieldAttribution` | `FieldAttribution` | Yes | Map of field path to actor who filled it |
| `currentActor` | `Actor` | Yes | Actor performing the current editing session |
| `onFieldChange` | `(path, value, actor) => void` | No | Called when a field value changes |
| `onSubmit` | `(fields) => void` | No | Called when the form is submitted |
| `className` | `string` | No | CSS class for the form container |
| `readOnly` | `boolean` | No | Disable all fields |
| `errors` | `Record<string, string>` | No | Field-level error messages keyed by path |
| `submission` | `ReviewSubmission` | No | If provided with `needs_review` state, renders ReviewerView |
| `approvalActions` | `ReactNode` | No | Custom approval action buttons |

### FormSchema Type

```ts
interface FormSchema {
  type: 'object';
  properties: Record<string, FieldSchema>;
  required?: string[];
  title?: string;
  description?: string;
}
```

## Field Components

Each JSON Schema field type maps to a specialized React component. All field components share a common base props interface.

### Common Field Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | Yes | Dot-notation field path |
| `metadata` | `FieldMetadata` | Yes | Schema-derived field metadata (title, description, constraints) |
| `value` | varies | Yes | Current field value |
| `onChange` | `(value) => void` | Yes | Value change handler |
| `onBlur` | `() => void` | No | Blur handler for validation |
| `error` | `string` | No | Error message to display |
| `disabled` | `boolean` | No | Disable the field |
| `className` | `string` | No | CSS class for the field |

### StringField

Renders a text input. Supports `format` hints for email, url, date, and textarea (multiline).

```tsx
<StringField
  path="companyName"
  metadata={{ title: 'Company Name', type: 'string', required: true }}
  value="Acme Corp"
  onChange={(val) => setField('companyName', val)}
/>
```

### NumberField

Renders a numeric input with optional min/max constraints.

```tsx
<NumberField
  path="employeeCount"
  metadata={{ title: 'Employees', type: 'number', minimum: 1 }}
  value={50}
  onChange={(val) => setField('employeeCount', val)}
/>
```

### BooleanField

Renders a checkbox.

```tsx
<BooleanField
  path="agreeToTerms"
  metadata={{ title: 'I agree to the terms', type: 'boolean' }}
  value={false}
  onChange={(val) => setField('agreeToTerms', val)}
/>
```

### EnumField

Renders a select dropdown or radio group based on the `asRadio` prop.

| Prop | Type | Description |
|------|------|-------------|
| `options` | `unknown[]` | Array of selectable values |
| `asRadio` | `boolean` | Render as radio buttons instead of a dropdown |

```tsx
<EnumField
  path="industry"
  metadata={{ title: 'Industry', type: 'string' }}
  value="technology"
  options={['technology', 'healthcare', 'finance', 'other']}
  onChange={(val) => setField('industry', val)}
/>
```

### ObjectField

Renders a group of nested fields. Recursively renders child fields based on schema properties.

| Prop | Type | Description |
|------|------|-------------|
| `fields` | `FieldMetadata[]` | Metadata for each child field |

```tsx
<ObjectField
  path="address"
  metadata={{ title: 'Address', type: 'object' }}
  value={{ street: '', city: '' }}
  fields={[
    { title: 'Street', type: 'string', required: true },
    { title: 'City', type: 'string', required: true },
  ]}
  onChange={(val) => setField('address', val)}
/>
```

### ArrayField

Renders a list of items with add/remove controls.

| Prop | Type | Description |
|------|------|-------------|
| `itemSchema` | `FieldMetadata` | Schema for each array item |
| `minItems` | `number` | Minimum number of items |
| `maxItems` | `number` | Maximum number of items |

```tsx
<ArrayField
  path="tags"
  metadata={{ title: 'Tags', type: 'array' }}
  value={['important']}
  itemSchema={{ type: 'string', title: 'Tag' }}
  onChange={(val) => setField('tags', val)}
/>
```

### FileField

Renders a file upload input with drag-and-drop support.

| Prop | Type | Description |
|------|------|-------------|
| `maxSize` | `number` | Maximum file size in bytes |
| `allowedTypes` | `string[]` | Accepted MIME types (e.g. `["application/pdf"]`) |
| `maxCount` | `number` | Maximum number of files |
| `multiple` | `boolean` | Allow multiple file selection |

```tsx
<FileField
  path="taxForm"
  metadata={{ title: 'Tax Form (W-9)', type: 'file' }}
  value={null}
  maxSize={10_000_000}
  allowedTypes={['application/pdf']}
  onChange={(file) => setField('taxForm', file)}
/>
```

## Hooks

### useFormState

Manages form field values with dirty tracking.

```tsx
const { data, setField, setFields, getField, reset, isDirty } = useFormState({
  companyName: '',
  email: '',
});

setField('companyName', 'Acme Corp');
console.log(isDirty); // true
```

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `data` | `FormData` | Current form data object |
| `setField` | `(path, value) => void` | Set a single field value |
| `setFields` | `(fields) => void` | Set multiple field values at once |
| `getField` | `(path) => unknown` | Get a field value by path |
| `reset` | `() => void` | Reset to initial data |
| `isDirty` | `boolean` | Whether any field has been modified |

### useValidation

Validates form data against an intake schema.

```tsx
const {
  errors,
  validate,
  validateField,
  clearErrors,
  clearFieldError,
  setFieldError,
  isValidating,
} = useValidation(schema, data);

const result = await validate();
if (!result.valid) {
  console.log(errors); // { email: 'Invalid email format' }
}
```

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `errors` | `Record<string, string>` | Current validation errors keyed by field path |
| `validate` | `() => Promise<ValidationResult>` | Validate all fields |
| `validateField` | `(path) => Promise<boolean>` | Validate a single field |
| `clearErrors` | `() => void` | Clear all errors |
| `clearFieldError` | `(path) => void` | Clear error for a specific field |
| `setFieldError` | `(path, message) => void` | Manually set a field error |
| `isValidating` | `boolean` | Whether validation is in progress |

### useFormSubmission

Manages the full submission lifecycle including validation, API calls, and state tracking.

```tsx
const {
  submit,
  state,
  error,
  submissionId,
  isSubmitting,
  isSuccess,
  isError,
  reset,
} = useFormSubmission({
  schema,
  data,
  validation,
  apiClient,
  intakeId: 'vendor-onboarding',
  actor: { kind: 'human', id: 'user-1' },
  onSuccess: (id) => console.log('Created:', id),
  onError: (err) => console.error(err),
});
```

**Config:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | `FormSchema` | Yes | Form schema for validation |
| `data` | `FormData` | Yes | Current form data |
| `validation` | `UseValidationReturn` | Yes | Validation hook instance |
| `apiClient` | `FormBridgeApiClient` | Yes | API client instance |
| `intakeId` | `string` | Yes | Target intake identifier |
| `actor` | `Actor` | Yes | Actor performing the submission |
| `onSuccess` | `(submissionId) => void` | No | Success callback |
| `onError` | `(error) => void` | No | Error callback |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `submit` | `() => Promise<void>` | Trigger submission |
| `state` | `string` | `"idle"`, `"validating"`, `"submitting"`, `"success"`, or `"error"` |
| `error` | `SubmissionError \| null` | Error details if submission failed |
| `submissionId` | `string \| null` | Created submission ID on success |
| `isSubmitting` | `boolean` | Whether submission is in progress |
| `isSuccess` | `boolean` | Whether submission succeeded |
| `isError` | `boolean` | Whether submission failed |
| `reset` | `() => void` | Reset to idle state |

### useResumeSubmission

Fetches a submission by resume token for the agent-to-human handoff flow.

```tsx
const { submission, loading, error, refetch } = useResumeSubmission({
  resumeToken: 'rt_xyz789',
  endpoint: 'http://localhost:3000',
  onLoad: (submissionId, token) => console.log('Loaded:', submissionId),
  onError: (err) => console.error(err),
});
```

**Options:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resumeToken` | `string` | Yes | Resume token (or extracted from URL `?token=` param) |
| `endpoint` | `string` | No | API base URL (default: `http://localhost:3000`) |
| `onLoad` | `(submissionId, resumeToken) => void` | No | Called when submission loads |
| `onError` | `(error) => void` | No | Called on fetch error |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `submission` | `Submission \| null` | Loaded submission data |
| `loading` | `boolean` | Whether the fetch is in progress |
| `error` | `Error \| null` | Fetch error |
| `refetch` | `() => void` | Manually re-fetch the submission |

## WizardForm

Multi-step progressive form with step validation and navigation.

```tsx
import { WizardForm } from '@formbridge/form-renderer';

const steps = [
  { id: 'company', title: 'Company Info', fields: ['companyName', 'industry'] },
  { id: 'contact', title: 'Contact', fields: ['email', 'phone'] },
  { id: 'review', title: 'Review', fields: [] },
];

<WizardForm
  steps={steps}
  formValues={data}
  fieldSchemas={schemas}
  onStepChange={(stepId) => console.log('Step:', stepId)}
  onStepComplete={(stepId) => console.log('Completed:', stepId)}
  onComplete={() => console.log('All steps done')}
  renderStep={(step, errors) => (
    <div>
      <h2>{step.title}</h2>
      {/* render fields for this step */}
    </div>
  )}
/>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `steps` | `StepDefinition[]` | Yes | Step definitions with id, title, and field lists |
| `formValues` | `Record<string, unknown>` | Yes | Current form data |
| `fieldSchemas` | `Record<string, StepFieldSchema>` | Yes | Schema metadata for each field |
| `onStepChange` | `(stepId) => void` | No | Called when navigating to a new step |
| `onStepComplete` | `(stepId) => void` | No | Called when a step passes validation |
| `onComplete` | `() => void` | No | Called when all steps are complete |
| `renderStep` | `(step, errors) => ReactNode` | Yes | Render function for step content |
| `className` | `string` | No | CSS class for the wizard container |

### useWizardNavigation Hook

Used internally by `WizardForm` but also available for custom wizard implementations.

```tsx
const [state, actions] = useWizardNavigation(steps, formValues, fieldSchemas);

// state: { currentIndex, currentStep, visibleSteps, completedSteps, totalSteps, isFirst, isLast, progress }
// actions: { next, previous, goToStep, validateCurrentStep, markCompleted }
```

## ResumeFormPage

Full-page component for the agent-to-human handoff flow. Fetches a submission by resume token and renders the form for human completion.

```tsx
import { ResumeFormPage } from '@formbridge/form-renderer';

<ResumeFormPage
  resumeToken="rt_xyz789"
  endpoint="http://localhost:3000"
  onLoad={(submissionId, token) => console.log('Loaded:', submissionId)}
  onError={(err) => console.error(err)}
  className="resume-page"
/>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `resumeToken` | `string` | No | Resume token (falls back to URL `?token=` parameter) |
| `endpoint` | `string` | No | API base URL (default: `http://localhost:3000`) |
| `onLoad` | `(submissionId, resumeToken) => void` | No | Called when submission loads |
| `onError` | `(error) => void` | No | Called on fetch error |
| `className` | `string` | No | CSS class for the page container |

## ReviewerView

Read-only view of a submission for reviewer inspection. Displays all fields with their values and actor attribution.

```tsx
import { ReviewerView, ApprovalActions } from '@formbridge/form-renderer';

<ReviewerView
  submission={submission}
  schema={schema}
  reviewer={{ kind: 'human', id: 'reviewer@acme.com' }}
  approvalActions={
    <ApprovalActions
      submissionId={submission.id}
      resumeToken={submission.resumeToken}
      reviewer={{ kind: 'human', id: 'reviewer@acme.com' }}
      onApprove={handleApprove}
      onReject={handleReject}
      onRequestChanges={handleRequestChanges}
    />
  }
  onMetadataClick={(sub) => console.log('View metadata:', sub.id)}
/>
```

### ReviewerView Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `submission` | `ReviewSubmission` | Yes | Submission data to display |
| `schema` | `FormSchema` | Yes | Schema for field rendering |
| `reviewer` | `Actor` | Yes | Current reviewer actor |
| `className` | `string` | No | CSS class |
| `approvalActions` | `ReactNode` | No | Approval action buttons |
| `onMetadataClick` | `(submission) => void` | No | Callback for metadata link |

## ApprovalActions

Renders approve, reject, and request-changes buttons for the review workflow.

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `submissionId` | `string` | Yes | Submission to act on |
| `resumeToken` | `string` | Yes | Current resume token |
| `reviewer` | `Actor` | Yes | Reviewer actor |
| `onApprove` | `(data) => void \| Promise<void>` | No | Approve handler |
| `onReject` | `(data) => void \| Promise<void>` | No | Reject handler (receives `reason`) |
| `onRequestChanges` | `(data) => void \| Promise<void>` | No | Request changes handler (receives `fieldComments`) |
| `loading` | `boolean` | No | Show loading state |
| `disabled` | `boolean` | No | Disable all buttons |
| `layout` | `"horizontal" \| "vertical"` | No | Button layout (default: `"horizontal"`) |
| `size` | `"small" \| "medium" \| "large"` | No | Button size (default: `"medium"`) |
| `className` | `string` | No | CSS class |

## Utility Components

### ActorBadge

Displays a visual badge showing which actor filled a field.

```tsx
<ActorBadge
  actor={{ kind: 'agent', id: 'bot-1', name: 'Onboarding Bot' }}
  prefix="Filled by"
  size="small"
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `actor` | `Actor` | — | Actor to display |
| `prefix` | `string` | `"Filled by"` | Text before the actor name |
| `showName` | `boolean` | `true` | Show the actor's name or ID |
| `size` | `"small" \| "medium" \| "large"` | `"medium"` | Badge size |
| `className` | `string` | — | CSS class |

### FieldWrapper

Wraps a field component with label, description, attribution badge, and error display.

```tsx
<FieldWrapper
  path="companyName"
  label="Company Name"
  description="Legal entity name"
  required={true}
  fieldAttribution={{ kind: 'agent', id: 'bot-1' }}
  error="This field is required"
>
  <input value={value} onChange={handleChange} />
</FieldWrapper>
```

### ErrorDisplay

Displays structured submission errors returned by the API.

```tsx
<ErrorDisplay
  error={submissionError}
  showFieldErrors={true}
  title="Submission Error"
/>
```

### StepIndicator

Visual progress indicator for wizard forms showing completed, current, and upcoming steps.

```tsx
<StepIndicator
  steps={steps}
  currentStepId="contact"
  completedSteps={new Set(['company'])}
  onGoToStep={(stepId) => goToStep(stepId)}
/>
```

## Styling

Import the default CSS to get base styles for all components:

```tsx
import '@formbridge/form-renderer/styles.css';
```

All components accept a `className` prop for custom styling. The default styles use BEM-style class names prefixed with `formbridge-` for easy overriding.
