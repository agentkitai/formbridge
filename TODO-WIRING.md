# FormBridge — Wiring Fixes TODO

> Generated 2026-01-31. Everything that's built but not connected.

---

## 1. Backend: Mount Upload Routes

**Problem:** `createUploadRouter()` in `src/routes/uploads.ts` is never called in `src/app.ts`. File upload negotiation endpoints (`POST .../uploads`, `POST .../uploads/:id/confirm`) are unreachable.

**Files:**
- `src/app.ts` — needs to import and mount `createUploadRouter`
- `src/routes/uploads.ts` — the router (already complete)

**Fix:**
```ts
// In createFormBridgeAppWithIntakes(), after other route mounts:
import { createUploadRouter } from './routes/uploads.js';
// ...
app.route('/intake', createUploadRouter(registry, manager));
```

**Depends on:** Nothing. Standalone fix.

---

## 2. Backend: Mount Webhook Routes

**Problem:** `createHonoWebhookRouter()` in `src/routes/hono-webhooks.ts` is never called in `src/app.ts`. Delivery status queries and retry endpoints are unreachable.

**Files:**
- `src/app.ts` — needs to import and mount `createHonoWebhookRouter`
- `src/routes/hono-webhooks.ts` — the router (already complete)
- `src/core/webhook-manager.ts` — needs to be instantiated

**Fix:**
```ts
import { createHonoWebhookRouter } from './routes/hono-webhooks.js';
import { WebhookManager } from './core/webhook-manager.js';
// ...
const webhookManager = new WebhookManager(/* deps */);
app.route('/', createHonoWebhookRouter(webhookManager));
```

**Depends on:** Need to check `WebhookManager` constructor signature and what store/dependencies it needs.

---

## 3. Backend: Mount Analytics Routes

**Problem:** `createHonoAnalyticsRouter()` in `src/routes/hono-analytics.ts` is never called in `src/app.ts`. Admin dashboard has no data source.

**Files:**
- `src/app.ts` — needs to import and mount
- `src/routes/hono-analytics.ts` — the router (already complete)

**Fix:**
```ts
import { createHonoAnalyticsRouter } from './routes/hono-analytics.js';
// ...
// Need to implement AnalyticsDataProvider backed by the in-memory store
app.route('/', createHonoAnalyticsRouter(analyticsProvider));
```

**Depends on:** Need to create an `AnalyticsDataProvider` implementation that reads from the in-memory submission store and event emitter.

---

## 4. Backend: Replace NoopEventEmitter with Real Event Emitter

**Problem:** `createFormBridgeAppWithIntakes()` in `src/app.ts` uses `NoopEventEmitter`. All events (submission created, field updated, submitted, etc.) are silently dropped. This means:
- No webhook delivery ever happens
- No event stream is recorded
- Analytics have no data

**Files:**
- `src/app.ts` — `NoopEventEmitter` class (lines ~56-58)
- `src/core/event-store.ts` — likely has a real implementation

**Fix:**
- Check if there's a real `EventEmitter`/`EventStore` implementation in `src/core/`
- If yes, wire it in place of `NoopEventEmitter`
- If not, implement one (in-memory is fine for dev)
- Connect it to the `WebhookManager` so submitted events trigger delivery

**Depends on:** Items 2 and 3 benefit from this but aren't blocked.

---

## 5. Frontend: FormBridgeForm — Handle Nested Object Fields

**Problem:** `FormBridgeForm.renderField()` only handles flat field types (string, number, boolean, enum). When schema has `type: "object"` (e.g., `bank_account` with `routing` and `account` sub-fields), it falls through to the default `<input type="text">` and renders `[object Object]`.

**Files:**
- `packages/form-renderer/src/components/FormBridgeForm.tsx` — `renderField()` method (~line 179)
- `packages/form-renderer/src/components/fields/ObjectField.tsx` — exists, not used

**Fix:**
In `renderField()`, add a case for `property.type === 'object'`:
```tsx
} else if (property.type === 'object' && property.properties) {
  // Recursively render sub-fields using ObjectField or inline fieldset
  return (
    <fieldset key={fieldPath}>
      <legend>{fieldLabel}</legend>
      {Object.entries(property.properties).map(([subKey, subProp]) =>
        renderField(`${fieldPath}.${subKey}`, subProp)
      )}
    </fieldset>
  );
}
```

Also need to update `handleFieldChange` to support dot-path field updates (e.g., `bank_account.routing`), and update `localFields` to handle nested get/set.

**Depends on:** Nothing. Standalone fix.

---

## 6. Frontend: FormBridgeForm — Handle Array Fields

**Problem:** Same as above. `type: "array"` fields (e.g., certifications, tags) are not routed to `ArrayField`. They'd render as `[object Object]` or empty input.

**Files:**
- `packages/form-renderer/src/components/FormBridgeForm.tsx` — `renderField()`
- `packages/form-renderer/src/components/fields/ArrayField.tsx` — exists, not used

**Fix:**
Add array case in `renderField()`:
```tsx
} else if (property.type === 'array') {
  // Render ArrayField component with items schema
  return <ArrayField ... />;
}
```

Need to map the JSON Schema `items` definition to `ArrayField`'s expected `itemSchema` prop format.

**Depends on:** Nothing. Standalone fix.

---

## 7. Frontend: FormBridgeForm — Handle File Fields

**Problem:** `type: "file"` fields (from intake schemas with upload support) are not routed to `FileField`.

**Files:**
- `packages/form-renderer/src/components/FormBridgeForm.tsx` — `renderField()`
- `packages/form-renderer/src/components/fields/FileField.tsx` — exists, not used

**Fix:**
Add file case in `renderField()`. Also need to wire `FileField`'s `onChange` to the upload negotiation flow (request signed URL → upload → confirm).

**Depends on:** Item 1 (upload routes) for actual uploads. Can render the UI without it.

---

## 8. Frontend: FormBridgeForm — SchemaProperty Type is Too Narrow

**Problem:** The `SchemaProperty` interface in `FormBridgeForm.tsx` doesn't include `properties` (for objects), `items` (for arrays), or file-related fields. This blocks items 5-7.

**Files:**
- `packages/form-renderer/src/components/FormBridgeForm.tsx` — `SchemaProperty` interface (~line 14)

**Fix:**
```ts
export interface SchemaProperty {
  type: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  // Add these:
  properties?: Record<string, SchemaProperty>;  // for nested objects
  required?: string[];                           // for nested objects
  items?: SchemaProperty;                        // for arrays
  minItems?: number;                             // for arrays
  maxItems?: number;                             // for arrays
}
```

**Depends on:** Nothing. Required by items 5-7.

---

## 9. Frontend: Demo Reviewer Page — Wire to Real API

**Problem:** `ReviewerPage` in `packages/demo/src/App.tsx` uses hardcoded `mockSubmission` with fake data. The approve/reject/request-changes callbacks simulate 1s delays and set local state. No real API calls.

**Files:**
- `packages/demo/src/App.tsx` — `ReviewerPage` component (~line 170)
- `packages/form-renderer/src/api/client.ts` — has `approve()`, `reject()`, `requestChanges()` methods

**Fix:**
- Accept a submission ID or resume token (from URL params or after agent simulation)
- Fetch real submission data from `GET /submissions/resume/:token`
- Wire `handleApprove` → `client.approve()`, `handleReject` → `client.reject()`, etc.
- Show real API responses/errors

**Depends on:** A submission must exist in `needs_review` state. Need a way to create one (either via the agent simulation or a dedicated test route).

---

## 10. Frontend: Admin Dashboard — Wire Up Pages

**Problem:** `packages/admin-dashboard/src/main.ts` renders a static placeholder. Six page components exist (`DashboardPage`, `IntakeListPage`, `SubmissionBrowserPage`, `SubmissionDetailPage`, `ApprovalQueuePage`, `AnalyticsDashboardPage`, `WebhookMonitorPage`) but none are routed.

**Files:**
- `packages/admin-dashboard/src/main.ts` — placeholder App
- `packages/admin-dashboard/src/pages/*.ts` — page components
- `packages/admin-dashboard/src/api/client.ts` — typed API client (complete)

**Fix:**
- Add `react-router-dom` routing in `main.ts`
- Mount each page at appropriate routes
- Add navigation (sidebar/nav)
- Configure Vite proxy to backend (like demo does)
- Set API client `baseUrl` to proxy target

**Depends on:** Items 2, 3, 4 (backend routes/analytics) for the dashboard to have data to display.

---

## 11. Frontend: ResumeFormPage — `endpoint=""` Breaks Outside Vite Proxy

**Problem:** Demo passes `endpoint=""` to `ResumeFormPage`. This works when Vite proxies `/intake/*` and `/submissions/*` to `:3000`, but the `ResumeFormPage` default is `http://localhost:3000`. If someone runs `ResumeFormPage` standalone (e.g., embedded), the empty string causes API calls to the current origin (which may not be the backend).

**Files:**
- `packages/demo/src/App.tsx` line 400
- `packages/form-renderer/src/components/ResumeFormPage.tsx`

**Fix:** Minor — document the behavior, or have `ResumeFormPage` detect empty string and use relative URLs (which is what `endpoint=""` effectively does via Vite proxy). This is more of a docs/DX issue than a bug.

**Depends on:** Nothing.

---

## 12. Frontend: WizardForm — Not Integrated Anywhere

**Problem:** `WizardForm` component is built with step navigation, validation, and progress indicator. It's not used by `FormBridgeForm`, `ResumeFormPage`, or the demo.

**Files:**
- `packages/form-renderer/src/components/WizardForm.tsx`
- `packages/form-renderer/src/components/StepIndicator.tsx`
- `packages/form-renderer/src/hooks/useWizardNavigation.ts`

**Fix:** This is a feature gap, not a bug. Options:
- Wire `FormBridgeForm` to use `WizardForm` when schema has wizard step metadata
- Add a demo page showing multi-step form
- Or leave it as an opt-in component (already exported)

**Depends on:** Schema needs step definitions. Low priority.

---

## Priority Order (Suggested)

| Priority | Item | Impact |
|----------|------|--------|
| 🔴 P0 | **#5** Nested object fields | Vendor onboarding form is broken (bank_account) |
| 🔴 P0 | **#8** SchemaProperty type | Blocks #5, #6, #7 |
| 🟠 P1 | **#6** Array fields | Forms with lists don't render |
| 🟠 P1 | **#4** Real event emitter | Nothing is recorded or delivered |
| 🟠 P1 | **#1** Mount upload routes | File uploads dead |
| 🟡 P2 | **#7** File field rendering | UI exists, needs wiring |
| 🟡 P2 | **#2** Mount webhook routes | Delivery monitoring dead |
| 🟡 P2 | **#3** Mount analytics routes | Dashboard data dead |
| 🟡 P2 | **#9** Real reviewer page | Approval flow is demo-only |
| 🔵 P3 | **#10** Admin dashboard | Placeholder, lots of work |
| 🔵 P3 | **#11** Endpoint config | DX issue, not a bug |
| 🔵 P3 | **#12** WizardForm | Feature, not a fix |
