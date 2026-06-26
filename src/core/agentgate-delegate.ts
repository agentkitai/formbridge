/**
 * AgentGate approval delegate (#12).
 *
 * Routes FormBridge's approval gate to AgentGate (the org's approval gateway —
 * richer policy/identity/multi-channel HITL) by creating an approval request
 * when a submission needs review. Best-effort and OFF by default: enabled only
 * when FORMBRIDGE_AGENTGATE_URL + FORMBRIDGE_AGENTGATE_API_KEY are set, and a
 * failure never blocks review (the local reviewer notification is the fallback).
 */

import type { ApprovalDelegate, ReviewerNotification } from "./approval-manager.js";

export class AgentGateApprovalDelegate implements ApprovalDelegate {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 5000
  ) {}

  enabled(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async delegate(n: ReviewerNotification): Promise<{ requestId: string } | null> {
    if (!this.enabled()) return null;
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: "formbridge.approval",
          params: {
            submissionId: n.submissionId,
            intakeId: n.intakeId,
            reviewUrl: n.reviewUrl,
          },
          context: {
            source: "formbridge",
            createdBy: n.createdBy,
            reviewerIds: n.reviewerIds,
          },
          urgency: "normal",
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: string };
      return data?.id ? { requestId: data.id } : null;
    } catch {
      // best-effort: never throw into the approval flow
      return null;
    }
  }
}

/**
 * Build a delegate from env, or `undefined` when AgentGate isn't configured
 * (→ FormBridge uses its local approval flow, unchanged).
 */
export function approvalDelegateFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ApprovalDelegate | undefined {
  const baseUrl = env.FORMBRIDGE_AGENTGATE_URL;
  const apiKey = env.FORMBRIDGE_AGENTGATE_API_KEY;
  if (!baseUrl || !apiKey) return undefined;
  return new AgentGateApprovalDelegate(baseUrl, apiKey);
}
