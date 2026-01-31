/**
 * Typed FormBridge API client for the Admin Dashboard.
 *
 * Communicates only through HTTP API — no direct core imports.
 *
 * @example
 * ```ts
 * const client = new FormBridgeApiClient({ baseUrl: 'http://localhost:3000' });
 * const intakes = await client.listIntakes();
 * ```
 */

/** Options for constructing a {@link FormBridgeApiClient}. */
export interface ApiClientOptions {
  /** Base URL of the FormBridge HTTP API (trailing slash is stripped). */
  baseUrl: string;
  /** Optional Bearer token sent in the `Authorization` header. */
  apiKey?: string;
}

/** Summary of a registered intake returned by list/get endpoints. */
export interface IntakeSummary {
  /** Unique intake identifier (e.g. `"vendor-onboarding"`). */
  intakeId: string;
  /** Human-readable intake name. */
  name: string;
  /** Semantic version string of the intake definition. */
  version: string;
  /** Total number of submissions created for this intake. */
  submissionCount: number;
  /** Number of submissions currently in `needs_review` state. */
  pendingApprovals: number;
}

/** Lightweight submission record returned in list responses. */
export interface SubmissionSummary {
  /** Unique submission identifier (e.g. `"sub_abc123"`). */
  id: string;
  /** Intake this submission belongs to. */
  intakeId: string;
  /** Current state machine state (e.g. `"draft"`, `"submitted"`). */
  state: string;
  /** Opaque token used for resuming or modifying this submission. */
  resumeToken?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-update timestamp. */
  updatedAt: string;
  /** Current field values keyed by field path. */
  fields: Record<string, unknown>;
}

/** Full submission detail including event history and webhook deliveries. */
export interface SubmissionDetail extends SubmissionSummary {
  /** Ordered list of events that have occurred on this submission. */
  events: EventRecord[];
  /** Webhook delivery attempts for this submission. */
  deliveries: DeliveryRecord[];
}

/** A single event in a submission's event stream. */
export interface EventRecord {
  /** Unique event identifier. */
  eventId: string;
  /** Event type (e.g. `"submission.created"`, `"field.updated"`). */
  type: string;
  /** Submission this event belongs to. */
  submissionId: string;
  /** ISO 8601 timestamp when the event occurred. */
  ts: string;
  /** Actor who triggered the event. */
  actor: { type: string; id?: string };
  /** Submission state at the time of this event. */
  state: string;
  /** Monotonically increasing event version number. */
  version?: number;
  /** Event-specific payload data (e.g. field diffs, reasons). */
  payload?: Record<string, unknown>;
}

/** Record of a single webhook delivery attempt. */
export interface DeliveryRecord {
  /** Unique delivery identifier. */
  deliveryId: string;
  /** Submission this delivery is for. */
  submissionId: string;
  /** Webhook destination URL. */
  destinationUrl: string;
  /** Current delivery status. */
  status: "pending" | "succeeded" | "failed";
  /** Number of delivery attempts made so far. */
  attempts: number;
  /** ISO 8601 timestamp of the most recent attempt. */
  lastAttemptAt?: string;
  /** HTTP status code from the most recent attempt. */
  statusCode?: number;
  /** Error message from the most recent failed attempt. */
  error?: string;
  /** ISO 8601 timestamp when this delivery was first created. */
  createdAt: string;
}

/** Submission pending approval, returned by the approval queue endpoint. */
export interface ApprovalRecord {
  /** Submission identifier awaiting review. */
  submissionId: string;
  /** Intake this submission belongs to. */
  intakeId: string;
  /** Current state (typically `"needs_review"`). */
  state: string;
  /** Current field values for reviewer inspection. */
  fields: Record<string, unknown>;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Aggregate analytics data returned by `GET /analytics/summary`. */
export interface AnalyticsSummary {
  /** Total number of registered intakes. */
  totalIntakes: number;
  /** Total number of submissions across all intakes. */
  totalSubmissions: number;
  /** Number of submissions currently awaiting approval. */
  pendingApprovals: number;
  /** Submission counts grouped by state (e.g. `{ draft: 5, submitted: 12 }`). */
  submissionsByState: Record<string, number>;
  /** Most recent events across all submissions. */
  recentActivity: EventRecord[];
}

/** A single data point in the submission volume time series. */
export interface VolumeDataPoint {
  /** Date in `YYYY-MM-DD` format. */
  date: string;
  /** Number of submissions created on this date. */
  count: number;
}

/** Per-intake metrics returned by `GET /analytics/intakes`. */
export interface IntakeMetrics {
  /** Intake identifier. */
  intakeId: string;
  /** Total submissions for this intake. */
  total: number;
  /** Submission counts grouped by state. */
  byState: Record<string, number>;
  /** Fraction of submissions that reached `finalized` state (0–1). */
  completionRate: number;
}

/** A single stage in the submission funnel returned by `GET /analytics/funnel`. */
export interface FunnelDataPoint {
  /** State machine state for this funnel stage. */
  state: string;
  /** Number of submissions that reached this state. */
  count: number;
  /** Percentage of total submissions that reached this state (0–100). */
  percentage: number;
}

/** Paginated API response wrapper. */
export interface PaginatedResponse<T> {
  /** Array of items for the current page. */
  data: T[];
  /** Total number of items matching the query. */
  total: number;
  /** Current page number (1-based). */
  page: number;
  /** Maximum items per page. */
  pageSize: number;
  /** Whether more pages are available after this one. */
  hasMore: boolean;
}

/** Filter and pagination options for listing submissions. */
export interface SubmissionFilter {
  /** Filter by submission state (e.g. `"draft"`, `"needs_review"`). */
  state?: string;
  /** Filter by intake identifier. */
  intakeId?: string;
  /** Page number to retrieve (1-based). */
  page?: number;
  /** Number of items per page. */
  pageSize?: number;
  /** Field to sort by (e.g. `"createdAt"`, `"updatedAt"`). */
  sortBy?: string;
  /** Sort direction. */
  sortOrder?: "asc" | "desc";
}

export class FormBridgeApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  /**
   * Create a new API client instance.
   *
   * @param options - Client configuration including base URL and optional API key.
   *
   * @example
   * ```ts
   * const client = new FormBridgeApiClient({
   *   baseUrl: 'http://localhost:3000',
   *   apiKey: 'fb_key_abc123',
   * });
   * ```
   */
  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
    };
    if (options.apiKey) {
      this.headers["Authorization"] = `Bearer ${options.apiKey}`;
    }
  }

  /**
   * Send an HTTP request to the FormBridge API.
   *
   * @param path - API path relative to baseUrl (e.g. `"/intakes"`).
   * @param init - Optional fetch request configuration.
   * @returns Parsed JSON response body.
   * @throws {ApiError} When the response status is not 2xx.
   */
  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(response.status, body, path);
    }

    return response.json() as Promise<T>;
  }

  // ─── Intakes ────────────────────────────────────────────────────────────

  /**
   * List all registered intakes with summary metrics.
   *
   * @returns Array of intake summaries.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const intakes = await client.listIntakes();
   * console.log(intakes[0].name); // "Vendor Onboarding"
   * ```
   */
  async listIntakes(): Promise<IntakeSummary[]> {
    return this.fetch<IntakeSummary[]>("/intakes");
  }

  /**
   * Get a single intake by its identifier.
   *
   * @param intakeId - The intake identifier to look up.
   * @returns The intake summary.
   * @throws {ApiError} With status 404 if the intake does not exist.
   *
   * @example
   * ```ts
   * const intake = await client.getIntake('vendor-onboarding');
   * ```
   */
  async getIntake(intakeId: string): Promise<IntakeSummary> {
    return this.fetch<IntakeSummary>(`/intakes/${encodeURIComponent(intakeId)}`);
  }

  // ─── Submissions ────────────────────────────────────────────────────────

  /**
   * List submissions for an intake with optional filtering and pagination.
   *
   * @param intakeId - Intake to list submissions for.
   * @param filter - Optional filter, sort, and pagination options.
   * @returns Paginated list of submission summaries.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const page = await client.listSubmissions('vendor-onboarding', {
   *   state: 'submitted',
   *   page: 1,
   *   pageSize: 20,
   * });
   * console.log(page.total); // 42
   * ```
   */
  async listSubmissions(
    intakeId: string,
    filter?: SubmissionFilter
  ): Promise<PaginatedResponse<SubmissionSummary>> {
    const params = new URLSearchParams();
    if (filter?.state) params.set("state", filter.state);
    if (filter?.page) params.set("page", String(filter.page));
    if (filter?.pageSize) params.set("pageSize", String(filter.pageSize));
    if (filter?.sortBy) params.set("sortBy", filter.sortBy);
    if (filter?.sortOrder) params.set("sortOrder", filter.sortOrder);

    const qs = params.toString();
    const path = `/intakes/${encodeURIComponent(intakeId)}/submissions${qs ? `?${qs}` : ""}`;
    return this.fetch<PaginatedResponse<SubmissionSummary>>(path);
  }

  /**
   * Get full details for a single submission including events and deliveries.
   *
   * @param intakeId - Intake the submission belongs to.
   * @param submissionId - The submission identifier.
   * @returns Full submission detail with event history and delivery records.
   * @throws {ApiError} With status 404 if the submission does not exist.
   *
   * @example
   * ```ts
   * const detail = await client.getSubmission('vendor-onboarding', 'sub_abc');
   * console.log(detail.events.length); // 5
   * ```
   */
  async getSubmission(
    intakeId: string,
    submissionId: string
  ): Promise<SubmissionDetail> {
    return this.fetch<SubmissionDetail>(
      `/intakes/${encodeURIComponent(intakeId)}/submissions/${encodeURIComponent(submissionId)}`
    );
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  /**
   * Get the event stream for a submission.
   *
   * @param submissionId - The submission to fetch events for.
   * @returns Ordered array of event records.
   * @throws {ApiError} With status 404 if the submission does not exist.
   *
   * @example
   * ```ts
   * const events = await client.getEvents('sub_abc');
   * events.forEach(e => console.log(e.type, e.ts));
   * ```
   */
  async getEvents(submissionId: string): Promise<EventRecord[]> {
    return this.fetch<EventRecord[]>(
      `/submissions/${encodeURIComponent(submissionId)}/events`
    );
  }

  // ─── Approvals ──────────────────────────────────────────────────────────

  /**
   * List all submissions currently pending approval.
   *
   * @returns Array of submissions in `needs_review` state.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const pending = await client.listPendingApprovals();
   * console.log(`${pending.length} submissions need review`);
   * ```
   */
  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    return this.fetch<ApprovalRecord[]>("/approvals/pending");
  }

  /**
   * Approve a submission that is in `needs_review` state.
   *
   * @param intakeId - Intake the submission belongs to.
   * @param submissionId - The submission to approve.
   * @param comment - Optional approval comment.
   * @throws {ApiError} With status 404 if not found, 409 if not in reviewable state.
   *
   * @example
   * ```ts
   * await client.approveSubmission('vendor-onboarding', 'sub_abc', 'Looks good');
   * ```
   */
  async approveSubmission(
    intakeId: string,
    submissionId: string,
    comment?: string
  ): Promise<void> {
    await this.fetch(
      `/intakes/${encodeURIComponent(intakeId)}/submissions/${encodeURIComponent(submissionId)}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ comment }),
      }
    );
  }

  /**
   * Reject a submission that is in `needs_review` state.
   *
   * @param intakeId - Intake the submission belongs to.
   * @param submissionId - The submission to reject.
   * @param reason - Required reason for rejection.
   * @throws {ApiError} With status 404 if not found, 409 if not in reviewable state.
   *
   * @example
   * ```ts
   * await client.rejectSubmission('vendor-onboarding', 'sub_abc', 'Missing W-9');
   * ```
   */
  async rejectSubmission(
    intakeId: string,
    submissionId: string,
    reason: string
  ): Promise<void> {
    await this.fetch(
      `/intakes/${encodeURIComponent(intakeId)}/submissions/${encodeURIComponent(submissionId)}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      }
    );
  }

  // ─── Deliveries ─────────────────────────────────────────────────────────

  /**
   * Get webhook delivery records for a submission.
   *
   * @param submissionId - The submission to fetch deliveries for.
   * @returns Array of delivery records with status and attempt counts.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const deliveries = await client.getDeliveries('sub_abc');
   * const failed = deliveries.filter(d => d.status === 'failed');
   * ```
   */
  async getDeliveries(submissionId: string): Promise<DeliveryRecord[]> {
    return this.fetch<DeliveryRecord[]>(
      `/submissions/${encodeURIComponent(submissionId)}/deliveries`
    );
  }

  /**
   * Retry a failed webhook delivery.
   *
   * @param deliveryId - The delivery to retry.
   * @throws {ApiError} With status 404 if not found, 409 if delivery is not in failed state.
   *
   * @example
   * ```ts
   * await client.retryDelivery('del_xyz');
   * ```
   */
  async retryDelivery(deliveryId: string): Promise<void> {
    await this.fetch(`/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
      method: "POST",
    });
  }

  // ─── Analytics ──────────────────────────────────────────────────────────

  /**
   * Get aggregate analytics summary across all intakes.
   *
   * @returns Summary with totals, state breakdowns, and recent activity.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const summary = await client.getAnalyticsSummary();
   * console.log(summary.totalSubmissions); // 142
   * ```
   */
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    return this.fetch<AnalyticsSummary>("/analytics/summary");
  }

  /**
   * Get submission volume over time as a daily time series.
   *
   * @param days - Number of days to look back (default: 30, max: 365).
   * @returns Array of date/count pairs ordered chronologically.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const volume = await client.getVolumeData(7);
   * // [{ date: '2025-01-24', count: 3 }, ...]
   * ```
   */
  async getVolumeData(
    days: number = 30
  ): Promise<VolumeDataPoint[]> {
    return this.fetch<VolumeDataPoint[]>(
      `/analytics/volume?days=${days}`
    );
  }

  /**
   * Get per-intake metrics including completion rates.
   *
   * @returns Array of metrics for each registered intake.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const metrics = await client.getIntakeMetrics();
   * metrics.forEach(m => console.log(m.intakeId, m.completionRate));
   * ```
   */
  async getIntakeMetrics(): Promise<IntakeMetrics[]> {
    return this.fetch<IntakeMetrics[]>("/analytics/intakes");
  }

  /**
   * Get funnel data showing how submissions progress through states.
   *
   * @returns Array of states with counts and percentages, ordered by funnel stage.
   * @throws {ApiError} On network or server error.
   *
   * @example
   * ```ts
   * const funnel = await client.getFunnelData();
   * // [{ state: 'draft', count: 100, percentage: 100 }, ...]
   * ```
   */
  async getFunnelData(): Promise<FunnelDataPoint[]> {
    return this.fetch<FunnelDataPoint[]>("/analytics/funnel");
  }
}

/**
 * Error thrown when the FormBridge API returns a non-2xx response.
 *
 * @example
 * ```ts
 * try {
 *   await client.getIntake('nonexistent');
 * } catch (err) {
 *   if (err instanceof ApiError && err.status === 404) {
 *     console.log('Intake not found');
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  /**
   * @param status - HTTP status code from the response.
   * @param body - Raw response body text.
   * @param path - API path that was requested.
   */
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string
  ) {
    super(`API error ${status} at ${path}: ${body}`);
    this.name = "ApiError";
  }
}
