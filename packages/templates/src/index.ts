/**
 * @agentkitai/formbridge-templates — Example intake templates
 *
 * Each template exports:
 * - schema: Zod schema for validation
 * - jsonSchema: JSON Schema representation
 * - metadata: Template metadata (id, name, description, category)
 */

export { vendorOnboarding } from './vendor-onboarding/index.js';
export { itAccessRequest } from './it-access-request/index.js';
export { customerIntake } from './customer-intake/index.js';
export { expenseReport } from './expense-report/index.js';
export { bugReport } from './bug-report/index.js';

export type { TemplateMetadata, TemplateExport } from './types.js';

/** All templates keyed by ID */
export { allTemplates } from './all.js';
