/**
 * Re-exported shared types from the root project.
 * Avoids cross-package relative imports that break encapsulation.
 */
export type { Actor, SubmissionState } from '../../../src/types/intake-contract';
export type { FieldAttribution } from '../../../src/types';
