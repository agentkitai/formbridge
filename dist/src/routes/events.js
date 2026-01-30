import { SubmissionNotFoundError } from "../core/submission-manager";
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
        .refine((val) => {
        if (!val)
            return true;
        const types = val.split(",");
        return types.every((t) => eventTypeEnum.safeParse(t).success);
    }, {
        message: "Invalid event type",
    }),
    actorKind: z.enum(["agent", "human", "system"]).optional(),
    since: z
        .string()
        .optional()
        .refine((val) => {
        if (!val)
            return true;
        const date = new Date(val);
        return !isNaN(date.getTime());
    }, {
        message: "Invalid ISO 8601 timestamp for 'since'",
    }),
    until: z
        .string()
        .optional()
        .refine((val) => {
        if (!val)
            return true;
        const date = new Date(val);
        return !isNaN(date.getTime());
    }, {
        message: "Invalid ISO 8601 timestamp for 'until'",
    }),
})
    .strict();
function parseQueryParams(query) {
    const result = queryParamsSchema.safeParse(query);
    if (!result.success) {
        return { ok: false, error: result.error.issues[0].message };
    }
    const filters = {};
    const validated = result.data;
    if (validated.type) {
        filters.type = validated.type.includes(",")
            ? validated.type.split(",")
            : validated.type;
    }
    if (validated.actorKind) {
        filters.actorKind = validated.actorKind;
    }
    if (validated.since) {
        filters.since = validated.since;
    }
    if (validated.until) {
        filters.until = validated.until;
    }
    return { ok: true, filters };
}
function filterByType(events, type) {
    const types = Array.isArray(type) ? type : [type];
    return events.filter((event) => types.includes(event.type));
}
function filterByActorKind(events, actorKind) {
    return events.filter((event) => event.actor.kind === actorKind);
}
function filterByTimeRange(events, since, until) {
    let filtered = events;
    if (since) {
        const sinceDate = new Date(since);
        filtered = filtered.filter((event) => new Date(event.ts) >= sinceDate);
    }
    if (until) {
        const untilDate = new Date(until);
        filtered = filtered.filter((event) => new Date(event.ts) <= untilDate);
    }
    return filtered;
}
function applyEventFilters(events, filters) {
    let filtered = events;
    if (filters.type) {
        filtered = filterByType(filtered, filters.type);
    }
    if (filters.actorKind) {
        filtered = filterByActorKind(filtered, filters.actorKind);
    }
    if (filters.since || filters.until) {
        filtered = filterByTimeRange(filtered, filters.since, filters.until);
    }
    return filtered;
}
export function createEventRoutes(manager) {
    return {
        async getEvents(req, res, next) {
            try {
                const { id: submissionId } = req.params;
                if (!submissionId) {
                    res.status(400).json({
                        error: "Missing submission ID",
                    });
                    return;
                }
                const submission = await manager.getSubmission(submissionId);
                if (!submission) {
                    res.status(404).json({
                        error: "Submission not found",
                    });
                    return;
                }
                const queryResult = parseQueryParams(req.query);
                if (!queryResult.ok) {
                    res.status(400).json({
                        error: `Invalid query parameters: ${queryResult.error}`,
                    });
                    return;
                }
                const events = submission.events || [];
                const filteredEvents = applyEventFilters(events, queryResult.filters);
                res.status(200).json({
                    submissionId: submission.id,
                    events: filteredEvents,
                });
            }
            catch (error) {
                if (error instanceof SubmissionNotFoundError) {
                    res.status(404).json({ error: error.message });
                    return;
                }
                next(error);
            }
        },
    };
}
export function createEventRouter(manager) {
    return createEventRoutes(manager);
}
//# sourceMappingURL=events.js.map