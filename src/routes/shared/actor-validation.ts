/**
 * Shared actor validation utilities for route handlers.
 *
 * Provides Zod-based actor schema validation used across
 * submission, approval, and app route handlers.
 */

import { z } from "zod";
import type { Actor } from "../../types/intake-contract.js";

/** Zod schema for strict actor validation */
export const actorSchema = z
  .object({
    kind: z.enum(["agent", "human", "system"]),
    id: z.string().min(1).max(255),
    name: z.string().max(255).optional(),
  })
  .strict();

/**
 * Parse and validate actor from raw input.
 * Returns validated actor or error message.
 */
export function parseActor(
  raw: unknown
): { ok: true; actor: Actor } | { ok: false; error: string } {
  const result = actorSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid actor" };
  }
  return { ok: true, actor: result.data as Actor };
}

/**
 * Parse actor from request body with optional fallback.
 * If body.actor is missing and fallback is provided, uses fallback.
 */
export function parseActorWithFallback(
  body: Record<string, unknown>,
  fallback: Actor
): { ok: true; actor: Actor } | { ok: false; error: string } {
  const raw = body?.actor;
  if (!raw) return { ok: true, actor: fallback };
  return parseActor(raw);
}
