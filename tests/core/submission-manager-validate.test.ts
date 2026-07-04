/**
 * SubmissionManager.validate() — read-only validation.
 *
 * Asserts validate() is a pure query: it records NO event, performs NO save,
 * rotates NO resume token, and makes NO state transition. (The old MCP
 * validate-handler illegally flipped state — this guards the fix.)
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { SubmissionManager } from '../../src/core/submission-manager.js';
import { InMemorySubmissionStore } from '../../src/mcp/submission-store.js';
import { IntakeRegistry } from '../../src/core/intake-registry.js';
import { toContractIntake } from '../../src/mcp/intake-adapter.js';
import type { IntakeEvent } from '../../src/types/intake-contract.js';
import type { IntakeDefinition } from '../../src/schemas/intake-schema.js';

const intake: IntakeDefinition = {
  id: 'simple_form',
  version: '1.0.0',
  name: 'Simple Form',
  schema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().min(18),
  }),
  destination: { type: 'webhook', name: 'Test', config: { url: 'https://example.com/webhook' } },
};

function setup() {
  const store = new InMemorySubmissionStore();
  const events: IntakeEvent[] = [];
  const eventEmitter = { emit: vi.fn(async (e: IntakeEvent) => { events.push(e); }) };
  const registry = new IntakeRegistry({ validateOnRegister: false, allowOverwrite: true });
  registry.registerIntake(toContractIntake(intake));
  const manager = new SubmissionManager({ store, eventEmitter, intakeRegistry: registry, baseUrl: 'http://localhost:3000' });
  return { store, events, eventEmitter, manager };
}

const actor = { kind: 'agent' as const, id: 'agent-1' };

describe('SubmissionManager.validate()', () => {
  it('reports missing required fields without mutating the submission', async () => {
    const { store, events, eventEmitter, manager } = setup();
    const created = await manager.createSubmission({ intakeId: intake.id as never, actor, initialFields: { name: 'John' } });

    const saveSpy = vi.spyOn(store, 'save');
    const before = await manager.getSubmission(created.submissionId);
    const emitCountBefore = eventEmitter.emit.mock.calls.length;
    const eventsBefore = events.length;

    const result = await manager.validate(created.submissionId);

    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(expect.arrayContaining(['email', 'age']));
    expect(result.errors.length).toBeGreaterThan(0);

    // No save, no emit, no new event.
    expect(saveSpy).not.toHaveBeenCalled();
    expect(eventEmitter.emit.mock.calls.length).toBe(emitCountBefore);
    expect(events.length).toBe(eventsBefore);

    // No state change, no token rotation.
    const after = await manager.getSubmission(created.submissionId);
    expect(after!.state).toBe(before!.state);
    expect(after!.resumeToken).toBe(before!.resumeToken);
  });

  it('reports ok for a complete, valid submission (still read-only)', async () => {
    const { store, manager } = setup();
    const created = await manager.createSubmission({
      intakeId: intake.id as never,
      actor,
      initialFields: { name: 'Jane', email: 'jane@example.com', age: 30 },
    });

    const saveSpy = vi.spyOn(store, 'save');
    const result = await manager.validate(created.submissionId);

    expect(result.ok).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(saveSpy).not.toHaveBeenCalled();

    const after = await manager.getSubmission(created.submissionId);
    expect(after!.state).toBe('draft'); // unchanged — validate does not transition
  });

  it('throws SubmissionNotFoundError for an unknown submission id', async () => {
    const { manager } = setup();
    await expect(manager.validate('sub_nope')).rejects.toThrow(/not found/i);
  });
});
