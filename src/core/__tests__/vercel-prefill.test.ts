/**
 * Vercel AI SDK prefill adapter (#17).
 */

import { describe, it, expect } from "vitest";
import { flattenObject, prefillFromGenerateObject } from "../vercel-prefill.js";
import type { Actor } from "../../types/intake-contract.js";

const agent: Actor = { kind: "agent", id: "agt_1", name: "Filler" };

describe("flattenObject", () => {
  it("flattens nested plain objects to dot-paths, keeps arrays/primitives", () => {
    expect(
      flattenObject({ name: "Acme", address: { city: "Paris", zip: "75001" }, tags: ["a", "b"] }),
    ).toEqual({ name: "Acme", "address.city": "Paris", "address.zip": "75001", tags: ["a", "b"] });
  });

  it("keeps an empty object as a value (nothing to flatten)", () => {
    expect(flattenObject({ meta: {} })).toEqual({ meta: {} });
  });
});

describe("prefillFromGenerateObject (#17)", () => {
  it("maps the object to initialFields attributed to the agent", () => {
    const r = prefillFromGenerateObject({ object: { name: "Acme", seats: 5 } }, { actor: agent });
    expect(r.actor).toBe(agent);
    expect(r.initialFields).toEqual({ name: "Acme", seats: 5 });
    expect(r.confidence).toBeUndefined();
  });

  it("flattens nested objects by default (matches form field paths)", () => {
    const r = prefillFromGenerateObject({ object: { contact: { email: "a@b.co" } } }, { actor: agent });
    expect(r.initialFields).toEqual({ "contact.email": "a@b.co" });
  });

  it("keeps nesting when flatten=false", () => {
    const r = prefillFromGenerateObject(
      { object: { contact: { email: "a@b.co" } } },
      { actor: agent, flatten: false },
    );
    expect(r.initialFields).toEqual({ contact: { email: "a@b.co" } });
  });

  it("passes through per-field confidence (#16)", () => {
    const r = prefillFromGenerateObject(
      { object: { name: "Acme" } },
      { actor: agent, confidence: { name: 0.8 } },
    );
    expect(r.confidence).toEqual({ name: 0.8 });
  });

  it("tolerates a non-object result (→ empty fields)", () => {
    expect(prefillFromGenerateObject({ object: null }, { actor: agent }).initialFields).toEqual({});
    expect(prefillFromGenerateObject({ object: "nope" }, { actor: agent }).initialFields).toEqual({});
  });
});
