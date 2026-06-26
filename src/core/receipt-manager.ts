/**
 * Provenance receipts (#15) — a signed, portable proof of a finalized
 * submission's provenance: who filled which fields (agent vs human), at what
 * confidence, plus a content digest of the values.
 *
 * Format: JWT-VC — a compact JWS (EdDSA/Ed25519) whose payload carries a W3C
 * `vc` claim. Verifiable by anyone holding the public key, which is published
 * at `/.well-known/jwks.json`. This mirrors the agentlens evidence-pack signing
 * *patterns* (deterministic canonicalization, pluggable/optional signing, a
 * /verify path) but is ASYMMETRIC — a receipt handed to an external party must
 * be verifiable without sharing a secret, which HMAC can't do.
 *
 * PII: raw field VALUES are NOT embedded. They're attested via a SHA-256
 * `contentHash` over the canonical field JSON, so the receipt proves integrity
 * without leaking data. Attribution (field→actor) and confidence ARE embedded —
 * that's the provenance the receipt exists to certify.
 *
 * Optional-key fallback (mirrors agentlens): with no signing key configured,
 * finalize still succeeds and stores an unsigned marker, /verify returns 501,
 * and JWKS serves an empty key set.
 */

import { createHash, createPrivateKey, createPublicKey, randomUUID } from "crypto";
import * as jose from "jose";

import type { Submission } from "../submission-types.js";
import { ReceiptSigningDisabledError } from "./errors.js";

const ALG = "EdDSA";
const VC_TYPE = "FormBridgeProvenanceReceipt";
const VC_CONTEXT = [
  "https://www.w3.org/2018/credentials/v1",
  "https://formbridge.dev/credentials/provenance/v1",
];

/** What gets stored on a finalized submission + returned from finalize. */
export interface ProvenanceReceipt {
  /** Compact JWS (the JWT-VC). Empty string when unsigned. */
  jwt: string;
  jti: string;
  /** RFC-7638 thumbprint of the signing key; "" when unsigned. */
  kid: string;
  alg: "EdDSA";
  iss: string;
  iat: number;
  signed: boolean;
}

export interface ReceiptVerification {
  valid: boolean;
  reason?: string;
  claims?: jose.JWTPayload;
}

export interface ReceiptManagerConfig {
  /** PKCS8 PEM Ed25519 private key. Unset → unsigned mode. */
  privateKeyPem?: string;
  /** Credential issuer (`iss`). */
  issuer: string;
  /** Override the kid; defaults to the RFC-7638 JWK thumbprint. */
  kid?: string;
}

// ── Canonicalization (copied from agentlens evidence.ts so the contentHash is
// reorder-stable: same fields in any key order → same digest) ──────────────
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    return Object.keys(src)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(src[k]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export class ReceiptManager {
  private readonly issuer: string;
  private privateKey?: ReturnType<typeof createPrivateKey>;
  private publicJwk?: jose.JWK;
  private kid = "";
  private localJwks?: ReturnType<typeof jose.createLocalJWKSet>;
  /** Resolves once the (async) key import is done. All methods await it. */
  readonly ready: Promise<void>;

  constructor(config: ReceiptManagerConfig) {
    this.issuer = config.issuer;
    this.ready = this.init(config);
  }

  private async init(config: ReceiptManagerConfig): Promise<void> {
    if (!config.privateKeyPem) return; // unsigned mode
    this.privateKey = createPrivateKey(config.privateKeyPem);
    const publicKey = createPublicKey(this.privateKey);
    const jwk = await jose.exportJWK(publicKey); // public only — never carries 'd'
    this.kid = config.kid ?? (await jose.calculateJwkThumbprint(jwk, "sha256"));
    this.publicJwk = { ...jwk, kid: this.kid, use: "sig", alg: ALG };
    this.localJwks = jose.createLocalJWKSet({ keys: [this.publicJwk] });
  }

  async isSigningEnabled(): Promise<boolean> {
    await this.ready;
    return this.privateKey !== undefined;
  }

  /** Build the JWT-VC claim set for a submission (no signing). */
  buildClaims(submission: Submission, finalizedBy: Submission["createdBy"], finalizedAt: string) {
    const sub = `urn:formbridge:submission:${submission.id}`;
    const contentHash =
      "sha256:" + createHash("sha256").update(canonicalJson(submission.fields)).digest("hex");
    const credentialSubject = {
      id: sub,
      intakeId: submission.intakeId,
      tenantId: submission.tenantId ?? "default",
      state: "finalized" as const,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      finalizedAt,
      createdBy: submission.createdBy,
      finalizedBy,
      fieldAttribution: submission.fieldAttribution,
      fieldConfidence: submission.fieldConfidence ?? {},
      contentHash,
      eventCount: submission.events.length,
      // Summaries only — no destinationUrl/error/comment (avoid leaking PII/internal detail).
      deliveries: (submission.deliveries ?? []).map((d) => ({
        deliveryId: d.deliveryId,
        status: d.status,
        statusCode: d.statusCode,
        attempts: d.attempts,
      })),
      reviewDecisions: (submission.reviewDecisions ?? []).map((r) => ({
        action: r.action,
        actor: r.actor,
        timestamp: r.timestamp,
      })),
    };
    return {
      iss: this.issuer,
      sub,
      iat: Math.floor(Date.parse(finalizedAt) / 1000),
      jti: `urn:uuid:${randomUUID()}`,
      vc: { "@context": VC_CONTEXT, type: ["VerifiableCredential", VC_TYPE], credentialSubject },
    };
  }

  /**
   * Issue a receipt for a finalized submission. Returns a signed JWT-VC when a
   * key is configured, else an unsigned marker (signed:false, jwt:"").
   */
  async signReceipt(
    submission: Submission,
    finalizedBy: Submission["createdBy"],
    finalizedAt: string
  ): Promise<ProvenanceReceipt> {
    await this.ready;
    const claims = this.buildClaims(submission, finalizedBy, finalizedAt);
    if (!this.privateKey) {
      return { jwt: "", jti: claims.jti, kid: "", alg: ALG, iss: this.issuer, iat: claims.iat, signed: false };
    }
    const jwt = await new jose.SignJWT(claims)
      .setProtectedHeader({ alg: ALG, typ: "vc+jwt", kid: this.kid })
      .sign(this.privateKey);
    return { jwt, jti: claims.jti, kid: this.kid, alg: ALG, iss: this.issuer, iat: claims.iat, signed: true };
  }

  /** Verify a receipt JWT against the in-process public key. */
  async verifyReceipt(jwt: string): Promise<ReceiptVerification> {
    await this.ready;
    if (!this.localJwks) throw new ReceiptSigningDisabledError();
    try {
      const { payload } = await jose.jwtVerify(jwt, this.localJwks, {
        issuer: this.issuer,
        algorithms: [ALG],
      });
      return { valid: true, claims: payload };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Public key set for `/.well-known/jwks.json`. Empty when unsigned. */
  async getJwks(): Promise<{ keys: jose.JWK[] }> {
    await this.ready;
    return { keys: this.publicJwk ? [this.publicJwk] : [] };
  }
}

/** Build a ReceiptManager from env. Unset key → unsigned mode. */
export function loadReceiptManagerFromEnv(baseUrl: string): ReceiptManager {
  return new ReceiptManager({
    privateKeyPem: process.env["FORMBRIDGE_RECEIPT_PRIVATE_KEY"] || undefined,
    issuer: process.env["FORMBRIDGE_RECEIPT_ISSUER"] || baseUrl,
    kid: process.env["FORMBRIDGE_RECEIPT_KID"] || undefined,
  });
}
