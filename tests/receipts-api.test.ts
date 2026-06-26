/**
 * Receipt HTTP routes (#15) — JWKS + verify endpoint wiring.
 * Exercises loadReceiptManagerFromEnv + route mounting end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateKeyPairSync } from "crypto";

import { createFormBridgeAppWithIntakes } from "../src/index.js";
import { ReceiptManager } from "../src/core/receipt-manager.js";
import type { Submission } from "../src/submission-types.js";

const PEM = (() => {
  const { privateKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return privateKey as string;
})();

// The app defaults its issuer to baseUrl when FORMBRIDGE_RECEIPT_ISSUER is unset.
const ISSUER = "http://localhost:3000";
const ACTOR = { kind: "agent" as const, id: "a1" };

function fakeSubmission(): Submission {
  return {
    id: "sub_http_1",
    intakeId: "intake_1",
    state: "submitted",
    resumeToken: "rtok",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    fields: { name: "Bob" },
    fieldAttribution: { name: ACTOR },
    createdBy: ACTOR,
    updatedBy: ACTOR,
    events: [],
  } as unknown as Submission;
}

describe("receipt routes (#15)", () => {
  let app: ReturnType<typeof createFormBridgeAppWithIntakes>;

  beforeAll(() => {
    process.env["FORMBRIDGE_RECEIPT_PRIVATE_KEY"] = PEM;
    app = createFormBridgeAppWithIntakes([]);
  });
  afterAll(() => {
    delete process.env["FORMBRIDGE_RECEIPT_PRIVATE_KEY"];
  });

  it("GET /.well-known/jwks.json serves the Ed25519 public key (no private scalar)", async () => {
    const res = await app.request("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].kty).toBe("OKP");
    expect(body.keys[0].crv).toBe("Ed25519");
    expect(body.keys[0]).not.toHaveProperty("d");
  });

  it("POST /receipts/verify validates a receipt signed with the configured key", async () => {
    const rm = new ReceiptManager({ privateKeyPem: PEM, issuer: ISSUER });
    const r = await rm.signReceipt(fakeSubmission(), ACTOR, "2026-06-26T01:00:00.000Z");
    const res = await app.request("/receipts/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jwt: r.jwt }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it("POST /receipts/verify rejects a missing jwt with 400", async () => {
    const res = await app.request("/receipts/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
