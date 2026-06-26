/**
 * AG-UI / A2UI handoff adapter (#14).
 *
 * Maps a FormBridge submission + its (JSON) schema into a declarative,
 * protocol-neutral handoff UI spec that an AG-UI / A2UI client renders in-agent:
 * the governed, prefilled form with **per-field attribution badges** (which actor
 * filled each field) and which required fields still need human input.
 *
 * ponytail: a declarative surface, NOT the full AG-UI event protocol (that's an
 * explicit anti-goal — "ride the standard, don't reinvent generative-UI breadth").
 */

export type FilledBy = "agent" | "human" | "system" | "unknown";

export interface HandoffUiField {
  name: string;
  label: string;
  type: string;
  value: unknown;
  filledBy: FilledBy;
  required: boolean;
  needsInput: boolean; // required && not yet filled — the human's to-do list
}

export interface HandoffUiSpec {
  /** Marker for the declarative surface AG-UI/A2UI clients consume. */
  protocol: "agentkitai.handoff/v1";
  submissionId: string;
  intakeId: string;
  state: string;
  fields: HandoffUiField[];
  actions: Array<{ type: string; label: string }>;
}

interface SubmissionLike {
  id: string;
  intakeId: string;
  state: string;
  fields: Record<string, unknown>;
  fieldAttribution: Record<string, { kind?: string } | undefined>;
}

interface JsonSchemaLike {
  properties?: Record<string, { type?: string; title?: string } | undefined>;
  required?: string[];
}

function isFilled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function toHandoffUiSpec(submission: SubmissionLike, schema?: JsonSchemaLike): HandoffUiSpec {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);

  // Union of declared schema fields and already-filled fields, minus reserved
  // metadata keys (e.g. __uploads).
  const names = [
    ...new Set([...Object.keys(props), ...Object.keys(submission.fields)]),
  ].filter((n) => !n.startsWith("__"));

  const fields: HandoffUiField[] = names.map((name) => {
    const prop = props[name];
    const kind = submission.fieldAttribution[name]?.kind;
    const filledBy: FilledBy =
      kind === "agent" || kind === "human" || kind === "system" ? kind : "unknown";
    const value = submission.fields[name] ?? null;
    return {
      name,
      label: prop?.title ?? name,
      type: prop?.type ?? "string",
      value,
      required: required.has(name),
      needsInput: required.has(name) && !isFilled(submission.fields[name]),
      filledBy,
    };
  });

  return {
    protocol: "agentkitai.handoff/v1",
    submissionId: submission.id,
    intakeId: submission.intakeId,
    state: submission.state,
    fields,
    actions: [{ type: "submit", label: "Complete & submit" }],
  };
}
