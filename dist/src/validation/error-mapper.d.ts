import { z } from 'zod';
import type { IntakeError } from '../types/intake-contract.js';
export declare function mapToIntakeError(zodError: z.ZodError, options?: ErrorMapperOptions): IntakeError;
export interface ErrorMapperOptions {
    includeValues?: boolean;
    resumeToken?: string;
    idempotencyKey?: string;
    includeTimestamp?: boolean;
}
export declare function mapMultipleToIntakeError(zodErrors: z.ZodError[], options?: ErrorMapperOptions): IntakeError;
//# sourceMappingURL=error-mapper.d.ts.map