import { z } from 'zod';
export const vendorOnboardingSchema = z.object({
    legal_name: z.string().describe('Legal business name'),
    country: z.string().length(2).describe('Two-letter country code (ISO 3166-1 alpha-2)'),
    tax_id: z.string().describe('Tax identification number'),
    bank_account: z.object({
        account_number: z.string().describe('Bank account number'),
        routing_number: z.string().describe('Bank routing number'),
        account_holder_name: z.string().describe('Account holder name'),
    }).describe('Bank account information'),
    documents: z.object({
        w9_or_w8: z.string().describe('W-9 or W-8 form upload'),
    }).describe('Required tax documents'),
    contact_info: z.object({
        name: z.string().describe('Primary contact name'),
        email: z.string().email().describe('Primary contact email'),
        phone: z.string().describe('Primary contact phone'),
    }).describe('Contact information'),
    business_type: z.enum(['sole_proprietor', 'llc', 'corporation', 'partnership'])
        .describe('Type of business entity'),
    employees: z.number().min(1).describe('Number of employees'),
    annual_revenue: z.number().min(0).describe('Annual revenue in USD'),
    established_date: z.string().describe('Date business was established (ISO 8601)'),
});
export const vendorOnboardingIntake = {
    id: 'vendor_onboarding',
    version: '1.0.0',
    name: 'Vendor Onboarding',
    description: 'Onboard new vendors with banking, tax, and business information',
    schema: vendorOnboardingSchema,
    approvalGates: [
        {
            id: 'high_revenue_approval',
            name: 'High Revenue Approval',
            description: 'Requires approval for vendors with annual revenue over $1M',
            condition: 'annual_revenue > 1000000',
            required: true,
        },
    ],
    destination: {
        type: 'webhook',
        name: 'Vendor Management System',
        config: {
            url: 'https://api.example.com/vendors',
            method: 'POST',
        },
        webhookUrl: 'https://api.example.com/webhooks/vendor-created',
        retry: {
            maxAttempts: 3,
            delayMs: 1000,
            backoffMultiplier: 2,
        },
    },
    fieldHints: {
        legal_name: {
            label: 'Legal Business Name',
            placeholder: 'Acme Corporation',
            helpText: 'Enter the exact legal name as it appears on tax documents',
            order: 1,
        },
        country: {
            label: 'Country',
            placeholder: 'US',
            helpText: 'Two-letter ISO country code',
            order: 2,
        },
        tax_id: {
            label: 'Tax ID',
            placeholder: '12-3456789',
            helpText: 'EIN, SSN, or equivalent tax identifier',
            order: 3,
        },
        business_type: {
            label: 'Business Type',
            helpText: 'Select the legal structure of your business',
            order: 4,
        },
        employees: {
            label: 'Number of Employees',
            placeholder: '50',
            order: 5,
        },
        annual_revenue: {
            label: 'Annual Revenue (USD)',
            placeholder: '500000',
            helpText: 'Total revenue for the most recent fiscal year',
            order: 6,
        },
        established_date: {
            label: 'Established Date',
            placeholder: '2020-01-15',
            helpText: 'Date when business was legally established (YYYY-MM-DD)',
            order: 7,
        },
    },
};
//# sourceMappingURL=schema.js.map