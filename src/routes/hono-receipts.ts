/**
 * Receipt routes (#15) — fetch + verify signed provenance receipts.
 *
 * GET  /receipts/:submissionId — the stored JWT-VC receipt (404 if none).
 * POST /receipts/verify        — verify a receipt JWT (501 if unsigned mode).
 *
 * Verify is public: a JWT-VC is self-contained and verifiable by anyone with
 * the public key, so the endpoint takes a `jwt` and returns {valid, reason?}.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { SubmissionManager } from "../core/submission-manager.js";
import type { ReceiptManager } from "../core/receipt-manager.js";

export function createHonoReceiptRouter(
  manager: SubmissionManager,
  receiptManager: ReceiptManager
): Hono {
  const router = new Hono();

  // GET /receipts/:submissionId — stored receipt (throws ReceiptNotFoundError → 404)
  router.get("/receipts/:submissionId", async (c: Context) => {
    const receipt = await manager.getReceipt(c.req.param("submissionId")!);
    return c.json(receipt);
  });

  // POST /receipts/verify — verify a receipt JWT (throws ReceiptSigningDisabledError → 501)
  router.post("/receipts/verify", async (c: Context) => {
    let body: { jwt?: unknown } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: { type: "invalid_request", message: "Invalid JSON body" } }, 400);
    }
    if (typeof body.jwt !== "string" || !body.jwt) {
      return c.json({ ok: false, error: { type: "invalid_request", message: "Missing 'jwt'" } }, 400);
    }
    const result = await receiptManager.verifyReceipt(body.jwt);
    return c.json(result);
  });

  return router;
}
