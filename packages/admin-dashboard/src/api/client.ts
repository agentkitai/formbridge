/**
 * Typed FormBridge API client for the Admin Dashboard.
 *
 * Communicates only through HTTP API — no direct core imports.
 */

export interface ApiClientOptions {
  baseUrl: string;
  apiKey?: string;
}

export interface IntakeSummary {
  intakeId: string;
  name: string;
  version: string;
  submissionCount: number;
  pendingApprovals: number;
}

export interface SubmissionSummary {
  id: string;
  intakeId: string;
  state: string;
  resumeToken?: string;
  createdAt: string;
  updatedAt: string;
  fields: Record<string, unknown>;
}

export interface SubmissionDetail extends SubmissionSummary {
  events: EventRecord[];
  deliveries: DeliveryRecord[];
}

export interface EventRecord {
  eventId: string;
  type: string;
  submissionId: string;
  ts: string;
  actor: { type: string; id?: string };
  state: string;
  version?: number;
  payload?: Record<string, unknown>;
}

export interface DeliveryRecord {
  deliveryId: string;
  submissionId: string;
  destinationUrl: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  lastAttemptAt?: string;
  statusCode?: number;
  error?: string;
  createdAt: string;
}

export interface ApprovalRecord {
  submissionId: string;
  intakeId: string;
  state: string;
  fields: Record<string, unknown>;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalIntakes: number;
  totalSubmissions: number;
  pendingApprovals: number;
  submissionsByState: Record<string, number>;
  recentActivity: EventRecord[];
}

export interface VolumeDataPoint {
  date: string;
  count: number;
}

export interface IntakeMetrics {
  intakeId: string;
  total: number;
  byState: Record<string, number>;
  completionRate: number;
}

export interface FunnelDataPoint {
  state: string;
  count: number;
  percentage: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SubmissionFilter {
  state?: string;
  intakeId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export class FormBridgeApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
    };
    if (options.apiKey) {
      this.headers["Authorization"] = `Bearer ${options.apiKey}`;
    }
  }

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

  async listIntakes(): Promise<IntakeSummary[]> {
    return this.fetch<IntakeSummary[]>("/intakes");
  }

  async getIntake(intakeId: string): Promise<IntakeSummary> {
    return this.fetch<IntakeSummary>(`/intakes/${encodeURIComponent(intakeId)}`);
  }

  // ─── Submissions ────────────────────────────────────────────────────────

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

  async getSubmission(
    intakeId: string,
    submissionId: string
  ): Promise<SubmissionDetail> {
    return this.fetch<SubmissionDetail>(
      `/intakes/${encodeURIComponent(intakeId)}/submissions/${encodeURIComponent(submissionId)}`
    );
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  async getEvents(submissionId: string): Promise<EventRecord[]> {
    return this.fetch<EventRecord[]>(
      `/submissions/${encodeURIComponent(submissionId)}/events`
    );
  }

  // ─── Approvals ──────────────────────────────────────────────────────────

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    return this.fetch<ApprovalRecord[]>("/approvals/pending");
  }

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

  async getDeliveries(submissionId: string): Promise<DeliveryRecord[]> {
    return this.fetch<DeliveryRecord[]>(
      `/submissions/${encodeURIComponent(submissionId)}/deliveries`
    );
  }

  async retryDelivery(deliveryId: string): Promise<void> {
    await this.fetch(`/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
      method: "POST",
    });
  }

  // ─── Analytics ──────────────────────────────────────────────────────────

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    return this.fetch<AnalyticsSummary>("/analytics/summary");
  }

  async getVolumeData(
    days: number = 30
  ): Promise<VolumeDataPoint[]> {
    return this.fetch<VolumeDataPoint[]>(
      `/analytics/volume?days=${days}`
    );
  }

  async getIntakeMetrics(): Promise<IntakeMetrics[]> {
    return this.fetch<IntakeMetrics[]>("/analytics/intakes");
  }

  async getFunnelData(): Promise<FunnelDataPoint[]> {
    return this.fetch<FunnelDataPoint[]>("/analytics/funnel");
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string
  ) {
    super(`API error ${status} at ${path}: ${body}`);
    this.name = "ApiError";
  }
}
