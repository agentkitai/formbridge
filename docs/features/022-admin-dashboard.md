# Feature 022 — Admin Dashboard

> **Status:** PLANNED | **Phase:** 5 | **Priority:** Could | **Complexity:** High | **Impact:** Medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Build a web-based admin dashboard as a React single-page application that provides operational visibility and management capabilities for FormBridge deployments. The dashboard communicates exclusively through the FormBridge HTTP API and covers six core areas: intake definition management, submission browsing with search/filter/sort, submission detail views with event timelines and delivery status, an approval queue with one-click review actions, webhook delivery monitoring, and analytics (submission volume, agent vs. human breakdowns, completion rates). The dashboard is the centerpiece of the hosted governance tier and ships as a separate package (`packages/admin-dashboard/`) that can be deployed standalone or embedded.

## Dependencies

**Upstream:**
- Feature 3 (Form Renderer) — submission detail views may embed form previews
- Feature 13 (Event Store / Audit Trail) — event timeline depends on queryable events
- Feature 14 (Webhook Delivery) — webhook monitoring depends on delivery tracking

**Downstream:**
- Feature 23 (Authentication, Authorization & Multi-Tenancy) — dashboard requires authentication integration

**Internal task ordering:** Dashboard app scaffolding (Task 1) and API client layer (Task 10) must come first. View implementations (Tasks 2-7) can proceed in parallel after scaffolding. Authentication integration (Task 8) depends on Feature 23 or a stub auth layer. Responsive design (Task 9) is a cross-cutting concern applied throughout.

## Architecture & Design

### Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React 18+ with Vite | Consistent with form-renderer; fast dev server |
| Routing | React Router v6 | Standard SPA routing |
| State Management | TanStack Query (React Query) | Server state caching, pagination, auto-refresh |
| UI Components | Tailwind CSS + headless UI (Radix) | Consistent styling; accessible primitives |
| Charts | Recharts | Lightweight; React-native charting |
| Data Tables | TanStack Table | Headless, sortable, filterable tables |
| Build | Vite | Consistent with existing packages |

### Application Structure

```
packages/admin-dashboard/
  src/
    api/
      client.ts              # FormBridge API client (wraps fetch)
      types.ts               # API response types
    components/
      layout/
        Sidebar.tsx           # Navigation sidebar
        Header.tsx            # Top bar with user info, search
        PageLayout.tsx        # Standard page wrapper
      intakes/
        IntakeList.tsx        # Intake definition listing
        IntakeDetail.tsx      # Single intake with schema preview
      submissions/
        SubmissionBrowser.tsx  # Search/filter/sort table
        SubmissionDetail.tsx   # Single submission with event timeline
        SubmissionFilters.tsx  # Filter controls
      approvals/
        ApprovalQueue.tsx     # Pending approvals list
        ReviewAction.tsx      # Approve/reject/request changes
      webhooks/
        WebhookMonitor.tsx    # Delivery status and retry
        DeliveryLog.tsx       # Per-webhook delivery history
      analytics/
        AnalyticsDashboard.tsx # Charts and metrics
        VolumeChart.tsx       # Submission volume over time
        ActorBreakdown.tsx    # Agent vs. human pie chart
        CompletionFunnel.tsx  # Completion rate funnel
      common/
        DataTable.tsx         # Reusable table with sort/filter/pagination
        StatusBadge.tsx       # Submission state badges
        EventTimeline.tsx     # Vertical event timeline
        SearchBar.tsx         # Global search
        Pagination.tsx        # Page controls
    hooks/
      useSubmissions.ts       # TanStack Query hooks for submissions
      useIntakes.ts           # TanStack Query hooks for intakes
      useApprovals.ts         # TanStack Query hooks for approval queue
      useAnalytics.ts         # TanStack Query hooks for analytics
    pages/
      DashboardHome.tsx       # Landing page with summary metrics
      IntakesPage.tsx         # Intake management page
      SubmissionsPage.tsx     # Submission browser page
      SubmissionDetailPage.tsx # Submission detail page
      ApprovalsPage.tsx       # Approval queue page
      WebhooksPage.tsx        # Webhook monitor page
      AnalyticsPage.tsx       # Analytics dashboard page
    router.tsx                # Route definitions
    App.tsx                   # Root component
    main.tsx                  # Entry point
  index.html
  package.json
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
```

### API Client Layer

The dashboard communicates only through the FormBridge HTTP API. The API client is a thin wrapper around `fetch` with:
- Base URL configuration
- Authentication header injection
- Response type parsing
- Error handling with structured error types
- Request deduplication (via TanStack Query)

### Required API Endpoints

The dashboard assumes the following API endpoints exist (some may need to be created):

| Endpoint | Purpose | Exists? |
|----------|---------|---------|
| `GET /intakes` | List intake definitions | To be added |
| `GET /intakes/:id` | Get intake detail | Exists |
| `GET /intakes/:id/submissions` | List submissions with filters | To be added |
| `GET /submissions/:id` | Get submission detail with events | Exists |
| `GET /submissions/:id/events` | Get submission event history | To be added |
| `POST /submissions/:id/review` | Approve/reject submission | Exists |
| `GET /approvals/pending` | List submissions needing review | To be added |
| `GET /webhooks/deliveries` | List webhook delivery attempts | To be added |
| `POST /webhooks/deliveries/:id/retry` | Retry failed delivery | To be added |
| `GET /analytics/summary` | Summary metrics | To be added |
| `GET /analytics/volume` | Submission volume over time | To be added |

## Implementation Tasks

### Task 1: Dashboard App Scaffolding
- [ ] Create `packages/admin-dashboard/` with Vite React TypeScript template
- [ ] Configure Tailwind CSS with FormBridge design tokens (colors, typography, spacing)
- [ ] Set up React Router v6 with route definitions for all pages
- [ ] Install and configure TanStack Query with default stale/cache times
- [ ] Create `PageLayout` component with sidebar navigation and header
- [ ] Create `Sidebar` component with navigation links to all sections
- [ ] Create `Header` component with search bar and user placeholder
- [ ] Add the package to the workspace root
- [ ] Configure Vite proxy to FormBridge API server for development

**Dependencies:** None
**Effort:** M
**Validation:** App scaffolding runs; sidebar navigation works; all routes render placeholder content

### Task 2: Intake Definition List and Detail Views
- [ ] Create `IntakeList` component with a table of all registered intakes
- [ ] Display intake name, version, field count, submission count, and status
- [ ] Create `IntakeDetail` component with schema preview (field list with types and constraints)
- [ ] Show intake configuration: approval gates, TTL, destination
- [ ] Add quick actions: view submissions, view schema JSON
- [ ] Implement `useIntakes` TanStack Query hook for data fetching

**Dependencies:** Task 1, Task 10
**Effort:** M
**Validation:** Intake list loads from API; detail view shows all schema fields; navigation between list and detail works

### Task 3: Submission Browser with Search, Filter, and Sort
- [ ] Create `SubmissionBrowser` component using TanStack Table
- [ ] Display columns: submission ID, intake name, state, created by, created at, updated at
- [ ] Implement `SubmissionFilters` with filter controls: state (multi-select), intake (dropdown), date range, actor type (agent/human)
- [ ] Implement column-level sorting (click column header to sort)
- [ ] Implement server-side pagination with `Pagination` component
- [ ] Implement text search across submission ID and field values
- [ ] Create `StatusBadge` component with color-coded submission state badges
- [ ] Create `useSubmissions` TanStack Query hook with filter/sort/pagination parameters

**Dependencies:** Task 1, Task 10
**Effort:** L
**Validation:** Submission table loads with pagination; filters narrow results correctly; sorting works on all columns; search finds submissions

### Task 4: Submission Detail View with Event Timeline
- [ ] Create `SubmissionDetail` component showing all submission data
- [ ] Display submission metadata: ID, state, intake, created by, timestamps, resume token (masked)
- [ ] Display field values in a structured view (nested objects, arrays rendered as trees)
- [ ] Display field attribution (which actor filled each field) with visual indicators
- [ ] Create `EventTimeline` component showing all events in chronological order
- [ ] Each timeline entry shows: event type, timestamp, actor, payload summary
- [ ] Color-code events by type (creation, field update, validation, review, delivery)
- [ ] Show delivery status for submitted/finalized submissions
- [ ] Add quick actions: approve/reject (if needs_review), view raw JSON

**Dependencies:** Task 1, Task 10
**Effort:** L
**Validation:** Submission detail loads all data; event timeline shows all events in order; field attribution displayed; quick actions work

### Task 5: Approval Queue Interface
- [ ] Create `ApprovalQueue` component listing submissions in `needs_review` state
- [ ] Display: submission ID, intake name, submitted by, submitted at, waiting time
- [ ] Sort by waiting time (longest first) by default
- [ ] Create `ReviewAction` component with approve/reject/request-changes buttons
- [ ] Approve: one-click approval with optional comment
- [ ] Reject: requires reason text
- [ ] Request changes: field-level comments with optional suggested values
- [ ] After action, submission moves to appropriate state and leaves the queue
- [ ] Auto-refresh queue every 30 seconds
- [ ] Create `useApprovals` TanStack Query hook

**Dependencies:** Task 1, Task 10
**Effort:** M
**Validation:** Queue shows pending approvals; approve/reject/request-changes actions work; submission leaves queue after action; auto-refresh works

### Task 6: Webhook Delivery Monitor
- [ ] Create `WebhookMonitor` component listing webhook delivery attempts
- [ ] Display: destination URL, submission ID, status (success/failed/pending), timestamp, response code
- [ ] Filter by status (failed, success, pending)
- [ ] Create `DeliveryLog` component showing per-delivery detail: request/response headers, body preview, timing
- [ ] Add retry button for failed deliveries
- [ ] Show retry count and next retry time for pending retries
- [ ] Highlight failed deliveries with visual alert

**Dependencies:** Task 1, Task 10
**Effort:** M
**Validation:** Delivery list loads and filters correctly; detail view shows request/response data; retry triggers re-delivery

### Task 7: Analytics Dashboard
- [ ] Create `AnalyticsDashboard` component with summary metrics cards
- [ ] Summary cards: total submissions (24h/7d/30d), pending approvals, failed deliveries, average completion time
- [ ] Create `VolumeChart` component: submission volume over time (line chart, configurable time range)
- [ ] Create `ActorBreakdown` component: agent vs. human submissions (pie chart)
- [ ] Create `CompletionFunnel` component: draft -> in_progress -> submitted -> finalized (funnel chart)
- [ ] Add per-intake breakdown toggle (view analytics for a specific intake)
- [ ] Create `useAnalytics` TanStack Query hook with time range parameters

**Dependencies:** Task 1, Task 10
**Effort:** L
**Validation:** Summary metrics display correctly; charts render with real data; time range filtering works; per-intake breakdown toggles correctly

### Task 8: Authentication Integration
- [ ] Create auth context provider with login state management
- [ ] Implement login page with username/password (for basic auth) or OAuth redirect
- [ ] Add authentication header injection to API client
- [ ] Protect all routes with auth guard (redirect to login if not authenticated)
- [ ] Display current user identity in the header
- [ ] Implement logout
- [ ] If Feature 23 is not yet implemented, provide a stub auth layer (API key in local storage)

**Dependencies:** Task 1, Feature 23 (or stub)
**Effort:** M
**Validation:** Unauthenticated access redirects to login; authenticated requests include credentials; logout clears state

### Task 9: Responsive Design
- [ ] Ensure sidebar collapses to hamburger menu on mobile
- [ ] Ensure data tables are scrollable horizontally on narrow screens
- [ ] Ensure charts resize correctly
- [ ] Test at breakpoints: 320px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop)
- [ ] Ensure approval actions are accessible on mobile (no tiny buttons)
- [ ] Ensure event timeline is readable on narrow screens

**Dependencies:** Tasks 1-7
**Effort:** M
**Validation:** All views are usable at all breakpoints; no horizontal overflow; touch targets are large enough on mobile

### Task 10: API Client Layer
- [ ] Create `packages/admin-dashboard/src/api/client.ts` with typed API methods
- [ ] Implement methods for all required endpoints (intakes, submissions, approvals, webhooks, analytics)
- [ ] Add base URL configuration (environment variable or build-time config)
- [ ] Add authentication header injection hook
- [ ] Add structured error handling (parse API error responses into typed errors)
- [ ] Add request/response logging in development mode
- [ ] Define API response types in `packages/admin-dashboard/src/api/types.ts`
- [ ] Add any missing API endpoints to the FormBridge server (`src/routes/`)

**Dependencies:** Task 1
**Effort:** M
**Validation:** API client methods are fully typed; all endpoints return expected data; errors are structured and displayed

### Task 11: Comprehensive Testing
- [ ] Write unit tests for API client (mock fetch responses)
- [ ] Write component tests for DataTable (sorting, filtering, pagination)
- [ ] Write component tests for EventTimeline (event rendering, ordering)
- [ ] Write component tests for ApprovalQueue (action triggers)
- [ ] Write component tests for AnalyticsDashboard (chart rendering)
- [ ] Write integration tests for page flows (navigate to submission, view detail, approve)
- [ ] Write E2E test: login, browse submissions, view detail, approve submission

**Dependencies:** Tasks 1-10
**Effort:** L
**Validation:** All tests pass; component tests cover interactive behavior; E2E test covers full approval workflow

## Test Plan

| Type | Description | Target Count |
|------|-------------|--------------|
| Unit | API client methods (mock responses) | 15 |
| Unit | Utility functions (date formatting, status mapping) | 8 |
| Component | DataTable (sort, filter, paginate) | 10 |
| Component | EventTimeline (event types, ordering) | 6 |
| Component | ApprovalQueue (approve, reject, request changes) | 8 |
| Component | StatusBadge (all states) | 5 |
| Component | Analytics charts (render with data) | 6 |
| Integration | Page flow (navigation, data loading) | 8 |
| E2E | Full approval workflow | 2 |
| Visual | Responsive design at 4 breakpoints | 4 |

## Documentation Tasks

- [ ] Write dashboard user guide with screenshots of each section
- [ ] Document required API endpoints and response formats
- [ ] Document dashboard deployment options (standalone, embedded, Docker)
- [ ] Document configuration options (API URL, auth provider, theme)
- [ ] Write developer guide for extending the dashboard with custom views

## Code Review Checklist

- [ ] Type safety: API responses are fully typed; no `any` in component props
- [ ] Patterns consistent: all data fetching uses TanStack Query hooks; no direct fetch calls in components
- [ ] No regressions: FormBridge server API remains backward-compatible
- [ ] Performance acceptable: initial load < 3s; table renders < 100ms for 100 rows; charts render < 500ms
- [ ] Accessibility: all interactive elements are keyboard navigable; ARIA labels on charts and badges
- [ ] Security: no sensitive data in URL parameters; auth tokens stored securely

## Deployment & Release

- **Package name:** `@formbridge/admin-dashboard`
- **Build output:** Static HTML/JS/CSS bundle (Vite build)
- **Deployment options:**
  1. Standalone: serve static files from any web server
  2. Embedded: mount in existing React app via `<DashboardApp apiUrl="..." />`
  3. Docker: `formbridge/admin-dashboard` container serving static files with nginx
- **Environment configuration:** `VITE_API_URL`, `VITE_AUTH_PROVIDER`, `VITE_THEME`
- **Breaking changes:** None to existing FormBridge API; new endpoints are additive

## Observability & Monitoring

- Dashboard itself logs API errors to browser console with structured format
- Track page load times and API response times (built-in TanStack Query devtools)
- Monitor dashboard bundle size in CI (alert on > 500KB gzipped)
- Track usage analytics (page views, actions taken) via optional telemetry
- Dashboard health page (`/health`) checks API connectivity

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing API endpoints block dashboard features | High | High | Identify and implement required endpoints early (Task 10); stub responses for development |
| Dashboard bundle too large | Medium | Low | Code-split by route; lazy-load charts; monitor bundle size in CI |
| Authentication complexity delays delivery | Medium | Medium | Stub auth layer allows dashboard development without Feature 23; integrate real auth later |
| Data volume overwhelms client-side rendering | Low | Medium | Server-side pagination on all list views; limit client-side data to current page |
| Accessibility gaps | Medium | Medium | Use headless UI primitives (Radix); test with screen reader; follow WAI-ARIA patterns |

## Definition of Done

- [ ] Intake definition listing with schema preview
- [ ] Submission browser with search, filter, sort, and pagination
- [ ] Submission detail view with event timeline and delivery status
- [ ] Approval queue with one-click approve/reject/request-changes
- [ ] Webhook delivery monitor with retry capability
- [ ] Analytics dashboard with volume, actor breakdown, and completion funnel
- [ ] React-based SPA, responsive at all breakpoints
- [ ] Authentication required for all routes
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No regressions
