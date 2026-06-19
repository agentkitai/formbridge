/**
 * Handoff notifier — fires a single outbound webhook when an agent-to-human
 * handoff resume URL is created, so a human actually gets pinged.
 *
 * Opt-in: if `url` is empty/undefined this is a no-op (no behavior change).
 * The payload shape is Slack incoming-webhook compatible (`text` field) while
 * also carrying the structured ids for non-Slack consumers.
 *
 * ponytail: one generic webhook, plain fetch, no retry/queue. A missed
 * notification is non-fatal — the resume URL is still returned and persisted
 * via the handoff.link_issued event. No plugin system, no extra channels.
 */

import { getLogger } from "../logging.js";

export interface HandoffNotification {
  submissionId: string;
  intakeId: string;
  resumeUrl: string;
}

/**
 * POST a small JSON notification to `url`. Never throws — delivery failures are
 * logged and swallowed so they can't break handoff URL generation.
 */
export async function notifyHandoff(
  url: string | undefined,
  notification: HandoffNotification,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<void> {
  if (!url) return;

  const body = JSON.stringify({
    text: `New form handoff ready for review: ${notification.resumeUrl}`,
    submissionId: notification.submissionId,
    intakeId: notification.intakeId,
    resumeUrl: notification.resumeUrl,
  });

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      getLogger().warn(
        { logger: "handoff-notifier", status: res.status, submissionId: notification.submissionId },
        "handoff notification returned non-2xx"
      );
    }
  } catch (err) {
    getLogger().warn(
      { logger: "handoff-notifier", err, submissionId: notification.submissionId },
      "handoff notification delivery failed"
    );
  }
}
