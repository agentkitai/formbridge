import { SubmissionNotFoundError, SubmissionExpiredError, } from "../core/submission-manager";
import { z } from "zod";
const actorSchema = z
    .object({
    kind: z.enum(["agent", "human", "system"]),
    id: z.string().max(255),
    name: z.string().max(255).optional(),
})
    .strict();
function parseActor(body, fallback) {
    const raw = body?.actor;
    if (!raw)
        return { ok: true, actor: fallback };
    const result = actorSchema.safeParse(raw);
    if (!result.success) {
        return { ok: false, error: result.error.issues[0].message };
    }
    return { ok: true, actor: result.data };
}
export function createSubmissionRoutes(manager) {
    return {
        async generateHandoff(req, res, next) {
            try {
                const { id: submissionId } = req.params;
                if (!submissionId) {
                    res.status(400).json({
                        error: "Missing submission ID",
                    });
                    return;
                }
                const actorResult = parseActor(req.body, {
                    kind: "system",
                    id: "system",
                    name: "System",
                });
                if (!actorResult.ok) {
                    res.status(400).json({ error: `Invalid actor: ${actorResult.error}` });
                    return;
                }
                const actor = actorResult.actor;
                const resumeUrl = await manager.generateHandoffUrl(submissionId, actor);
                const resumeTokenMatch = new URL(resumeUrl).searchParams.get("token");
                res.status(200).json({
                    resumeUrl,
                    submissionId,
                    resumeToken: resumeTokenMatch,
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
        async getByResumeToken(req, res, next) {
            try {
                const { resumeToken } = req.params;
                if (!resumeToken) {
                    res.status(400).json({
                        error: "Missing resume token",
                    });
                    return;
                }
                const submission = await manager.getSubmissionByResumeToken(resumeToken);
                if (!submission) {
                    res.status(404).json({
                        error: "Submission not found. The resume link may be invalid or expired.",
                    });
                    return;
                }
                if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
                    res.status(403).json({
                        error: "This resume link has expired.",
                    });
                    return;
                }
                res.status(200).json({
                    id: submission.id,
                    state: submission.state,
                    fields: submission.fields,
                    fieldAttribution: submission.fieldAttribution,
                    expiresAt: submission.expiresAt,
                });
            }
            catch (error) {
                next(error);
            }
        },
        async emitResumed(req, res, next) {
            try {
                const { resumeToken } = req.params;
                if (!resumeToken) {
                    res.status(400).json({
                        error: "Missing resume token",
                    });
                    return;
                }
                const actorResult = parseActor(req.body, {
                    kind: "human",
                    id: "human-unknown",
                    name: "Human User",
                });
                if (!actorResult.ok) {
                    res.status(400).json({ error: `Invalid actor: ${actorResult.error}` });
                    return;
                }
                const actor = actorResult.actor;
                const eventId = await manager.emitHandoffResumed(resumeToken, actor);
                res.status(200).json({
                    ok: true,
                    eventId,
                });
            }
            catch (error) {
                if (error instanceof SubmissionNotFoundError) {
                    res.status(404).json({ error: error.message });
                    return;
                }
                if (error instanceof SubmissionExpiredError) {
                    res.status(403).json({ error: error.message });
                    return;
                }
                next(error);
            }
        },
    };
}
export function createSubmissionRouter(manager) {
    return createSubmissionRoutes(manager);
}
//# sourceMappingURL=submissions.js.map