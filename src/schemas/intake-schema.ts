/**
 * FormBridge Intake Schema Definitions
 *
 * This module defines the IntakeDefinition interface that describes
 * intake forms and their validation rules. IntakeDefinitions are the
 * source input for generating MCP tool servers.
 */

import type { z } from 'zod';

/**
 * Approval gate configuration
 *
 * Defines conditions under which a submission requires human approval
 * before being delivered to the destination.
 */
export interface ApprovalGate {
  /** Unique identifier for this approval gate */
  id: string;
  /** Human-readable name for the approval gate */
  name: string;
  /** Description of when this gate triggers */
  description?: string;
  /** Condition expression (e.g., "amount > 10000") */
  condition?: string;
  /** Fields that trigger approval when present or modified */
  triggerFields?: string[];
  /** Whether this gate is required (defaults to true) */
  required?: boolean;
  /** List of reviewer IDs who can approve/reject submissions */
  reviewers?: string[];
  /** Number of approvals required (defaults to 1) */
  approvalLevel?: number;
  /** Optional auto-approval threshold for confidence scores */
  autoApproveThreshold?: number;
  /** Optional notification configuration for reviewers */
  notificationConfig?: Record<string, unknown>;
}

/**
 * Destination configuration
 *
 * Defines where successful submissions are delivered and how they
 * are processed after validation.
 */
export interface Destination {
  /** Destination type identifier */
  type: string;
  /** Human-readable destination name */
  name: string;
  /** Destination-specific configuration parameters */
  config: Record<string, unknown>;
  /** Optional webhook URL for submission notifications */
  webhookUrl?: string;
  /** Optional authentication credentials */
  auth?: {
    /** Authentication type (e.g., "bearer", "basic", "api-key") */
    type: string;
    /** Authentication credentials */
    credentials: Record<string, string>;
  };
  /** Optional retry configuration for delivery failures */
  retry?: {
    /** Maximum number of retry attempts */
    maxAttempts?: number;
    /** Delay between retries in milliseconds */
    delayMs?: number;
    /** Exponential backoff multiplier */
    backoffMultiplier?: number;
  };
}

/**
 * Intake form definition
 *
 * Complete specification of an intake form including its schema,
 * approval requirements, and submission destination. This is the
 * primary input for generating MCP tool servers.
 */
export interface IntakeDefinition {
  /** Unique identifier for this intake form (e.g., "vendor_onboarding") */
  id: string;
  /** Semantic version of this intake definition */
  version: string;
  /** Human-readable name for the intake form */
  name: string;
  /** Optional description of the intake form's purpose */
  description?: string;
  /** Zod schema that defines the structure and validation rules */
  schema: z.ZodType<unknown>;
  /** Optional approval gates that require human review */
  approvalGates?: ApprovalGate[];
  /** Destination configuration for successful submissions */
  destination: Destination;
  /** Optional metadata for the intake form */
  metadata?: Record<string, unknown>;
  /** Optional custom error messages for field validation */
  errorMessages?: Record<string, string>;
  /** Optional field display hints for UI generation */
  fieldHints?: Record<string, {
    /** Field label for display */
    label?: string;
    /** Field placeholder text */
    placeholder?: string;
    /** Field help text */
    helpText?: string;
    /** Field display order */
    order?: number;
    /** Whether field is hidden from UI */
    hidden?: boolean;
  }>;
}

/**
 * Type guard to check if an object is a valid IntakeDefinition
 *
 * @param obj - The object to check
 * @returns True if the object is a valid IntakeDefinition, false otherwise
 */
export function isIntakeDefinition(obj: unknown): obj is IntakeDefinition {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  return (
    'id' in obj && typeof obj.id === 'string' &&
    'version' in obj && typeof obj.version === 'string' &&
    'name' in obj && typeof obj.name === 'string' &&
    'schema' in obj && obj.schema != null && typeof obj.schema === 'object' &&
    '_def' in obj.schema && // Zod schemas have a _def property
    'destination' in obj && obj.destination != null && typeof obj.destination === 'object'
  );
}

/**
 * Validation result for IntakeDefinition
 */
export interface IntakeDefinitionValidation {
  /** Whether the definition is valid */
  valid: boolean;
  /** Validation errors if any */
  errors?: string[];
}

/**
 * Validates an IntakeDefinition for completeness and correctness
 *
 * @param definition - The partial intake definition to validate
 * @returns Validation result with valid flag and any error messages
 */
export function validateIntakeDefinition(
  definition: Partial<IntakeDefinition>
): IntakeDefinitionValidation {
  const errors: string[] = [];

  if (!definition.id) {
    errors.push('IntakeDefinition.id is required');
  } else if (!/^[a-z][a-z0-9_]*$/.test(definition.id)) {
    errors.push('IntakeDefinition.id must be lowercase with underscores (e.g., "vendor_onboarding")');
  }

  if (!definition.version) {
    errors.push('IntakeDefinition.version is required');
  } else if (!/^\d+\.\d+\.\d+(-[a-z0-9]+)?$/.test(definition.version)) {
    errors.push('IntakeDefinition.version must follow semantic versioning (e.g., "1.0.0")');
  }

  if (!definition.name) {
    errors.push('IntakeDefinition.name is required');
  }

  if (!definition.schema) {
    errors.push('IntakeDefinition.schema is required');
  }

  if (!definition.destination) {
    errors.push('IntakeDefinition.destination is required');
  } else {
    const dest = definition.destination;
    if (!dest.type) {
      errors.push('IntakeDefinition.destination.type is required');
    }
    if (!dest.name) {
      errors.push('IntakeDefinition.destination.name is required');
    }
    if (!dest.config || typeof dest.config !== 'object') {
      errors.push('IntakeDefinition.destination.config must be an object');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}
