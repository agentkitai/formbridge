import { z } from 'zod';
import type { IntakeDefinition } from '../../src/schemas/intake-schema';
export declare const vendorOnboardingSchema: z.ZodObject<{
    legal_name: z.ZodString;
    country: z.ZodString;
    tax_id: z.ZodString;
    bank_account: z.ZodObject<{
        account_number: z.ZodString;
        routing_number: z.ZodString;
        account_holder_name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        account_number: string;
        routing_number: string;
        account_holder_name: string;
    }, {
        account_number: string;
        routing_number: string;
        account_holder_name: string;
    }>;
    documents: z.ZodObject<{
        w9_or_w8: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        w9_or_w8: string;
    }, {
        w9_or_w8: string;
    }>;
    contact_info: z.ZodObject<{
        name: z.ZodString;
        email: z.ZodString;
        phone: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        email: string;
        phone: string;
    }, {
        name: string;
        email: string;
        phone: string;
    }>;
    business_type: z.ZodEnum<["sole_proprietor", "llc", "corporation", "partnership"]>;
    employees: z.ZodNumber;
    annual_revenue: z.ZodNumber;
    established_date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    legal_name: string;
    country: string;
    tax_id: string;
    bank_account: {
        account_number: string;
        routing_number: string;
        account_holder_name: string;
    };
    documents: {
        w9_or_w8: string;
    };
    contact_info: {
        name: string;
        email: string;
        phone: string;
    };
    business_type: "sole_proprietor" | "llc" | "corporation" | "partnership";
    employees: number;
    annual_revenue: number;
    established_date: string;
}, {
    legal_name: string;
    country: string;
    tax_id: string;
    bank_account: {
        account_number: string;
        routing_number: string;
        account_holder_name: string;
    };
    documents: {
        w9_or_w8: string;
    };
    contact_info: {
        name: string;
        email: string;
        phone: string;
    };
    business_type: "sole_proprietor" | "llc" | "corporation" | "partnership";
    employees: number;
    annual_revenue: number;
    established_date: string;
}>;
export declare const vendorOnboardingIntake: IntakeDefinition;
//# sourceMappingURL=schema.d.ts.map