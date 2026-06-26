/**
 * AgentGate approval delegation (#12) — delegate the gate to AgentGate when
 * configured, with the local reviewer notification always as fallback.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AgentGateApprovalDelegate,
  approvalDelegateFromEnv,
} from "../agentgate-delegate.js";
import { ApprovalManager } from "../approval-manager.js";
import type { ApprovalDelegate, ReviewerNotification } from "../approval-manager.js";
import type { Submission } from "../../submission-types.js";
import type { SubmissionState } from "../../types/intake-contract.js";

const NOTIF: ReviewerNotification = {
  submissionId: "sub_1",
  intakeId: "intake_1",
  state: "needs_review" as SubmissionState,
  fields: { a: 1 },
  createdBy: { kind: "agent", id: "agt_x" },
  reviewerIds: ["r1"],
  reviewUrl: "https://x/review",
};

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("AgentGateApprovalDelegate (#12)", () => {
  it("enabled() requires both url and key", () => {
    expect(new AgentGateApprovalDelegate("https://gate", "k").enabled()).toBe(true);
    expect(new AgentGateApprovalDelegate("", "k").enabled()).toBe(false);
    expect(new AgentGateApprovalDelegate("https://gate", "").enabled()).toBe(false);
  });

  it("delegate() POSTs to /api/requests and returns the requestId", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, { id: "req_99" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await new AgentGateApprovalDelegate("https://gate/", "key").delegate(NOTIF);
    expect(r).toEqual({ requestId: "req_99" });
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("https://gate/api/requests"); // trailing slash trimmed
    const init = call[1] as { headers: Record<string, string>; body: string };
    expect(init.headers.Authorization).toBe("Bearer key");
    const body = JSON.parse(init.body);
    expect(body.action).toBe("formbridge.approval");
    expect(body.params.submissionId).toBe("sub_1");
    expect(body.context.source).toBe("formbridge");
  });

  it("delegate() returns null on a non-2xx (best-effort)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(500, {})));
    expect(await new AgentGateApprovalDelegate("https://gate", "k").delegate(NOTIF)).toBeNull();
  });

  it("delegate() never throws — returns null on a fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await new AgentGateApprovalDelegate("https://gate", "k").delegate(NOTIF)).toBeNull();
  });

  it("approvalDelegateFromEnv is undefined unless both vars are set", () => {
    expect(approvalDelegateFromEnv({} as NodeJS.ProcessEnv)).toBeUndefined();
    expect(approvalDelegateFromEnv({ FORMBRIDGE_AGENTGATE_URL: "https://g" } as NodeJS.ProcessEnv)).toBeUndefined();
    const d = approvalDelegateFromEnv({
      FORMBRIDGE_AGENTGATE_URL: "https://g",
      FORMBRIDGE_AGENTGATE_API_KEY: "k",
    } as NodeJS.ProcessEnv);
    expect(d?.enabled()).toBe(true);
  });
});

describe("ApprovalManager delegates the gate when configured (#12)", () => {
  const submission = {
    id: "sub_1",
    intakeId: "intake_1",
    state: "needs_review",
    fields: { a: 1 },
    createdBy: { kind: "agent", id: "agt_x" },
  } as unknown as Submission;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = {} as any;
  const emitter = { emit: vi.fn() } as unknown as { emit: () => Promise<void> };

  it("calls the delegate AND the local notifier (fallback always runs)", async () => {
    const delegate: ApprovalDelegate = { enabled: () => true, delegate: vi.fn(async () => ({ requestId: "req_1" })) };
    const notifier = { notifyReviewers: vi.fn(async () => {}) };
    await new ApprovalManager(store, emitter as never, notifier, delegate).notifyReviewers(submission, ["r1"], "https://x");
    expect(delegate.delegate).toHaveBeenCalledOnce();
    expect(notifier.notifyReviewers).toHaveBeenCalledOnce();
  });

  it("still notifies locally when the delegate throws (best-effort)", async () => {
    const delegate: ApprovalDelegate = { enabled: () => true, delegate: vi.fn(async () => { throw new Error("boom"); }) };
    const notifier = { notifyReviewers: vi.fn(async () => {}) };
    await new ApprovalManager(store, emitter as never, notifier, delegate).notifyReviewers(submission, ["r1"]);
    expect(notifier.notifyReviewers).toHaveBeenCalledOnce();
  });

  it("does not delegate when disabled", async () => {
    const delegate: ApprovalDelegate = { enabled: () => false, delegate: vi.fn() };
    const notifier = { notifyReviewers: vi.fn(async () => {}) };
    await new ApprovalManager(store, emitter as never, notifier, delegate).notifyReviewers(submission, ["r1"]);
    expect(delegate.delegate).not.toHaveBeenCalled();
    expect(notifier.notifyReviewers).toHaveBeenCalledOnce();
  });
});
