/**
 * Shared utilities for event handling in routes.
 */

import type { IntakeEvent } from '../types/intake-contract.js';

/**
 * Redact sensitive tokens from event payloads before returning in API responses.
 * Strips `resumeToken` from event payloads to prevent token leakage via read-only endpoints.
 */
export function redactEventTokens(event: IntakeEvent): IntakeEvent {
  if (!event.payload) return event;
  const payload = { ...event.payload };
  if ('resumeToken' in payload) {
    delete payload['resumeToken'];
  }
  return { ...event, payload };
}
