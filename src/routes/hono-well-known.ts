/**
 * Well-known routes (#15) — publishes the public key for verifying provenance
 * receipts. External parties fetch this to verify a receipt JWT-VC offline.
 *
 * GET /.well-known/jwks.json — Ed25519 public JWK set (empty when unsigned).
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { ReceiptManager } from "../core/receipt-manager.js";

export function createHonoWellKnownRouter(receiptManager: ReceiptManager): Hono {
  const router = new Hono();

  router.get("/.well-known/jwks.json", async (c: Context) => {
    const jwks = await receiptManager.getJwks();
    return c.json(jwks);
  });

  return router;
}
