/**
 * Tests for the opt-in human-handoff webhook notifier.
 */
import { describe, it, expect, vi } from "vitest";
import { notifyHandoff } from "../handoff-notifier.js";

const sampleNotification = {
  submissionId: "sub_123",
  intakeId: "intake_test",
  resumeUrl: "http://localhost:3000/resume?token=rtok_abc",
};

describe("notifyHandoff", () => {
  it("is a no-op when no URL is configured (does not call fetch)", async () => {
    const fetchFn = vi.fn();
    await notifyHandoff(undefined, sampleNotification, fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("POSTs a JSON payload with the ids and resume URL when a URL is set", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await notifyHandoff("https://hooks.example.com/x", sampleNotification, fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/x");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const payload = JSON.parse(init.body);
    expect(payload.submissionId).toBe("sub_123");
    expect(payload.intakeId).toBe("intake_test");
    expect(payload.resumeUrl).toBe(sampleNotification.resumeUrl);
    // Slack-compatible text field
    expect(payload.text).toContain(sampleNotification.resumeUrl);
  });

  it("swallows delivery errors so handoff generation never breaks", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      notifyHandoff("https://hooks.example.com/x", sampleNotification, fetchFn as unknown as typeof fetch)
    ).resolves.toBeUndefined();
  });
});
