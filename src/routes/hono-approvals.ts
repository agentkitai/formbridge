/**
 * Hono Approval Routes
 *
 * Provides Hono HTTP endpoints for approval workflow operations.
 *
 * Endpoints:
 * - POST /submissions/:id/approve — Approve a submission
 * - POST /submissions/:id/reject — Reject a submission
 * - POST /submissions/:id/request-changes — Request changes on a submission
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { ApprovalManager } from "../core/approval-manager.js";
import {
  SubmissionNotFoundError,
  InvalidResumeTokenError,
} from "../core/approval-manager.js";
import { parseActorWithFallback as parseActor } from "./shared/actor-validation.js";

/**
 * Creates a Hono router with approval endpoints.
 */
export function createHonoApprovalRouter(
  manager: ApprovalManager
): Hono {
  const router = new Hono();

  /**
   * POST /submissions/:id/approve
   */
  router.post("/submissions/:id/approve", async (c: Context) => {
    const submissionId = c.req.param("id");

    if (!submissionId) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing submission ID" } },
        400
      );
    }

    const body = await c.req.json();
    const { resumeToken, comment } = body;

    if (!resumeToken) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing resumeToken in request body" } },
        400
      );
    }

    const actorResult = parseActor(body, {
      kind: "human",
      id: "human-reviewer",
      name: "Human Reviewer",
    });
    if (!actorResult.ok) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: `Invalid actor: ${actorResult.error}` } },
        400
      );
    }

    try {
      const result = await manager.approve({
        submissionId,
        resumeToken,
        actor: actorResult.actor,
        comment,
      });

      if (!result.ok) {
        return c.json(result, 409);
      }

      return c.json(result);
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        return c.json(
          { ok: false, error: { type: "not_found", message: error.message } },
          404
        );
      }
      if (error instanceof InvalidResumeTokenError) {
        return c.json(
          { ok: false, error: { type: "invalid_resume_token", message: error.message } },
          403
        );
      }
      throw error;
    }
  });

  /**
   * POST /submissions/:id/reject
   */
  router.post("/submissions/:id/reject", async (c: Context) => {
    const submissionId = c.req.param("id");

    if (!submissionId) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing submission ID" } },
        400
      );
    }

    const body = await c.req.json();
    const { resumeToken, reason, comment } = body;

    if (!resumeToken) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing resumeToken in request body" } },
        400
      );
    }

    if (!reason) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing reason in request body (required for rejection)" } },
        400
      );
    }

    const actorResult = parseActor(body, {
      kind: "human",
      id: "human-reviewer",
      name: "Human Reviewer",
    });
    if (!actorResult.ok) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: `Invalid actor: ${actorResult.error}` } },
        400
      );
    }

    try {
      const result = await manager.reject({
        submissionId,
        resumeToken,
        actor: actorResult.actor,
        reason,
        comment,
      });

      if (!result.ok) {
        return c.json(result, 409);
      }

      return c.json(result);
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        return c.json(
          { ok: false, error: { type: "not_found", message: error.message } },
          404
        );
      }
      if (error instanceof InvalidResumeTokenError) {
        return c.json(
          { ok: false, error: { type: "invalid_resume_token", message: error.message } },
          403
        );
      }
      throw error;
    }
  });

  /**
   * POST /submissions/:id/request-changes
   */
  router.post("/submissions/:id/request-changes", async (c: Context) => {
    const submissionId = c.req.param("id");

    if (!submissionId) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing submission ID" } },
        400
      );
    }

    const body = await c.req.json();
    const { resumeToken, fieldComments, comment } = body;

    if (!resumeToken) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing resumeToken in request body" } },
        400
      );
    }

    if (!fieldComments || !Array.isArray(fieldComments)) {
      return c.json(
        {
          ok: false,
          error: {
            type: "invalid_request",
            message: "Missing or invalid fieldComments in request body (required array)",
          },
        },
        400
      );
    }

    const actorResult = parseActor(body, {
      kind: "human",
      id: "human-reviewer",
      name: "Human Reviewer",
    });
    if (!actorResult.ok) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: `Invalid actor: ${actorResult.error}` } },
        400
      );
    }

    try {
      const result = await manager.requestChanges({
        submissionId,
        resumeToken,
        actor: actorResult.actor,
        fieldComments,
        comment,
      });

      if (!result.ok) {
        return c.json(result, 409);
      }

      return c.json(result);
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        return c.json(
          { ok: false, error: { type: "not_found", message: error.message } },
          404
        );
      }
      if (error instanceof InvalidResumeTokenError) {
        return c.json(
          { ok: false, error: { type: "invalid_resume_token", message: error.message } },
          403
        );
      }
      throw error;
    }
  });

  return router;
}
