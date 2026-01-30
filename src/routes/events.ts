/**
 * Event HTTP Routes
 * Provides HTTP endpoints for retrieving submission event streams
 */

import type { Request, Response, NextFunction } from "express";
import type { SubmissionManager } from "../core/submission-manager";
import { SubmissionNotFoundError } from "../core/submission-manager";

/**
 * Create event routes
 * @param manager - SubmissionManager instance for handling submission operations
 */
export function createEventRoutes(manager: SubmissionManager) {
  return {
    /**
     * GET /submissions/:id/events
     * Retrieve the full event stream for a submission
     *
     * Request params:
     *   - id: submission ID
     *
     * Response:
     *   - events: Array of IntakeEvent objects with full audit trail
     */
    async getEvents(req: Request, res: Response, next: NextFunction) {
      try {
        const { id: submissionId } = req.params;

        if (!submissionId) {
          res.status(400).json({
            error: "Missing submission ID",
          });
          return;
        }

        // Fetch submission by ID
        const submission = await manager.getSubmission(submissionId);

        if (!submission) {
          res.status(404).json({
            error: "Submission not found",
          });
          return;
        }

        // Return the event stream
        res.status(200).json({
          submissionId: submission.id,
          events: submission.events || [],
        });
      } catch (error) {
        if (error instanceof SubmissionNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  };
}

/**
 * Express router factory for event routes
 * @param manager - SubmissionManager instance
 * @returns Object with event route handlers
 */
export function createEventRouter(manager: SubmissionManager) {
  // This would be used with Express like:
  // const router = express.Router();
  // const routes = createEventRoutes(manager);
  // router.get('/submissions/:id/events', routes.getEvents);
  // return router;

  return createEventRoutes(manager);
}
