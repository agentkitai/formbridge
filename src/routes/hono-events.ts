/**
 * Hono Event Routes
 *
 * Provides Hono HTTP endpoints for retrieving submission event streams.
 *
 * Endpoints:
 * - GET /submissions/:id/events — Retrieve filtered event stream
 * - GET /submissions/:id/events/export — Export events in JSONL or JSON
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { SubmissionManager } from "../core/submission-manager.js";
import { SubmissionNotFoundError } from "../core/submission-manager.js";
import type { IntakeEventType } from "../types/intake-contract.js";
import { redactEventTokens } from "./event-sanitizer.js";
import type { EventFilters } from "../core/event-store.js";
import { z } from "zod";

const eventTypeEnum = z.enum([
  "submission.created",
  "field.updated",
  "validation.passed",
  "validation.failed",
  "upload.requested",
  "upload.completed",
  "upload.failed",
  "submission.submitted",
  "review.requested",
  "review.approved",
  "review.rejected",
  "delivery.attempted",
  "delivery.succeeded",
  "delivery.failed",
  "submission.finalized",
  "submission.cancelled",
  "submission.expired",
  "handoff.link_issued",
  "handoff.resumed",
]);

const queryParamsSchema = z
  .object({
    type: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const types = val.split(",");
          return types.every((t) => eventTypeEnum.safeParse(t).success);
        },
        { message: "Invalid event type" }
      ),
    actorKind: z.enum(["agent", "human", "system"]).optional(),
    since: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          return !isNaN(new Date(val).getTime());
        },
        { message: "Invalid ISO 8601 timestamp for 'since'" }
      ),
    until: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          return !isNaN(new Date(val).getTime());
        },
        { message: "Invalid ISO 8601 timestamp for 'until'" }
      ),
    limit: z.coerce.number().int().min(0).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

const exportQueryParamsSchema = queryParamsSchema.extend({
  format: z.enum(["json", "jsonl"]).optional().default("jsonl"),
});

function buildEventFilters(
  params: z.infer<typeof queryParamsSchema>
): EventFilters {
  const filters: EventFilters = {};
  if (params.type) {
    filters.types = params.type.split(",") as IntakeEventType[];
  }
  if (params.actorKind) {
    filters.actorKind = params.actorKind;
  }
  if (params.since) {
    filters.since = params.since;
  }
  if (params.until) {
    filters.until = params.until;
  }
  if (params.limit !== undefined) {
    filters.limit = params.limit;
  }
  if (params.offset !== undefined) {
    filters.offset = params.offset;
  }
  return filters;
}

/**
 * Build pagination-free filters (same as buildEventFilters but without limit/offset)
 * Used to get total count for pagination metadata.
 */
function buildContentFilters(
  params: z.infer<typeof queryParamsSchema>
): EventFilters {
  const filters: EventFilters = {};
  if (params.type) {
    filters.types = params.type.split(",") as IntakeEventType[];
  }
  if (params.actorKind) {
    filters.actorKind = params.actorKind;
  }
  if (params.since) {
    filters.since = params.since;
  }
  if (params.until) {
    filters.until = params.until;
  }
  return filters;
}

/**
 * Creates a Hono router with event stream endpoints.
 */
export function createHonoEventRouter(
  manager: SubmissionManager
): Hono {
  const router = new Hono();

  /**
   * GET /submissions/:id/events
   * Retrieve the event stream for a submission with optional filters
   */
  router.get("/submissions/:id/events", async (c: Context) => {
    const submissionId = c.req.param("id");

    if (!submissionId) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing submission ID" } },
        400
      );
    }

    // Validate query params
    const queryResult = queryParamsSchema.safeParse(c.req.query());
    if (!queryResult.success) {
      return c.json(
        {
          ok: false,
          error: {
            type: "invalid_request",
            message: `Invalid query parameters: ${queryResult.error.issues[0]?.message ?? "Invalid parameters"}`,
          },
        },
        400
      );
    }

    try {
      const params = queryResult.data;
      const limit = params.limit ?? 100;
      const offset = params.offset ?? 0;

      // Get total count (without pagination) for metadata
      const contentFilters = buildContentFilters(params);
      const allEvents = await manager.getEvents(submissionId, contentFilters);
      const total = allEvents.length;

      // Get paginated results
      const paginatedFilters = buildEventFilters(params);
      // Apply defaults if not specified
      if (paginatedFilters.limit === undefined) paginatedFilters.limit = limit;
      if (paginatedFilters.offset === undefined) paginatedFilters.offset = offset;
      const events = await manager.getEvents(submissionId, paginatedFilters);

      return c.json({
        submissionId,
        events: events.map(redactEventTokens),
        pagination: {
          offset,
          limit,
          total,
          hasMore: offset + events.length < total,
        },
      });
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        return c.json(
          { ok: false, error: { type: "not_found", message: "Submission not found" } },
          404
        );
      }
      throw error;
    }
  });

  /**
   * GET /submissions/:id/events/export
   * Export events in JSONL or JSON format
   */
  router.get("/submissions/:id/events/export", async (c: Context) => {
    const submissionId = c.req.param("id");

    if (!submissionId) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing submission ID" } },
        400
      );
    }

    const queryResult = exportQueryParamsSchema.safeParse(c.req.query());
    if (!queryResult.success) {
      return c.json(
        {
          ok: false,
          error: {
            type: "invalid_request",
            message: `Invalid query parameters: ${queryResult.error.issues[0]?.message ?? "Invalid parameters"}`,
          },
        },
        400
      );
    }

    const { format, ...filterParams } = queryResult.data;

    try {
      const filters = buildEventFilters(filterParams);
      const events = (await manager.getEvents(submissionId, filters)).map(redactEventTokens);

      if (format === "jsonl") {
        const jsonl = events.map((e) => JSON.stringify(e)).join("\n");
        return new Response(jsonl, {
          status: 200,
          headers: {
            "Content-Type": "application/x-ndjson",
            "Content-Disposition": `attachment; filename="events-${submissionId}.jsonl"`,
          },
        });
      }

      const json = JSON.stringify(events, null, 2);
      return new Response(json, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="events-${submissionId}.json"`,
        },
      });
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        return c.json(
          { ok: false, error: { type: "not_found", message: "Submission not found" } },
          404
        );
      }
      throw error;
    }
  });

  return router;
}
