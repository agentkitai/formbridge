import { SubmissionNotFoundError } from "../core/submission-manager";
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
                const filters = {};
                if (req.query.type) {
                    const typeParam = req.query.type;
                    filters.type = typeParam.includes(",")
                        ? typeParam.split(",")
                        : typeParam;
                }
                if (req.query.actorKind) {
                    filters.actorKind = req.query.actorKind;
                }
                if (req.query.since) {
                    filters.since = req.query.since;
                }
                if (req.query.until) {
                    filters.until = req.query.until;
                }
                const events = submission.events || [];
                const filteredEvents = applyEventFilters(events, filters);
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