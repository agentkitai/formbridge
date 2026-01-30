/**
 * Approval HTTP Routes
 * Provides HTTP endpoints for approval operations (approve, reject, request changes)
 */

import type { Request, Response, NextFunction } from "express";
import type { ApprovalManager } from "../core/approval-manager";
import {
  SubmissionNotFoundError,
  InvalidStateError,
  InvalidResumeTokenError,
} from "../core/approval-manager";
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
 * Create approval routes
 * @param manager - ApprovalManager instance for handling approval operations
 */
export function createApprovalRoutes(manager: ApprovalManager) {
  return {
    /**
     * POST /submissions/:id/approve
     * Approve a submission that is in needs_review state
     *
     * Request params:
     *   - id: submission ID
     *
     * Request body:
     *   - resumeToken: The resume token for verification
     *   - actor: Actor object (defaults to human actor if not provided)
     *   - comment: Optional approval comment
     *
     * Response:
     *   - ok: true if successful
     *   - submissionId: The submission ID
     *   - state: New state after approval
     *   - resumeToken: The resume token
     */
    async approve(req: Request, res: Response, next: NextFunction) {
      try {
        const { id: submissionId } = req.params;
        const { resumeToken, comment } = req.body;

        if (!submissionId) {
          res.status(400).json({
            error: "Missing submission ID",
          });
          return;
        }

        if (!resumeToken) {
          res.status(400).json({
            error: "Missing resumeToken in request body",
          });
          return;
        }

        // Validate and extract actor from request body
        const actorResult = parseActor(req.body, {
          kind: "human",
          id: "human-reviewer",
          name: "Human Reviewer",
        });
        if (!actorResult.ok) {
          res.status(400).json({ error: `Invalid actor: ${actorResult.error}` });
          return;
        }
        const actor = actorResult.actor;

        // Call approval manager
        const result = await manager.approve({
          submissionId,
          resumeToken,
          actor,
          comment,
        });

        // Check if result is an error
        if (!result.ok) {
          res.status(409).json(result);
          return;
        }

        res.status(200).json(result);
      } catch (error) {
        if (error instanceof SubmissionNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof InvalidResumeTokenError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },

    /**
     * POST /submissions/:id/reject
     * Reject a submission that is in needs_review state
     *
     * Request params:
     *   - id: submission ID
     *
     * Request body:
     *   - resumeToken: The resume token for verification
     *   - actor: Actor object (defaults to human actor if not provided)
     *   - reason: Required rejection reason
     *   - comment: Optional additional comment
     *
     * Response:
     *   - ok: true if successful
     *   - submissionId: The submission ID
     *   - state: New state after rejection
     *   - resumeToken: The resume token
     */
    async reject(req: Request, res: Response, next: NextFunction) {
      try {
        const { id: submissionId } = req.params;
        const { resumeToken, reason, comment } = req.body;

        if (!submissionId) {
          res.status(400).json({
            error: "Missing submission ID",
          });
          return;
        }

        if (!resumeToken) {
          res.status(400).json({
            error: "Missing resumeToken in request body",
          });
          return;
        }

        if (!reason) {
          res.status(400).json({
            error: "Missing reason in request body (required for rejection)",
          });
          return;
        }

        // Validate and extract actor from request body
        const actorResult = parseActor(req.body, {
          kind: "human",
          id: "human-reviewer",
          name: "Human Reviewer",
        });
        if (!actorResult.ok) {
          res.status(400).json({ error: `Invalid actor: ${actorResult.error}` });
          return;
        }
        const actor = actorResult.actor;

        // Call approval manager
        const result = await manager.reject({
          submissionId,
          resumeToken,
          actor,
          reason,
          comment,
        });

        // Check if result is an error
        if (!result.ok) {
          res.status(409).json(result);
          return;
        }

        res.status(200).json(result);
      } catch (error) {
        if (error instanceof SubmissionNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof InvalidResumeTokenError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },

    /**
     * POST /submissions/:id/request-changes
     * Request changes on a submission that is in needs_review state
     *
     * Request params:
     *   - id: submission ID
     *
     * Request body:
     *   - resumeToken: The resume token for verification
     *   - actor: Actor object (defaults to human actor if not provided)
     *   - fieldComments: Array of field-level comments with suggested changes
     *   - comment: Optional overall comment
     *
     * Response:
     *   - ok: true if successful
     *   - submissionId: The submission ID
     *   - state: New state after requesting changes (draft)
     *   - resumeToken: The resume token
     */
    async requestChanges(req: Request, res: Response, next: NextFunction) {
      try {
        const { id: submissionId } = req.params;
        const { resumeToken, fieldComments, comment } = req.body;

        if (!submissionId) {
          res.status(400).json({
            error: "Missing submission ID",
          });
          return;
        }

        if (!resumeToken) {
          res.status(400).json({
            error: "Missing resumeToken in request body",
          });
          return;
        }

        if (!fieldComments || !Array.isArray(fieldComments)) {
          res.status(400).json({
            error:
              "Missing or invalid fieldComments in request body (required array)",
          });
          return;
        }

        // Validate and extract actor from request body
        const actorResult = parseActor(req.body, {
          kind: "human",
          id: "human-reviewer",
          name: "Human Reviewer",
        });
        if (!actorResult.ok) {
          res.status(400).json({ error: `Invalid actor: ${actorResult.error}` });
          return;
        }
        const actor = actorResult.actor;

        // Call approval manager
        const result = await manager.requestChanges({
          submissionId,
          resumeToken,
          actor,
          fieldComments,
          comment,
        });

        // Check if result is an error
        if (!result.ok) {
          res.status(409).json(result);
          return;
        }

        res.status(200).json(result);
      } catch (error) {
        if (error instanceof SubmissionNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof InvalidResumeTokenError) {
          res.status(403).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  };
}

/**
 * Express router factory for approval routes
 * Usage:
 *   const approvalManager = new ApprovalManager(store, eventEmitter);
 *   const routes = createApprovalRoutes(approvalManager);
 *   app.post('/submissions/:id/approve', routes.approve);
 *   app.post('/submissions/:id/reject', routes.reject);
 *   app.post('/submissions/:id/request-changes', routes.requestChanges);
 */
