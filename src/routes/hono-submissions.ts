/**
 * Hono Submission Routes
 *
 * Provides Hono HTTP endpoints for submission operations including:
 * - Agent-to-human handoff URL generation
 * - Resume token lookup
 * - Handoff resumed event emission
 * - Submit a submission for processing
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { SubmissionManager } from "../core/submission-manager.js";
import {
  SubmissionNotFoundError,
  SubmissionExpiredError,
  InvalidResumeTokenError,
} from "../core/submission-manager.js";
import type { Actor } from "../types/intake-contract.js";
import { parseActorWithFallback as parseActor } from "./shared/actor-validation.js";

/**
 * Creates a Hono router with submission endpoints.
 *
 * Endpoints:
 * - POST /submissions/:id/handoff — Generate resume URL for agent-to-human handoff
 * - GET /submissions/resume/:resumeToken — Fetch submission by resume token
 * - POST /submissions/resume/:resumeToken/resumed — Emit HANDOFF_RESUMED event
 * - POST /intake/:intakeId/submissions/:submissionId/submit — Submit for processing
 */
export function createHonoSubmissionRouter(
  manager: SubmissionManager
): Hono {
  const router = new Hono();

  /**
   * POST /submissions/:id/handoff
   * Generate a resume URL for agent-to-human handoff
   */
  router.post("/submissions/:id/handoff", async (c: Context) => {
    const submissionId = c.req.param("id");

    if (!submissionId) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing submission ID" } },
        400
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await c.req.json();
    } catch {
      // Body is optional for handoff
    }

    const actorResult = parseActor(body, {
      kind: "system",
      id: "system",
      name: "System",
    });
    if (!actorResult.ok) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: `Invalid actor: ${actorResult.error}` } },
        400
      );
    }

    try {
      const resumeUrl = await manager.generateHandoffUrl(
        submissionId,
        actorResult.actor
      );
      const resumeTokenMatch = new URL(resumeUrl).searchParams.get("token");

      return c.json({
        resumeUrl,
        submissionId,
        resumeToken: resumeTokenMatch,
      });
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        return c.json(
          { ok: false, error: { type: "not_found", message: error.message } },
          404
        );
      }
      throw error;
    }
  });

  /**
   * GET /submissions/resume/:resumeToken
   * Fetch submission data by resume token
   */
  router.get("/submissions/resume/:resumeToken", async (c: Context) => {
    const resumeToken = c.req.param("resumeToken");

    if (!resumeToken) {
      return c.json(
        { ok: false, error: { type: "invalid_request", message: "Missing resume token" } },
        400
      );
    }

    const submission = await manager.getSubmissionByResumeToken(resumeToken);

    if (!submission) {
      return c.json(
        {
          ok: false,
          error: {
            type: "not_found",
            message: "Submission not found. The resume link may be invalid or expired.",
          },
        },
        404
      );
    }

    if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
      return c.json(
        {
          ok: false,
          error: { type: "expired", message: "This resume link has expired." },
        },
        403
      );
    }

    // Get intake schema and details from the manager
    const intakeDetails = await manager.getIntakeDetailsForSubmission(submission);

    return c.json({
      id: submission.id,
      intakeId: submission.intakeId,
      state: submission.state,
      fields: submission.fields,
      fieldAttribution: submission.fieldAttribution,
      expiresAt: submission.expiresAt,
      schema: intakeDetails.schema,
    });
  });

  /**
   * POST /submissions/resume/:resumeToken/resumed
   * Emit HANDOFF_RESUMED event when human opens the resume form
   */
  router.post(
    "/submissions/resume/:resumeToken/resumed",
    async (c: Context) => {
      const resumeToken = c.req.param("resumeToken");

      if (!resumeToken) {
        return c.json(
          { ok: false, error: { type: "invalid_request", message: "Missing resume token" } },
          400
        );
      }

      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        // Body is optional
      }

      const actorResult = parseActor(body, {
        kind: "human",
        id: "human-unknown",
        name: "Human User",
      });
      if (!actorResult.ok) {
        return c.json(
          { ok: false, error: { type: "invalid_request", message: `Invalid actor: ${actorResult.error}` } },
          400
        );
      }

      try {
        const eventId = await manager.emitHandoffResumed(
          resumeToken,
          actorResult.actor
        );
        return c.json({ ok: true, eventId });
      } catch (error) {
        if (error instanceof SubmissionNotFoundError) {
          return c.json(
            { ok: false, error: { type: "not_found", message: error.message } },
            404
          );
        }
        if (error instanceof SubmissionExpiredError) {
          return c.json(
            { ok: false, error: { type: "expired", message: error.message } },
            403
          );
        }
        throw error;
      }
    }
  );

  /**
   * POST /intake/:intakeId/submissions/:submissionId/submit
   * Submit a submission for processing
   */
  router.post(
    "/intake/:intakeId/submissions/:submissionId/submit",
    async (c: Context) => {
      const submissionId = c.req.param("submissionId");

      const body = await c.req.json();

      if (!body.resumeToken) {
        return c.json(
          { ok: false, error: { type: "invalid_request", message: "resumeToken is required" } },
          400
        );
      }

      if (!body.actor || !body.actor.kind || !body.actor.id) {
        return c.json(
          { ok: false, error: { type: "invalid_request", message: "actor with kind and id is required" } },
          400
        );
      }

      try {
        const result = await manager.submit({
          submissionId,
          resumeToken: body.resumeToken,
          actor: body.actor as Actor,
          idempotencyKey: body.idempotencyKey,
        });

        if (!result.ok) {
          const errorResult = result as { ok: false; error: { type: string } };
          const status =
            errorResult.error.type === "conflict"
              ? 409
              : errorResult.error.type === "needs_approval"
                ? 202
                : 400;
          return c.json(result, status);
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
            { ok: false, error: { type: "invalid_resume_token", message: "Resume token is invalid or stale" } },
            409
          );
        }
        throw error;
      }
    }
  );

  return router;
}
