/**
 * Vercel AI SDK prefill adapter (#17).
 *
 * Maps a Vercel AI SDK `generateObject` result into a FormBridge create/set
 * payload — the structured object's fields become field values, attributed to
 * the calling agent, with optional per-field confidence (#16). Pure: no I/O, so
 * it composes with `SubmissionManager.createSubmission` / `setFields`.
 *
 *   const { object } = await generateObject({ model, schema, prompt });
 *   await manager.createSubmission({
 *     intakeId,
 *     ...prefillFromGenerateObject({ object }, { actor }),
 *   });
 */

import type { Actor } from "../types/intake-contract.js";

/** The relevant slice of a Vercel AI SDK `generateObject` result. */
export interface GenerateObjectLike {
  object: unknown;
}

export interface PrefillOptions {
  /** The agent actor that produced the object — recorded as field attribution. */
  actor: Actor;
  /** Optional per-field confidence in [0,1] (#16), keyed by (flattened) field path. */
  confidence?: Record<string, number>;
  /** Flatten nested plain objects into dot-paths to match form field paths (default true). */
  flatten?: boolean;
}

export interface PrefillResult {
  actor: Actor;
  initialFields: Record<string, unknown>;
  confidence?: Record<string, number>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Flatten nested plain objects to dot-paths; arrays + primitives are kept as values. */
export function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      Object.assign(out, flattenObject(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

export function prefillFromGenerateObject(
  result: GenerateObjectLike,
  opts: PrefillOptions
): PrefillResult {
  const obj = isPlainObject(result.object) ? result.object : {};
  const flatten = opts.flatten ?? true;
  const initialFields = flatten ? flattenObject(obj) : { ...obj };
  const out: PrefillResult = { actor: opts.actor, initialFields };
  if (opts.confidence) out.confidence = opts.confidence;
  return out;
}
