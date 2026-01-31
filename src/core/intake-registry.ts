/**
 * IntakeRegistry - Manages intake definitions
 *
 * Implements:
 * - In-memory storage of intake definitions (Map<intakeId, IntakeDefinition>)
 * - Registration and retrieval of intake schemas
 * - Optional validation of intake definitions
 * - Version management for intake definitions
 *
 * Based on INTAKE_CONTRACT_SPEC.md v0.1.0-draft §11
 */

import type { IntakeDefinition, JSONSchema } from '../types.js';
import { validateWebhookUrl } from './url-validation.js';

/**
 * Configuration options for IntakeRegistry
 */
export interface IntakeRegistryConfig {
  /** Validate intake definitions on registration (default: true) */
  validateOnRegister?: boolean;
  /** Allow overwriting existing intake definitions (default: false) */
  allowOverwrite?: boolean;
}

/**
 * Error thrown when an intake definition is not found
 */
export class IntakeNotFoundError extends Error {
  constructor(intakeId: string) {
    super(`Intake definition not found: ${intakeId}`);
    this.name = 'IntakeNotFoundError';
  }
}

/**
 * Error thrown when attempting to register a duplicate intake
 */
export class IntakeDuplicateError extends Error {
  constructor(intakeId: string) {
    super(`Intake definition already exists: ${intakeId}. Use allowOverwrite option to replace.`);
    this.name = 'IntakeDuplicateError';
  }
}

/**
 * Error thrown when an intake definition is invalid
 */
export class IntakeValidationError extends Error {
  constructor(intakeId: string, reason: string) {
    super(`Invalid intake definition '${intakeId}': ${reason}`);
    this.name = 'IntakeValidationError';
  }
}

/**
 * IntakeRegistry manages the lifecycle of intake definitions.
 *
 * Responsibilities:
 * - Storing intake definitions in memory
 * - Validating intake definitions on registration
 * - Retrieving intake definitions by ID
 * - Version management and updates
 * - Listing all available intakes
 *
 * See §11 for intake definition specification.
 */
export class IntakeRegistry {
  private readonly intakes: Map<string, IntakeDefinition> = new Map();
  private readonly config: Required<IntakeRegistryConfig>;

  constructor(config: IntakeRegistryConfig = {}) {
    this.config = {
      validateOnRegister: config.validateOnRegister ?? true,
      allowOverwrite: config.allowOverwrite ?? false,
    };
  }

  /**
   * Registers a new intake definition.
   *
   * @param intake - The intake definition to register
   * @throws {IntakeDuplicateError} If intake already exists and allowOverwrite is false
   * @throws {IntakeValidationError} If intake definition is invalid
   */
  registerIntake(intake: IntakeDefinition): void {
    // Check for duplicates
    if (this.intakes.has(intake.id) && !this.config.allowOverwrite) {
      throw new IntakeDuplicateError(intake.id);
    }

    // Validate the intake definition if enabled
    if (this.config.validateOnRegister) {
      this.validateIntakeDefinition(intake);
    }

    // Store the intake definition
    this.intakes.set(intake.id, intake);
  }

  /**
   * Retrieves an intake definition by ID.
   *
   * @param intakeId - The intake ID to retrieve
   * @returns The intake definition
   * @throws {IntakeNotFoundError} If intake not found
   */
  getIntake(intakeId: string): IntakeDefinition {
    const intake = this.intakes.get(intakeId);
    if (!intake) {
      throw new IntakeNotFoundError(intakeId);
    }
    return intake;
  }

  /**
   * Checks if an intake definition exists.
   *
   * @param intakeId - The intake ID to check
   * @returns True if the intake exists, false otherwise
   */
  hasIntake(intakeId: string): boolean {
    return this.intakes.has(intakeId);
  }

  /**
   * Lists all registered intake IDs.
   *
   * @returns Array of intake IDs
   */
  listIntakeIds(): string[] {
    return Array.from(this.intakes.keys());
  }

  /**
   * Lists all registered intake definitions.
   *
   * @returns Array of intake definitions
   */
  listIntakes(): IntakeDefinition[] {
    return Array.from(this.intakes.values());
  }

  /**
   * Removes an intake definition from the registry.
   *
   * @param intakeId - The intake ID to remove
   * @returns True if the intake was removed, false if it didn't exist
   */
  unregisterIntake(intakeId: string): boolean {
    return this.intakes.delete(intakeId);
  }

  /**
   * Gets the JSON Schema for a specific intake.
   *
   * @param intakeId - The intake ID
   * @returns The JSON Schema
   * @throws {IntakeNotFoundError} If intake not found
   */
  getSchema(intakeId: string): JSONSchema {
    const intake = this.getIntake(intakeId);
    return intake.schema as JSONSchema;
  }

  /**
   * Clears all registered intake definitions.
   * Useful for testing.
   */
  clear(): void {
    this.intakes.clear();
  }

  /**
   * Gets the count of registered intakes.
   *
   * @returns Number of registered intakes
   */
  count(): number {
    return this.intakes.size;
  }

  /**
   * Validates an intake definition.
   * Throws IntakeValidationError if invalid.
   *
   * @param intake - The intake definition to validate
   * @throws {IntakeValidationError} If validation fails
   */
  private validateIntakeDefinition(intake: IntakeDefinition): void {
    // Validate required fields
    if (!intake.id || typeof intake.id !== 'string' || intake.id.trim() === '') {
      throw new IntakeValidationError(intake.id, 'id is required and must be a non-empty string');
    }

    if (!intake.version || typeof intake.version !== 'string') {
      throw new IntakeValidationError(intake.id, 'version is required and must be a string');
    }

    if (!intake.name || typeof intake.name !== 'string') {
      throw new IntakeValidationError(intake.id, 'name is required and must be a string');
    }

    if (!intake.schema || typeof intake.schema !== 'object') {
      throw new IntakeValidationError(intake.id, 'schema is required and must be a JSON Schema object');
    }

    if (!intake.destination || typeof intake.destination !== 'object') {
      throw new IntakeValidationError(intake.id, 'destination is required and must be an object');
    }

    // Validate schema structure
    this.validateSchema(intake.id, intake.schema);

    // Validate destination
    this.validateDestination(intake.id, intake.destination);

    // Validate approval gates if present
    if (intake.approvalGates) {
      this.validateApprovalGates(intake.id, intake.approvalGates);
    }

    // Validate UI hints if present
    if (intake.uiHints) {
      this.validateUIHints(intake.id, intake.uiHints);
    }
  }

  /**
   * Validates the JSON Schema structure.
   */
  private validateSchema(intakeId: string, schema: JSONSchema): void {
    if (!schema.type && !schema.$ref && !schema.properties) {
      throw new IntakeValidationError(
        intakeId,
        'schema must have at least one of: type, $ref, or properties'
      );
    }

    // If properties are defined, ensure they're an object
    if (schema.properties && typeof schema.properties !== 'object') {
      throw new IntakeValidationError(intakeId, 'schema.properties must be an object');
    }

    // If required is defined, ensure it's an array
    if (schema.required && !Array.isArray(schema.required)) {
      throw new IntakeValidationError(intakeId, 'schema.required must be an array');
    }
  }

  /**
   * Validates the destination configuration.
   */
  private validateDestination(intakeId: string, destination: IntakeDefinition['destination']): void {
    const validKinds = ['webhook', 'callback', 'queue'];
    if (!validKinds.includes(destination.kind)) {
      throw new IntakeValidationError(
        intakeId,
        `destination.kind must be one of: ${validKinds.join(', ')}`
      );
    }

    // Webhook destinations must have a URL
    if (destination.kind === 'webhook') {
      if (!destination.url || typeof destination.url !== 'string') {
        throw new IntakeValidationError(
          intakeId,
          'destination.url is required for webhook destinations'
        );
      }

      // Basic URL validation
      try {
        new URL(destination.url);
      } catch {
        throw new IntakeValidationError(intakeId, 'destination.url must be a valid URL');
      }

      // SSRF protection: block private/internal URLs
      const ssrfError = validateWebhookUrl(destination.url);
      if (ssrfError) {
        throw new IntakeValidationError(intakeId, `destination.url blocked: ${ssrfError}`);
      }
    }

    // Validate retry policy if present
    if (destination.retryPolicy) {
      const policy = destination.retryPolicy as Record<string, unknown>;
      if (typeof policy.maxAttempts !== 'number' || policy.maxAttempts < 0) {
        throw new IntakeValidationError(
          intakeId,
          'destination.retryPolicy.maxAttempts must be a non-negative number'
        );
      }
      if (typeof policy.initialDelayMs !== 'number' || policy.initialDelayMs < 0) {
        throw new IntakeValidationError(
          intakeId,
          'destination.retryPolicy.initialDelayMs must be a non-negative number'
        );
      }
      if (typeof policy.backoffMultiplier !== 'number' || policy.backoffMultiplier < 1) {
        throw new IntakeValidationError(
          intakeId,
          'destination.retryPolicy.backoffMultiplier must be >= 1'
        );
      }
    }
  }

  /**
   * Validates approval gates configuration.
   */
  private validateApprovalGates(
    intakeId: string,
    approvalGates: IntakeDefinition['approvalGates']
  ): void {
    if (!Array.isArray(approvalGates)) {
      throw new IntakeValidationError(intakeId, 'approvalGates must be an array');
    }

    for (const gate of approvalGates) {
      if (!gate.name || typeof gate.name !== 'string') {
        throw new IntakeValidationError(intakeId, 'each approvalGate must have a name string');
      }

      if (!gate.reviewers || typeof gate.reviewers !== 'object') {
        throw new IntakeValidationError(
          intakeId,
          `approvalGate '${gate.name}' must have a reviewers object`
        );
      }

      if (gate.requiredApprovals !== undefined) {
        if (typeof gate.requiredApprovals !== 'number' || gate.requiredApprovals < 1) {
          throw new IntakeValidationError(
            intakeId,
            `approvalGate '${gate.name}' requiredApprovals must be a positive number`
          );
        }
      }
    }
  }

  /**
   * Validates UI hints configuration.
   */
  private validateUIHints(intakeId: string, uiHints: IntakeDefinition['uiHints']): void {
    if (typeof uiHints !== 'object') {
      throw new IntakeValidationError(intakeId, 'uiHints must be an object');
    }

    // Validate steps if present
    if (uiHints.steps) {
      if (!Array.isArray(uiHints.steps)) {
        throw new IntakeValidationError(intakeId, 'uiHints.steps must be an array');
      }

      for (const step of uiHints.steps as Record<string, unknown>[]) {
        if (!step.id || typeof step.id !== 'string') {
          throw new IntakeValidationError(intakeId, 'each step must have an id string');
        }
        if (!step.title || typeof step.title !== 'string') {
          throw new IntakeValidationError(intakeId, 'each step must have a title string');
        }
        if (!Array.isArray(step.fields)) {
          throw new IntakeValidationError(intakeId, 'each step must have a fields array');
        }
      }
    }

    // Validate fieldHints if present
    if (uiHints.fieldHints) {
      if (typeof uiHints.fieldHints !== 'object') {
        throw new IntakeValidationError(intakeId, 'uiHints.fieldHints must be an object');
      }
    }
  }
}
