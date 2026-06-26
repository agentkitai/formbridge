/**
 * Provenance receipt signing (#15) — crypto correctness + finalize integration.
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "crypto";
import * as jose from "jose";

import { ReceiptManager, canonicalJson } from "../../src/core/receipt-manager.js";
import { ReceiptSigningDisabledError } from "../../src/core/errors.js";
import { SubmissionManager } from "../../src/core/submission-manager.js";
import type { Submission } from "../../src/submission-types.js";
import type { IntakeEvent } from "../../src/types/intake-contract.js";

const ISSUER = "https://fb.test";
const ACTOR = { kind: "agent" as const, id: "agent-1", name: "A" };
const FINALIZED_AT = "2026-06-26T01:00:00.000Z";

function ed25519Pem(): string {
  const { privateKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return privateKey as string;
}

function fakeSubmission(state: Submission["state"] = "submitted"): Submission {
  return {
    id: "sub_1",
    intakeId: "intake_1",
    state,
    resumeToken: "rtok_x",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    fields: { name: "Alice", age: 30 },
    fieldAttribution: { name: ACTOR },
    fieldConfidence: { name: 0.9 },
    createdBy: ACTOR,
    updatedBy: ACTOR,
    events: [],
  } as unknown as Submission;
}

describe("ReceiptManager (#15)", () => {
  it("signs + verifies a JWT-VC round-trip; embeds attribution but NOT raw values", async () => {
    const rm = new ReceiptManager({ privateKeyPem: ed25519Pem(), issuer: ISSUER });
    const r = await rm.signReceipt(fakeSubmission(), ACTOR, FINALIZED_AT);
    expect(r.signed).toBe(true);
    expect(r.jwt).toBeTruthy();

    const v = await rm.verifyReceipt(r.jwt);
    expect(v.valid).toBe(true);
    expect(v.claims?.sub).toBe("urn:formbridge:submission:sub_1");
    const vc = v.claims?.["vc"] as { type: string[]; credentialSubject: Record<string, unknown> };
    expect(vc.type).toContain("FormBridgeProvenanceReceipt");
    expect((vc.credentialSubject["fieldAttribution"] as Record<string, { id: string }>).name.id).toBe("agent-1");
    expect(vc.credentialSubject["contentHash"]).toMatch(/^sha256:/);
    // PII safety: raw field VALUES must not appear in the signed credential.
    expect(JSON.stringify(vc.credentialSubject)).not.toContain("Alice");
  });

  it("rejects a tampered JWT", async () => {
    const rm = new ReceiptManager({ privateKeyPem: ed25519Pem(), issuer: ISSUER });
    const r = await rm.signReceipt(fakeSubmission(), ACTOR, FINALIZED_AT);
    const [h, p, s] = r.jwt.split(".");
    const tampered = `${h}.${p!.slice(0, -3)}AAA.${s}`;
    const v = await rm.verifyReceipt(tampered);
    expect(v.valid).toBe(false);
  });

  it("rejects a receipt signed by a different key", async () => {
    const rmA = new ReceiptManager({ privateKeyPem: ed25519Pem(), issuer: ISSUER });
    const rmB = new ReceiptManager({ privateKeyPem: ed25519Pem(), issuer: ISSUER });
    const r = await rmA.signReceipt(fakeSubmission(), ACTOR, FINALIZED_AT);
    expect((await rmB.verifyReceipt(r.jwt)).valid).toBe(false);
  });

  it("JWKS exposes the public key whose kid matches the JWT header (RFC-7638 thumbprint)", async () => {
    const rm = new ReceiptManager({ privateKeyPem: ed25519Pem(), issuer: ISSUER });
    const r = await rm.signReceipt(fakeSubmission(), ACTOR, FINALIZED_AT);
    const header = jose.decodeProtectedHeader(r.jwt);
    const { keys } = await rm.getJwks();
    expect(keys).toHaveLength(1);
    expect(keys[0]!.kid).toBe(header.kid);
    expect(keys[0]).not.toHaveProperty("d"); // public only — never leak the private scalar
  });

  it("contentHash is field-order independent", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("unsigned fallback: no key → unsigned receipt, empty JWKS, verify throws 501", async () => {
    const rm = new ReceiptManager({ issuer: ISSUER });
    expect(await rm.isSigningEnabled()).toBe(false);
    const r = await rm.signReceipt(fakeSubmission(), ACTOR, FINALIZED_AT);
    expect(r.signed).toBe(false);
    expect(r.jwt).toBe("");
    expect((await rm.getJwks()).keys).toHaveLength(0);
    await expect(rm.verifyReceipt("x.y.z")).rejects.toBeInstanceOf(ReceiptSigningDisabledError);
  });
});

// ── finalize() integration ───────────────────────────────────────────
class MockStore {
  map = new Map<string, Submission>();
  async get(id: string) {
    return this.map.get(id) ?? null;
  }
  async save(s: Submission) {
    this.map.set(s.id, s);
  }
  async getByResumeToken() {
    return null;
  }
}
class MockEmitter {
  events: IntakeEvent[] = [];
  async emit(e: IntakeEvent) {
    this.events.push(e);
  }
}

describe("SubmissionManager.finalize (#15)", () => {
  it("transitions submitted→finalized, issues + stores a signed receipt, emits the event", async () => {
    const store = new MockStore();
    const emitter = new MockEmitter();
    const receiptManager = new ReceiptManager({ privateKeyPem: ed25519Pem(), issuer: ISSUER });
    const manager = new SubmissionManager({ store: store as never, eventEmitter: emitter as never, receiptManager });
    await store.save(fakeSubmission("submitted"));

    const { submission, receipt } = await manager.finalize("sub_1", ACTOR);
    expect(submission.state).toBe("finalized");
    expect(receipt?.signed).toBe(true);
    expect(submission.receipt?.jwt).toBe(receipt?.jwt);
    expect(emitter.events.some((e) => e.type === "submission.finalized")).toBe(true);
    expect((await receiptManager.verifyReceipt(receipt!.jwt)).valid).toBe(true);
  });

  it("is idempotent — re-finalizing returns the stored receipt without re-issuing", async () => {
    const store = new MockStore();
    const receiptManager = new ReceiptManager({ privateKeyPem: ed25519Pem(), issuer: ISSUER });
    const manager = new SubmissionManager({ store: store as never, eventEmitter: new MockEmitter() as never, receiptManager });
    await store.save(fakeSubmission("submitted"));

    const first = await manager.finalize("sub_1", ACTOR);
    const second = await manager.finalize("sub_1", ACTOR);
    expect(second.receipt?.jti).toBe(first.receipt?.jti);
  });
});
