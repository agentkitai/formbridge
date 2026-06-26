/**
 * AG-UI / A2UI handoff adapter (#14).
 */

import { describe, it, expect } from "vitest";
import { toHandoffUiSpec } from "../handoff-ui-adapter.js";

const submission = {
  id: "sub_1",
  intakeId: "vendor",
  state: "needs_review",
  fields: { companyName: "Acme", email: "a@b.co", __uploads: { x: {} } },
  fieldAttribution: {
    companyName: { kind: "agent", id: "agt" },
    email: { kind: "human", id: "h" },
  },
};

const schema = {
  properties: {
    companyName: { type: "string", title: "Company" },
    email: { type: "string", title: "Email" },
    taxId: { type: "string", title: "Tax ID" },
  },
  required: ["companyName", "taxId"],
};

describe("handoff UI adapter (#14)", () => {
  it("renders filled fields with attribution badges", () => {
    const spec = toHandoffUiSpec(submission, schema);
    expect(spec.protocol).toBe("agentkitai.handoff/v1");
    const company = spec.fields.find((f) => f.name === "companyName")!;
    expect(company.filledBy).toBe("agent");
    expect(company.label).toBe("Company");
    expect(company.value).toBe("Acme");
    expect(spec.fields.find((f) => f.name === "email")!.filledBy).toBe("human");
  });

  it("marks unfilled required fields as needsInput", () => {
    const spec = toHandoffUiSpec(submission, schema);
    const taxId = spec.fields.find((f) => f.name === "taxId")!;
    expect(taxId.required).toBe(true);
    expect(taxId.needsInput).toBe(true);
    expect(taxId.filledBy).toBe("unknown");
    // a filled required field is NOT needsInput
    expect(spec.fields.find((f) => f.name === "companyName")!.needsInput).toBe(false);
  });

  it("excludes reserved __ metadata keys", () => {
    const spec = toHandoffUiSpec(submission, schema);
    expect(spec.fields.some((f) => f.name.startsWith("__"))).toBe(false);
  });

  it("works without a schema (badges from attribution, default type)", () => {
    const spec = toHandoffUiSpec(submission);
    const company = spec.fields.find((f) => f.name === "companyName")!;
    expect(company.type).toBe("string");
    expect(company.label).toBe("companyName");
    expect(company.required).toBe(false);
    expect(company.needsInput).toBe(false);
  });

  it("surfaces per-field confidence and flags low-confidence filled fields (#16)", () => {
    const withConf = {
      ...submission,
      fieldConfidence: { companyName: 0.3, email: 0.95 },
    };
    const spec = toHandoffUiSpec(withConf, schema);
    const company = spec.fields.find((f) => f.name === "companyName")!;
    const email = spec.fields.find((f) => f.name === "email")!;
    expect(company.confidence).toBe(0.3);
    expect(company.lowConfidence).toBe(true); // 0.3 ≤ 0.5 and filled
    expect(email.confidence).toBe(0.95);
    expect(email.lowConfidence).toBe(false);
    // a field with no confidence reported → undefined + not low
    const taxId = spec.fields.find((f) => f.name === "taxId")!;
    expect(taxId.confidence).toBeUndefined();
    expect(taxId.lowConfidence).toBe(false);
  });

  it("exposes a submit action", () => {
    expect(toHandoffUiSpec(submission, schema).actions).toContainEqual({
      type: "submit",
      label: "Complete & submit",
    });
  });
});
