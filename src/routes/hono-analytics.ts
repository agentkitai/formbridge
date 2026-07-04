/**
 * Analytics HTTP routes for the Admin Dashboard.
 *
 * GET /analytics/summary — Overview metrics
 * GET /analytics/volume  — Submission volume over time
 */

import { Hono } from "hono";
import type { IntakeEvent } from "../types/intake-contract.js";

/**
 * Analytics data provider interface.
 *
 * Decouples the analytics route from specific storage implementations.
 * Consumers provide callbacks to query their data.
 */
/** Per-intake breakdown metrics */
export interface IntakeMetrics {
  intakeId: string;
  total: number;
  byState: Record<string, number>;
  completionRate: number;
}

/**
 * A value that may be returned synchronously or as a Promise. The analytics
 * route awaits every provider call, so providers backed by a synchronous
 * in-memory store OR an async durable store both satisfy this contract.
 */
type Awaitable<T> = T | Promise<T>;

export interface AnalyticsDataProvider {
  /** Returns all registered intake IDs */
  getIntakeIds(): Awaitable<string[]>;
  /** Returns the total number of submissions across all intakes */
  getTotalSubmissions(): Awaitable<number>;
  /** Returns count of submissions in the "submitted" state (pending approval) */
  getPendingApprovalCount(): Awaitable<number>;
  /** Returns submission counts by state */
  getSubmissionsByState(): Awaitable<Record<string, number>>;
  /** Returns the most recent events (up to limit) */
  getRecentEvents(limit: number): Awaitable<IntakeEvent[]>;
  /** Returns events of a given type */
  getEventsByType(type: string): Awaitable<IntakeEvent[]>;
  /** Returns per-intake submission breakdown */
  getSubmissionsByIntake(): Awaitable<IntakeMetrics[]>;
  /** Returns state-transition funnel data */
  getCompletionRates(): Awaitable<{ state: string; count: number; percentage: number }[]>;
}

export function createHonoAnalyticsRouter(
  provider: AnalyticsDataProvider
): Hono {
  const app = new Hono();

  /**
   * GET /analytics/summary
   *
   * Returns aggregate metrics:
   * - totalIntakes, totalSubmissions, pendingApprovals
   * - submissionsByState breakdown
   * - recentActivity (last 20 events)
   */
  app.get("/analytics/summary", async (c) => {
    const intakeIds = await provider.getIntakeIds();
    const totalIntakes = intakeIds.length;
    const totalSubmissions = await provider.getTotalSubmissions();
    const pendingApprovals = await provider.getPendingApprovalCount();
    const submissionsByState = await provider.getSubmissionsByState();
    const recentActivity = await provider.getRecentEvents(20);

    return c.json({
      totalIntakes,
      totalSubmissions,
      pendingApprovals,
      submissionsByState,
      recentActivity,
    });
  });

  /**
   * GET /analytics/volume?days=30
   *
   * Returns daily submission counts for the given number of days.
   */
  app.get("/analytics/volume", async (c) => {
    const days = Math.min(Number(c.req.query("days") ?? 30), 365);

    const createdEvents = await provider.getEventsByType("submission.created");

    // Build date -> count map
    const volumeMap: Record<string, number> = {};
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      volumeMap[key] = 0;
    }

    for (const event of createdEvents) {
      const dateKey = event.ts.slice(0, 10);
      if (dateKey in volumeMap) {
        volumeMap[dateKey] = (volumeMap[dateKey] ?? 0) + 1;
      }
    }

    const volumeData = Object.entries(volumeMap).map(([date, count]) => ({
      date,
      count,
    }));

    return c.json(volumeData);
  });

  /**
   * GET /analytics/intakes
   *
   * Returns per-intake breakdown: total, byState, completionRate.
   */
  app.get("/analytics/intakes", async (c) => {
    const metrics = await provider.getSubmissionsByIntake();
    return c.json(metrics);
  });

  /**
   * GET /analytics/funnel
   *
   * Returns state-transition funnel data showing how many submissions
   * reached each state and the percentage relative to total.
   */
  app.get("/analytics/funnel", async (c) => {
    const funnel = await provider.getCompletionRates();
    return c.json(funnel);
  });

  return app;
}
