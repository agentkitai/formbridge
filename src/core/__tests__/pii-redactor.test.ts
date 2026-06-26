/**
 * Per-field PII redaction at intake (#13).
 */

import { describe, it, expect } from "vitest";
import { createPiiRedactor } from "../pii-redactor.js";

const r = createPiiRedactor({ FORMBRIDGE_PII_REDACTION: "1" } as NodeJS.ProcessEnv)!;

describe("PII redactor (#13)", () => {
  it("masks an email", () => {
    const out = r.redactValue("contact me at jane.doe@example.com please");
    expect(out.found).toContain("email");
    expect(out.value).not.toContain("jane.doe@example.com");
    expect(out.value).toContain("[redacted:email]");
  });

  it("masks SSN, card and phone", () => {
    expect(r.redactValue("ssn 123-45-6789").found).toContain("ssn");
    expect(r.redactValue("card 4111 1111 1111 1111").found).toContain("credit_card");
    expect(r.redactValue("call (555) 123-4567").found).toContain("phone");
  });

  it("masks a secret-shaped token", () => {
    const out = r.redactValue("key sk-ABCDEFGHIJKLMNOP1234");
    expect(out.found).toContain("secret");
    expect(out.value).toContain("[redacted:secret]");
  });

  it("leaves a clean string untouched (found empty)", () => {
    const out = r.redactValue("the quick brown fox");
    expect(out.found).toEqual([]);
    expect(out.value).toBe("the quick brown fox");
  });

  it("passes non-strings through unchanged", () => {
    expect(r.redactValue(42)).toEqual({ value: 42, found: [] });
    expect(r.redactValue({ a: 1 })).toEqual({ value: { a: 1 }, found: [] });
  });

  it("is OFF unless the flag is truthy", () => {
    expect(createPiiRedactor({} as NodeJS.ProcessEnv)).toBeUndefined();
    expect(createPiiRedactor({ FORMBRIDGE_PII_REDACTION: "false" } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(createPiiRedactor({ FORMBRIDGE_PII_REDACTION: "0" } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(createPiiRedactor({ FORMBRIDGE_PII_REDACTION: "1" } as NodeJS.ProcessEnv)).toBeDefined();
  });
});
