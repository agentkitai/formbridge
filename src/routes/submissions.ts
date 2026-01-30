/**
 * Submission HTTP Routes
 * Provides HTTP endpoints for submission operations including agent-to-human handoff
 */

import type { Request, Response, NextFunction } from "express";
import type { SubmissionManager } from "../core/submission-manager";
import {
  SubmissionNotFoundError,
  SubmissionExpiredError,
} from "../core/submission-manager";
import type { Actor } from "../types/intake-contract";
import { z } from "zod";

const actorSchema = z
  .object({
    kind: z.enum(["agent", "human", "system"]),
    id: z.string().max(255),
    name: z.string().max(255).optional(),
  })
  .strict();

function parseActor(
  body: unknown,
  fallback: Actor
): { ok: true; actor: Actor } | { ok: false; error: string } {
  const raw = (body as Record<string, unknown>)?.actor;
  if (!raw) return { ok: true, actor: fallback };
  const result = actorSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0].message };
  }
  return { ok: true, actor: result.data as Actor };
}

/**
 * Create submission routes
 * @param manager - SubmissionManager instance for handling submission operations
 */
export function createSubmissionRoutes(manager: SubmissionManager) {
  return {
    /**
     * POST /submissions/:id/handoff
     * Generate a resume URL for agent-to-human handoff
     *
     * Request params:
     *   - id: submission ID
     *
     * Request body (optional):
     *   - actor: Actor object (defaults to system actor if not provided)
     *
     * Response:
     *   - resumeUrl: The shareable URL for human to continue the form
     *   - submissionId: The submission ID
     *   - resumeToken: The resume token (for reference)
     */
    async generateHandoff(req: Request, res: Response, next: NextFunction) {
      try {
        const { id: submissionId } = req.params;

        if (!submissionId) {
          res.status(400).json({
            error: "Missing submission ID",
          });
          return;
        }

        // Validate and extract actor from request body
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

        // Generate the handoff URL (throws SubmissionNotFoundError if not found)
        const resumeUrl = await manager.generateHandoffUrl(submissionId, actor);

        // Parse the resume token from the generated URL
        const resumeTokenMatch = new URL(resumeUrl).searchParams.get("token");

        res.status(200).json({
          resumeUrl,
          submissionId,
          resumeToken: resumeTokenMatch,
        });
      } catch (error) {
        if (error instanceof SubmissionNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        next(error);
      }
    },

    /**
     * GET /submissions/resume/:resumeToken
     * Fetch submission data by resume token for agent-to-human handoff
     *
     * Used by frontend ResumeFormPage to load pre-filled form data
     */
    async getByResumeToken(req: Request, res: Response, next: NextFunction) {
      try {
        const { resumeToken } = req.params;

        if (!resumeToken) {
          res.status(400).json({
            error: "Missing resume token",
          });
          return;
        }

        // Fetch submission by resume token (method already exists)
        const submission = await manager.getSubmissionByResumeToken(resumeToken);

        if (!submission) {
          res.status(404).json({
            error: "Submission not found. The resume link may be invalid or expired.",
          });
          return;
        }

        // Check if submission is expired
        if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
          res.status(403).json({
            error: "This resume link has expired.",
          });
          return;
        }

        // Return only the fields needed by the frontend (avoid leaking internal data)
        res.status(200).json({
          id: submission.id,
          state: submission.state,
          fields: submission.fields,
          fieldAttribution: submission.fieldAttribution,
          expiresAt: submission.expiresAt,
        });
      } catch (error) {
        next(error);
      }
    },

    /**
     * POST /submissions/resume/:resumeToken/resumed
     * Emit HANDOFF_RESUMED event when human opens the resume form
     *
     * Allows agent to be notified when human starts completing the form
     */
    async emitResumed(req: Request, res: Response, next: NextFunction) {
      try {
        const { resumeToken } = req.params;

        if (!resumeToken) {
          res.status(400).json({
            error: "Missing resume token",
          });
          return;
        }

        // Validate and extract actor from request body
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

        // Emit handoff.resumed event via manager
        const eventId = await manager.emitHandoffResumed(resumeToken, actor);

        res.status(200).json({
          ok: true,
          eventId,
        });
      } catch (error) {
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

/**
 * Express router factory for submission routes
 * @param manager - SubmissionManager instance
 * @returns Express Router with submission endpoints
 */
export function createSubmissionRouter(manager: SubmissionManager) {
  // This would be used with Express like:
  // const router = express.Router();
  // const routes = createSubmissionRoutes(manager);
  // router.post('/submissions/:id/handoff', routes.generateHandoff);
  // return router;

  return createSubmissionRoutes(manager);
}
