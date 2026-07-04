/**
 * MCP Handler tests — driven against the REAL shared SubmissionManager /
 * ApprovalManager (no MCP-only store). Asserts the NEW unified behavior:
 * core lifecycle states, resume-token rotation across set→submit, recorded
 * field attribution, gated submit → needs_review, finalize → receipt,
 * idempotency, intake mismatch, and terminal/expired guards.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { SubmissionManager } from '../../src/core/submission-manager.js';
import { Validator } from '../../src/core/validator.js';
import { InMemorySubmissionStore } from '../../src/mcp/submission-store.js';
import { IntakeRegistry } from '../../src/core/intake-registry.js';
import { toContractIntake } from '../../src/mcp/intake-adapter.js';
import { handleCreate } from '../../src/mcp/handlers/create-handler.js';
import { handleSet } from '../../src/mcp/handlers/set-handler.js';
import { handleValidate } from '../../src/mcp/handlers/validate-handler.js';
import { handleSubmit } from '../../src/mcp/handlers/submit-handler.js';
import {
  handleGet,
  handleHandoff,
  handleFinalize,
} from '../../src/mcp/handlers/lifecycle-handlers.js';
import type { IntakeDefinition } from '../../src/schemas/intake-schema.js';
import type { IntakeEvent } from '../../src/types/intake-contract.js';

const agentActor = { kind: 'agent' as const, id: 'agent-1', name: 'Agent One' };

const simpleIntake: IntakeDefinition = {
  id: 'simple_form',
  version: '1.0.0',
  name: 'Simple Form',
  schema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().min(18),
  }),
  destination: { type: 'webhook', name: 'Test Webhook', config: { url: 'https://example.com/webhook' } },
};

const otherIntake: IntakeDefinition = {
  id: 'other_form',
  version: '1.0.0',
  name: 'Other Form',
  schema: z.object({ note: z.string() }),
  destination: { type: 'webhook', name: 'Other', config: { url: 'https://example.com/other' } },
};

const gatedIntake: IntakeDefinition = {
  id: 'gated_form',
  version: '1.0.0',
  name: 'Gated Form',
  schema: z.object({ amount: z.number() }),
  destination: { type: 'webhook', name: 'Gated', config: { url: 'https://example.com/gated' } },
  approvalGates: [{ id: 'g1', name: 'High value', reviewers: ['rev-1'] }],
};

function makeCtx(intakes: IntakeDefinition[], opts?: { receiptManager?: unknown }) {
  const store = new InMemorySubmissionStore();
  const events: IntakeEvent[] = [];
  const eventEmitter = { emit: async (e: IntakeEvent) => { events.push(e); } };
  const registry = new IntakeRegistry({ validateOnRegister: false, allowOverwrite: true });
  const contracts = new Map<string, ReturnType<typeof toContractIntake>>();
  for (const intake of intakes) {
    const contract = toContractIntake(intake);
    registry.registerIntake(contract);
    contracts.set(intake.id, contract);
  }
  const manager = new SubmissionManager({
    store,
    eventEmitter,
    intakeRegistry: registry,
    baseUrl: 'http://localhost:3000',
    receiptManager: opts?.receiptManager as never,
  });
  // Same validator config the HTTP route uses, so MCP set/create validate
  // fields identically.
  const validator = new Validator({ strict: false, allowAdditionalProperties: true });
  const services = { manager, validator };
  return {
    store,
    events,
    registry,
    manager,
    services,
    contract: (id: string) => contracts.get(id)!,
  };
}

/** Narrow a success response (has ok: true). */
function expectOk<T extends { ok?: unknown }>(res: T): T & { ok: true } {
  expect(res).toHaveProperty('ok', true);
  return res as T & { ok: true };
}

describe('handleCreate', () => {
  it('creates a submission in the core draft state with sub_/rtok_ ids', async () => {
    const ctx = makeCtx([simpleIntake]);
    const res: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'John' }, actor: agentActor }, ctx.services);

    expect(res.ok).toBe(true);
    expect(res.state).toBe('draft');
    expect(res.submissionId).toMatch(/^sub_/);
    expect(res.resumeToken).toMatch(/^rtok_/);
  });

  it('records field attribution for initial fields', async () => {
    const ctx = makeCtx([simpleIntake]);
    const res: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'John' }, actor: agentActor }, ctx.services);

    const submission = await ctx.store.get(res.submissionId);
    expect(submission!.fields.name).toBe('John');
    expect(submission!.fieldAttribution.name).toEqual(agentActor);
  });

  it('is idempotent on repeated idempotencyKey', async () => {
    const ctx = makeCtx([simpleIntake]);
    const r1: any = await handleCreate(ctx.contract('simple_form'), { idempotencyKey: 'k1', actor: agentActor }, ctx.services);
    const r2: any = await handleCreate(ctx.contract('simple_form'), { idempotencyKey: 'k1', actor: agentActor }, ctx.services);
    expect(r2.submissionId).toBe(r1.submissionId);
  });

  it('defaults to the system actor when none supplied', async () => {
    const ctx = makeCtx([simpleIntake]);
    const res: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'A' } }, ctx.services);
    const submission = await ctx.store.get(res.submissionId);
    expect(submission!.fieldAttribution.name).toEqual({ kind: 'system', id: 'mcp-server', name: 'MCP Server' });
  });
});

describe('handleSet', () => {
  it('rotates the resume token and moves draft → in_progress', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { actor: agentActor }, ctx.services);

    const setRes: any = expectOk(await handleSet(
      ctx.contract('simple_form'),
      { resumeToken: created.resumeToken, data: { name: 'John' }, actor: agentActor },
      ctx.services
    ));

    expect(setRes.state).toBe('in_progress');
    expect(setRes.resumeToken).not.toBe(created.resumeToken); // rotated
    const submission = await ctx.store.get(created.submissionId);
    expect(submission!.fieldAttribution.name).toEqual(agentActor);
  });

  it('returns an invalid-token error for an unknown resume token', async () => {
    const ctx = makeCtx([simpleIntake]);
    const res: any = await handleSet(ctx.contract('simple_form'), { resumeToken: 'rtok_nope', data: { name: 'x' } }, ctx.services);
    expect(res.type).toBe('invalid');
    expect(res.message).toBe('Invalid resume token');
  });

  it('returns a conflict error on intake mismatch', async () => {
    const ctx = makeCtx([simpleIntake, otherIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { actor: agentActor }, ctx.services);
    const res: any = await handleSet(ctx.contract('other_form'), { resumeToken: created.resumeToken, data: { note: 'hi' } }, ctx.services);
    expect(res.type).toBe('conflict');
    expect(res.message).toContain('different intake');
  });

  it('guards against mutating a terminal (submitted) submission', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'A', email: 'a@b.com', age: 20 }, actor: agentActor }, ctx.services);
    const submitRes: any = expectOk(await handleSubmit(ctx.contract('simple_form'), { resumeToken: created.resumeToken, actor: agentActor }, ctx.services));
    expect(submitRes.state).toBe('submitted');

    const res: any = await handleSet(ctx.contract('simple_form'), { resumeToken: submitRes.resumeToken, data: { name: 'B' } }, ctx.services);
    expect(res.ok).toBe(false);
    expect(res.error.type).toBe('conflict');
    expect(res.error.message).toContain('Cannot modify');
  });

  it('guards against an expired submission', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'A' }, actor: agentActor }, ctx.services);
    const stored = await ctx.store.get(created.submissionId);
    stored!.expiresAt = new Date(Date.now() - 1000).toISOString();

    const res: any = await handleSet(ctx.contract('simple_form'), { resumeToken: created.resumeToken, data: { name: 'B' } }, ctx.services);
    expect(res.ok).toBe(false);
    expect(res.state).toBe('expired');
  });
});

describe('handleValidate', () => {
  it('is read-only: no event, no state change, no token rotation', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { actor: agentActor }, ctx.services);
    const setRes: any = expectOk(await handleSet(
      ctx.contract('simple_form'),
      { resumeToken: created.resumeToken, data: { name: 'John', email: 'john@example.com', age: 30 }, actor: agentActor },
      ctx.services
    ));

    const eventsBefore = ctx.events.length;
    const stateBefore = (await ctx.store.get(created.submissionId))!.state;

    const valRes: any = await handleValidate(ctx.contract('simple_form'), { resumeToken: setRes.resumeToken }, ctx.services);

    expect(valRes.ok).toBe(true);
    expect(valRes.missingFields).toEqual([]);
    expect(valRes.resumeToken).toBe(setRes.resumeToken); // unchanged
    expect(valRes.state).toBe(stateBefore);

    // No new event emitted and the stored submission is untouched.
    expect(ctx.events.length).toBe(eventsBefore);
    const after = await ctx.store.get(created.submissionId);
    expect(after!.state).toBe(stateBefore);
    expect(after!.resumeToken).toBe(setRes.resumeToken);
  });

  it('reports missing required fields without mutating state', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'John' }, actor: agentActor }, ctx.services);

    const valRes: any = await handleValidate(ctx.contract('simple_form'), { resumeToken: created.resumeToken }, ctx.services);
    expect(valRes.ok).toBe(false);
    expect(valRes.missingFields).toEqual(expect.arrayContaining(['email', 'age']));

    const after = await ctx.store.get(created.submissionId);
    expect(after!.state).toBe('draft'); // still draft — validate did not transition
  });
});

describe('handleSubmit', () => {
  it('submits an ungated intake to the core submitted state', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'A', email: 'a@b.com', age: 20 }, actor: agentActor }, ctx.services);
    const submitRes: any = expectOk(await handleSubmit(ctx.contract('simple_form'), { resumeToken: created.resumeToken, actor: agentActor }, ctx.services));
    expect(submitRes.state).toBe('submitted');
  });

  it('accepts the rotated token from set (create → set → submit)', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { actor: agentActor }, ctx.services);
    const setRes: any = expectOk(await handleSet(
      ctx.contract('simple_form'),
      { resumeToken: created.resumeToken, data: { name: 'A', email: 'a@b.com', age: 20 }, actor: agentActor },
      ctx.services
    ));
    // The original create token is now stale.
    const staleAttempt: any = await handleSubmit(ctx.contract('simple_form'), { resumeToken: created.resumeToken, actor: agentActor }, ctx.services);
    expect(staleAttempt.type).toBe('invalid');

    const submitRes: any = expectOk(await handleSubmit(ctx.contract('simple_form'), { resumeToken: setRes.resumeToken, actor: agentActor }, ctx.services));
    expect(submitRes.state).toBe('submitted');
  });

  it('surfaces needs_review as an informative response under a gated intake', async () => {
    const ctx = makeCtx([gatedIntake]);
    const created: any = await handleCreate(ctx.contract('gated_form'), { data: { amount: 5000 }, actor: agentActor }, ctx.services);
    const submitRes: any = await handleSubmit(ctx.contract('gated_form'), { resumeToken: created.resumeToken, actor: agentActor }, ctx.services);

    expect(submitRes.ok).toBe(false);
    expect(submitRes.state).toBe('needs_review');
    expect(submitRes.error.type).toBe('needs_approval');
  });
});

describe('handleGet', () => {
  it('returns state, fields, attribution, and missing fields', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'John' }, actor: agentActor }, ctx.services);

    const res: any = await handleGet(ctx.contract('simple_form'), { resumeToken: created.resumeToken }, ctx.services);
    expect(res.ok).toBe(true);
    expect(res.state).toBe('draft');
    expect(res.fields).toEqual({ name: 'John' });
    expect(res.fieldAttribution.name).toEqual(agentActor);
    expect(res.missingFields).toEqual(expect.arrayContaining(['email', 'age']));
  });
});

describe('handleHandoff', () => {
  it('generates a resume URL embedding the current token', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'John' }, actor: agentActor }, ctx.services);

    const res: any = await handleHandoff(ctx.contract('simple_form'), { resumeToken: created.resumeToken, actor: agentActor }, ctx.services);
    expect(res.ok).toBe(true);
    expect(res.resumeUrl).toContain('/resume?token=');
    expect(res.resumeUrl).toContain(created.resumeToken);
  });
});

describe('handleFinalize', () => {
  it('finalizes a submitted submission and returns a receipt', async () => {
    const receiptManager = { signReceipt: vi.fn(async () => ({ id: 'rcpt_1', type: 'test-receipt' })) };
    const ctx = makeCtx([simpleIntake], { receiptManager });
    const created: any = await handleCreate(ctx.contract('simple_form'), { data: { name: 'A', email: 'a@b.com', age: 20 }, actor: agentActor }, ctx.services);
    const submitRes: any = expectOk(await handleSubmit(ctx.contract('simple_form'), { resumeToken: created.resumeToken, actor: agentActor }, ctx.services));

    const finRes: any = await handleFinalize(ctx.contract('simple_form'), { resumeToken: submitRes.resumeToken, actor: agentActor }, ctx.services);
    expect(finRes.ok).toBe(true);
    expect(finRes.state).toBe('finalized');
    expect(finRes.receipt).toBeDefined();
    expect(finRes.receipt.id).toBe('rcpt_1');
  });
});

// NOTE: There are deliberately NO handleApprove/handleReject tests. Approval is
// not exposed over the (unauthenticated) MCP transport — it is an HTTP/human
// action. See tests/mcp/server.test.ts for the assertion that a gated intake
// generates no _approve/_reject tool and that no dispatch path handles them.

describe('schema validation on set/create (parity with HTTP)', () => {
  it('rejects a set whose values violate the schema and does NOT persist', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(
      ctx.contract('simple_form'),
      { data: { name: 'John' }, actor: agentActor },
      ctx.services
    );
    const before = await ctx.store.get(created.submissionId);

    const res: any = await handleSet(
      ctx.contract('simple_form'),
      { resumeToken: created.resumeToken, data: { email: 'not-an-email', age: 'twenty' }, actor: agentActor },
      ctx.services
    );

    // Structured field-errors, no success.
    expect(res.type).toBe('invalid');
    expect(res.ok).toBeUndefined();
    expect(res.fields.map((f: any) => f.field)).toEqual(expect.arrayContaining(['email', 'age']));

    // Nothing persisted: fields, state, and token are all unchanged.
    const after = await ctx.store.get(created.submissionId);
    expect(after!.fields).toEqual(before!.fields);
    expect(after!.state).toBe(before!.state);
    expect(after!.resumeToken).toBe(created.resumeToken);
  });

  it('rejects create with invalid initialFields (nothing created)', async () => {
    const ctx = makeCtx([simpleIntake]);
    const res: any = await handleCreate(
      ctx.contract('simple_form'),
      { data: { email: 'nope', age: 'twelve' }, actor: agentActor },
      ctx.services
    );
    expect(res.type).toBe('invalid');
    expect(res.fields.length).toBeGreaterThan(0);
    // No submission was created — a validation error carries no submissionId.
    expect(res.submissionId).toBeUndefined();
  });

  it('accepts a valid partial set and rotates the token', async () => {
    const ctx = makeCtx([simpleIntake]);
    const created: any = await handleCreate(ctx.contract('simple_form'), { actor: agentActor }, ctx.services);
    const res: any = expectOk(await handleSet(
      ctx.contract('simple_form'),
      { resumeToken: created.resumeToken, data: { email: 'valid@example.com' }, actor: agentActor },
      ctx.services
    ));
    expect(res.resumeToken).not.toBe(created.resumeToken);
    const after = await ctx.store.get(created.submissionId);
    expect(after!.fields.email).toBe('valid@example.com');
  });
});

describe('resolveActor kind validation', () => {
  it('falls back to the default system actor when actor.kind is malformed', async () => {
    const ctx = makeCtx([simpleIntake]);
    const res: any = await handleCreate(
      ctx.contract('simple_form'),
      { data: { name: 'A' }, actor: { kind: 'robot', id: 'x1', name: 'Rogue' } },
      ctx.services
    );
    const submission = await ctx.store.get(res.submissionId);
    // Malformed kind is not attributed — attribution defaults to system actor.
    expect(submission!.fieldAttribution.name).toEqual({ kind: 'system', id: 'mcp-server', name: 'MCP Server' });
  });
});
