/**
 * Destination-delivery outbox integration tests.
 *
 * Exercises the auto-delivery wiring added to `wireSubmissionServices`: when a
 * submission reaches a completion state (submission.submitted / review.approved
 * / submission.finalized) it is delivered exactly once to its intake's webhook
 * destination. Dedup is anchored on the durable delivery queue.
 *
 * Tests drive the real services (SubmissionManager / ApprovalManager) wired to
 * a MemoryStorage, and count delivery rows in the queue (each enqueue writes
 * exactly one row) to assert exactly-once behavior. globalThis.fetch is stubbed
 * so no real network delivery happens.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { wireSubmissionServices, type SubmissionServices } from '../../src/app';
import { MemoryStorage } from '../../src/storage/memory-storage';
import { IntakeRegistry } from '../../src/core/intake-registry';
import { IntakeId, SubmissionId, ResumeToken } from '../../src/types/branded';
import type { Actor, Destination, IntakeDefinition } from '../../src/types/intake-contract';
import type { Submission } from '../../src/submission-types';

const DEST_URL = 'https://dest.example.com/webhook';
const REVIEWER_URL = 'https://reviewer.example.com/notify';

const agent: Actor = { kind: 'agent', id: 'agent-1', name: 'Agent' };
const reviewer: Actor = { kind: 'human', id: 'reviewer-1', name: 'Reviewer' };

function makeIntake(spec: {
  id: string;
  gated?: boolean;
  destination?: Destination;
}): IntakeDefinition {
  return {
    id: IntakeId(spec.id),
    version: '1.0.0',
    name: spec.id,
    schema: { type: 'object' },
    destination: spec.destination ?? { kind: 'webhook', url: DEST_URL },
    approvalGates: spec.gated
      ? [{ name: 'review', reviewers: ['reviewer-1'], requiredApprovals: 1 }]
      : undefined,
  };
}

function makeSubmission(spec: {
  id: string;
  intakeId: string;
  state: Submission['state'];
}): Submission {
  const now = new Date().toISOString();
  return {
    id: SubmissionId(spec.id),
    intakeId: IntakeId(spec.intakeId),
    state: spec.state,
    resumeToken: ResumeToken(`rtok_${spec.id}`),
    createdAt: now,
    updatedAt: now,
    fields: { name: 'Seeded' },
    fieldAttribution: {},
    createdBy: agent,
    updatedBy: agent,
    events: [],
  };
}

/** Create a fresh registry + MemoryStorage and wire the services against them. */
function wire(intakes: IntakeDefinition[]): {
  services: SubmissionServices;
  storage: MemoryStorage;
} {
  const registry = new IntakeRegistry({ validateOnRegister: false });
  for (const intake of intakes) registry.registerIntake(intake);
  const storage = new MemoryStorage();
  const services = wireSubmissionServices({ registry, storage });
  return { services, storage };
}

/** Count delivery rows for a submission targeting a given URL (one row per enqueue). */
async function countDeliveries(
  services: SubmissionServices,
  submissionId: string,
  url: string = DEST_URL
): Promise<number> {
  const records = await services.deliveryQueue.getBySubmission(submissionId);
  return records.filter((r) => r.destinationUrl === url).length;
}

async function createAndSubmit(services: SubmissionServices, intakeId: string) {
  const created = await services.manager.createSubmission({
    intakeId: IntakeId(intakeId),
    actor: agent,
    initialFields: { name: 'Acme' },
  });
  const submitRes = await services.manager.submit({
    submissionId: created.submissionId,
    resumeToken: ResumeToken(created.resumeToken),
    idempotencyKey: `idem_${created.submissionId}`,
    actor: agent,
  });
  return { created, submitRes };
}

async function waitFor(
  cond: () => Promise<boolean> | boolean,
  timeoutMs = 1000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('waitFor: condition not met within timeout');
}

describe('Destination-delivery outbox', () => {
  let savedReviewerUrl: string | undefined;
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedReviewerUrl = process.env['FORMBRIDGE_REVIEWER_WEBHOOK_URL'];
    savedSecret = process.env['FORMBRIDGE_WEBHOOK_SECRET'];
    delete process.env['FORMBRIDGE_REVIEWER_WEBHOOK_URL'];
    process.env['FORMBRIDGE_WEBHOOK_SECRET'] = 'test-secret';
    // Stub fetch so processDelivery succeeds cleanly (row -> succeeded, no retries/network).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (savedReviewerUrl === undefined) delete process.env['FORMBRIDGE_REVIEWER_WEBHOOK_URL'];
    else process.env['FORMBRIDGE_REVIEWER_WEBHOOK_URL'] = savedReviewerUrl;
    if (savedSecret === undefined) delete process.env['FORMBRIDGE_WEBHOOK_SECRET'];
    else process.env['FORMBRIDGE_WEBHOOK_SECRET'] = savedSecret;
  });

  it('delivers exactly one enqueue to the destination on ungated submit', async () => {
    const { services } = wire([makeIntake({ id: 'simple' })]);
    const { created, submitRes } = await createAndSubmit(services, 'simple');

    expect(submitRes.ok).toBe(true);
    expect(await countDeliveries(services, created.submissionId)).toBe(1);

    // Denormalized marker is set on the submission.
    const sub = await services.store.get(created.submissionId);
    expect(sub?.destinationDeliveredAt).toBeDefined();
  });

  it('does not deliver on gated submit (state needs_review)', async () => {
    const { services } = wire([makeIntake({ id: 'gated', gated: true })]);
    const { created, submitRes } = await createAndSubmit(services, 'gated');

    // Gated submit returns needs_approval; state is needs_review, not submitted.
    expect(submitRes.ok).toBe(false);
    expect(await countDeliveries(services, created.submissionId)).toBe(0);
  });

  it('delivers exactly one enqueue on approval of a gated submission', async () => {
    const { services } = wire([makeIntake({ id: 'gated', gated: true })]);
    const { created } = await createAndSubmit(services, 'gated');
    expect(await countDeliveries(services, created.submissionId)).toBe(0);

    const approveRes = await services.approvalManager.approve({
      submissionId: created.submissionId,
      resumeToken: created.resumeToken,
      actor: reviewer,
      comment: 'ok',
    });

    expect(approveRes.ok).toBe(true);
    expect(await countDeliveries(services, created.submissionId)).toBe(1);
  });

  it('enqueues the destination delivery once across approve then finalize', async () => {
    const { services } = wire([makeIntake({ id: 'gated', gated: true })]);
    const { created } = await createAndSubmit(services, 'gated');

    await services.approvalManager.approve({
      submissionId: created.submissionId,
      resumeToken: created.resumeToken,
      actor: reviewer,
    });
    await services.manager.finalize(created.submissionId, reviewer);

    expect(await countDeliveries(services, created.submissionId)).toBe(1);
  });

  it('delivers once when finalize is called twice (idempotent finalize)', async () => {
    const { services } = wire([makeIntake({ id: 'simple' })]);
    const { created } = await createAndSubmit(services, 'simple');

    await services.manager.finalize(created.submissionId, agent);
    await services.manager.finalize(created.submissionId, agent);

    expect(await countDeliveries(services, created.submissionId)).toBe(1);
  });

  it('never delivers a rejected submission', async () => {
    const { services } = wire([makeIntake({ id: 'gated', gated: true })]);
    const { created } = await createAndSubmit(services, 'gated');

    const rejectRes = await services.approvalManager.reject({
      submissionId: created.submissionId,
      resumeToken: created.resumeToken,
      actor: reviewer,
      reason: 'invalid',
    });

    expect(rejectRes.ok).toBe(true);
    expect(await countDeliveries(services, created.submissionId)).toBe(0);
  });

  it('skips non-webhook (callback) destinations without throwing', async () => {
    // kind:callback with a url present — must be skipped by the kind guard.
    const { services } = wire([
      makeIntake({ id: 'cb', destination: { kind: 'callback', url: DEST_URL } }),
    ]);
    const { created, submitRes } = await createAndSubmit(services, 'cb');

    expect(submitRes.ok).toBe(true);
    expect(await services.deliveryQueue.getBySubmission(created.submissionId)).toHaveLength(0);
  });

  it('skips webhook destinations with no url without throwing', async () => {
    const { services } = wire([
      makeIntake({ id: 'nourl', destination: { kind: 'webhook' } }),
    ]);
    const { created, submitRes } = await createAndSubmit(services, 'nourl');

    expect(submitRes.ok).toBe(true);
    expect(await services.deliveryQueue.getBySubmission(created.submissionId)).toHaveLength(0);
  });

  it('destination delivery fires even when a reviewer delivery (different URL) exists', async () => {
    process.env['FORMBRIDGE_REVIEWER_WEBHOOK_URL'] = REVIEWER_URL;
    const { services } = wire([makeIntake({ id: 'gated', gated: true })]);
    const { created } = await createAndSubmit(services, 'gated');

    // Simulate a reviewer notification delivery to a DIFFERENT url for this submission.
    const sub = await services.store.get(created.submissionId);
    await services.webhookManager.enqueueDelivery(sub!, { kind: 'webhook', url: REVIEWER_URL });
    expect(await countDeliveries(services, created.submissionId, REVIEWER_URL)).toBe(1);
    expect(await countDeliveries(services, created.submissionId, DEST_URL)).toBe(0);

    // Approve → destination delivery must still fire; the reviewer row must not suppress it.
    await services.approvalManager.approve({
      submissionId: created.submissionId,
      resumeToken: created.resumeToken,
      actor: reviewer,
    });

    expect(await countDeliveries(services, created.submissionId, DEST_URL)).toBe(1);
    expect(await countDeliveries(services, created.submissionId, REVIEWER_URL)).toBe(1);
  });

  it('reconciliation enqueues a destination delivery for a completed submission with no delivery row', async () => {
    const registry = new IntakeRegistry({ validateOnRegister: false });
    registry.registerIntake(makeIntake({ id: 'recon' }));
    const storage = new MemoryStorage();

    // Seed a completed submission with NO delivery row (simulates a crash between
    // state-commit and enqueue).
    const seeded = makeSubmission({ id: 'sub_recon_1', intakeId: 'recon', state: 'submitted' });
    await storage.submissions.save(seeded);
    expect(await storage.deliveries.getBySubmission(seeded.id)).toHaveLength(0);

    // Wire fresh services — boot reconciliation should relay the missing delivery.
    const services = wireSubmissionServices({ registry, storage });

    await waitFor(async () => (await countDeliveries(services, seeded.id)) >= 1);
    expect(await countDeliveries(services, seeded.id)).toBe(1);
  });
});
