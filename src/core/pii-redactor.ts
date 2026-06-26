/**
 * Per-field PII redaction at intake (#13).
 *
 * Masks the same L1 classes lore's write-side redactor covers (emails, phones,
 * SSNs, payment cards, common secret tokens) in string field values, so PII
 * isn't stored in cleartext — the per-field "visibility" guarantee at intake.
 * OFF unless FORMBRIDGE_PII_REDACTION is set.
 *
 * ponytail: L1 regex heuristic (false negatives on exotic formats). Upgrade
 * path: call lore's redaction service / Presidio for L2/L3 NER when needed.
 */

export interface PiiRedactor {
  /** Redact PII from a value. Strings are masked; non-strings pass through. */
  redactValue(value: unknown): { value: unknown; found: string[] };
}

const PATTERNS: ReadonlyArray<{ type: string; re: RegExp; mask: string }> = [
  { type: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, mask: "[redacted:email]" },
  { type: "secret", re: /\b(?:sk|pk|ghp|xox[baprs])[-_][A-Za-z0-9]{16,}\b/g, mask: "[redacted:secret]" },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, mask: "[redacted:ssn]" },
  { type: "credit_card", re: /\b(?:\d[ -]?){13,16}\b/g, mask: "[redacted:card]" },
  { type: "phone", re: /\b(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, mask: "[redacted:phone]" },
];

function redactString(s: string): { value: string; found: string[] } {
  let out = s;
  const found: string[] = [];
  for (const { type, re, mask } of PATTERNS) {
    const before = out;
    out = out.replace(re, mask); // global replace; no lastIndex pitfall
    if (out !== before) found.push(type);
  }
  return { value: out, found };
}

const REDACTOR: PiiRedactor = {
  redactValue(value: unknown) {
    return typeof value === "string" ? redactString(value) : { value, found: [] };
  },
};

/**
 * A redactor when FORMBRIDGE_PII_REDACTION is truthy, else `undefined`
 * (→ no redaction at intake, unchanged behavior).
 */
export function createPiiRedactor(env: NodeJS.ProcessEnv = process.env): PiiRedactor | undefined {
  const flag = env.FORMBRIDGE_PII_REDACTION;
  if (!flag || flag === "false" || flag === "0") return undefined;
  return REDACTOR;
}
