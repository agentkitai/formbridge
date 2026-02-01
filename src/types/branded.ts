/**
 * Branded Types for Domain IDs
 *
 * Uses TypeScript's structural typing escape hatch to create nominal types
 * that prevent accidental mixing of different ID types at compile time.
 * Each branded type is still a string at runtime but distinct in the type system.
 */

// =============================================================================
// § Brand Symbols (unique per type)
// =============================================================================

declare const _SubmissionIdBrand: unique symbol;
declare const _IntakeIdBrand: unique symbol;
declare const _ResumeTokenBrand: unique symbol;
declare const _EventIdBrand: unique symbol;
declare const _DeliveryIdBrand: unique symbol;
declare const _TenantIdBrand: unique symbol;
declare const _KeyHashBrand: unique symbol;
declare const _UploadIdBrand: unique symbol;

// =============================================================================
// § Branded Types
// =============================================================================

export type SubmissionId = string & { readonly __brand: typeof _SubmissionIdBrand };
export type IntakeId = string & { readonly __brand: typeof _IntakeIdBrand };
export type ResumeToken = string & { readonly __brand: typeof _ResumeTokenBrand };
export type EventId = string & { readonly __brand: typeof _EventIdBrand };
export type DeliveryId = string & { readonly __brand: typeof _DeliveryIdBrand };
export type TenantId = string & { readonly __brand: typeof _TenantIdBrand };
export type KeyHash = string & { readonly __brand: typeof _KeyHashBrand };
export type UploadId = string & { readonly __brand: typeof _UploadIdBrand };

// =============================================================================
// § Constructor Functions
// =============================================================================

export function SubmissionId(value: string): SubmissionId {
  return value as SubmissionId;
}

export function IntakeId(value: string): IntakeId {
  return value as IntakeId;
}

export function ResumeToken(value: string): ResumeToken {
  return value as ResumeToken;
}

export function EventId(value: string): EventId {
  return value as EventId;
}

export function DeliveryId(value: string): DeliveryId {
  return value as DeliveryId;
}

export function TenantId(value: string): TenantId {
  return value as TenantId;
}

export function KeyHash(value: string): KeyHash {
  return value as KeyHash;
}

export function UploadId(value: string): UploadId {
  return value as UploadId;
}
