export const vendorOnboardingIntake = {
    id: 'vendor_onboarding_v1',
    version: '1.0.0',
    name: 'Vendor Onboarding',
    description: 'Complete vendor onboarding with compliance review and document collection',
    schema: {
        type: 'object',
        required: ['legal_name', 'country', 'tax_id', 'contact_email', 'bank_account', 'docs'],
        properties: {
            legal_name: {
                type: 'string',
                minLength: 1,
                maxLength: 200,
                description: 'Legal entity name',
            },
            country: {
                type: 'string',
                enum: ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'JP', 'SG'],
                description: 'Country of incorporation',
            },
            tax_id: {
                type: 'string',
                pattern: '^[A-Z0-9-]+$',
                minLength: 5,
                maxLength: 20,
                description: 'Tax identification number (EIN for US, VAT for EU, etc.)',
            },
            contact_email: {
                type: 'string',
                format: 'email',
                description: 'Primary contact email for accounts payable',
            },
            bank_account: {
                type: 'object',
                required: ['account_type'],
                properties: {
                    account_type: {
                        type: 'string',
                        enum: ['us_ach', 'iban', 'swift'],
                        description: 'Bank account type',
                    },
                    routing_number: {
                        type: 'string',
                        pattern: '^[0-9]{9}$',
                        description: 'US ACH routing number (9 digits)',
                    },
                    account_number: {
                        type: 'string',
                        minLength: 4,
                        maxLength: 17,
                        description: 'Bank account number',
                    },
                    iban: {
                        type: 'string',
                        pattern: '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$',
                        minLength: 15,
                        maxLength: 34,
                        description: 'International Bank Account Number',
                    },
                    swift_bic: {
                        type: 'string',
                        pattern: '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$',
                        description: 'SWIFT/BIC code',
                    },
                },
            },
            docs: {
                type: 'object',
                required: ['w9_or_w8', 'insurance_certificate'],
                properties: {
                    w9_or_w8: {
                        type: 'object',
                        description: 'W-9 (US vendors) or W-8 (non-US vendors) tax form',
                        properties: {
                            filename: { type: 'string' },
                            mimeType: { type: 'string', enum: ['application/pdf'] },
                            sizeBytes: { type: 'number', maximum: 10000000 },
                            sha256: { type: 'string' },
                        },
                        required: ['filename', 'mimeType', 'sizeBytes'],
                    },
                    insurance_certificate: {
                        type: 'object',
                        description: 'Certificate of insurance (general liability)',
                        properties: {
                            filename: { type: 'string' },
                            mimeType: { type: 'string', enum: ['application/pdf'] },
                            sizeBytes: { type: 'number', maximum: 10000000 },
                            sha256: { type: 'string' },
                        },
                        required: ['filename', 'mimeType', 'sizeBytes'],
                    },
                },
            },
            risk: {
                type: 'object',
                description: 'Risk assessment data',
                properties: {
                    sanctions_check_passed: {
                        type: 'boolean',
                        description: 'Has vendor passed sanctions screening?',
                    },
                    sanctions_check_evidence: {
                        type: 'string',
                        description: 'Reference or evidence of sanctions check',
                    },
                    risk_tier: {
                        type: 'string',
                        enum: ['low', 'medium', 'high'],
                        description: 'Risk classification',
                    },
                },
            },
            notes: {
                type: 'string',
                maxLength: 2000,
                description: 'Additional notes or special instructions',
            },
        },
    },
    approvalGates: [
        {
            name: 'compliance_review',
            reviewers: {
                kind: 'role',
                role: 'compliance_team',
            },
            requiredApprovals: 1,
            escalateAfterMs: 86400000,
        },
    ],
    destination: {
        kind: 'webhook',
        url: 'https://api.example.com/vendor-master/onboarding',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Version': '2024-01',
        },
        retryPolicy: {
            maxAttempts: 5,
            initialDelayMs: 1000,
            backoffMultiplier: 2,
            maxDelayMs: 60000,
        },
    },
    ttlMs: 604800000,
    uiHints: {
        steps: [
            {
                id: 'basic_info',
                title: 'Basic Information',
                description: 'Legal entity details and contact',
                fields: ['legal_name', 'country', 'tax_id', 'contact_email'],
                order: 1,
            },
            {
                id: 'banking',
                title: 'Banking Details',
                description: 'Payment account information',
                fields: ['bank_account'],
                order: 2,
            },
            {
                id: 'documents',
                title: 'Required Documents',
                description: 'Upload tax forms and insurance',
                fields: ['docs.w9_or_w8', 'docs.insurance_certificate'],
                order: 3,
            },
            {
                id: 'risk',
                title: 'Risk Assessment',
                description: 'Compliance and risk information',
                fields: ['risk'],
                order: 4,
            },
            {
                id: 'review',
                title: 'Review & Submit',
                description: 'Verify all information before submission',
                fields: ['notes'],
                order: 5,
            },
        ],
        fieldHints: {
            legal_name: {
                label: 'Legal Entity Name',
                description: 'Full legal name as registered with tax authorities',
                placeholder: 'Acme Supplies Ltd',
            },
            country: {
                label: 'Country of Incorporation',
                widget: 'select',
            },
            tax_id: {
                label: 'Tax ID',
                description: 'EIN for US vendors, VAT number for EU, etc.',
                placeholder: 'XX-XXXXXXX',
            },
            contact_email: {
                label: 'Accounts Payable Email',
                placeholder: 'ap@vendor.com',
            },
            'bank_account.account_type': {
                label: 'Account Type',
                widget: 'radio',
            },
            'bank_account.routing_number': {
                label: 'Routing Number',
                description: '9-digit ABA routing number',
                placeholder: '123456789',
            },
            'bank_account.account_number': {
                label: 'Account Number',
                placeholder: 'XXXXXXXXXXXX',
            },
            'bank_account.iban': {
                label: 'IBAN',
                placeholder: 'GB29 NWBK 6016 1331 9268 19',
            },
            'bank_account.swift_bic': {
                label: 'SWIFT/BIC Code',
                placeholder: 'NWBKGB2L',
            },
            'docs.w9_or_w8': {
                label: 'W-9 or W-8 Tax Form',
                description: 'Upload completed tax form (PDF only, max 10MB)',
                widget: 'file_upload',
                options: {
                    accept: ['application/pdf'],
                    maxBytes: 10000000,
                },
            },
            'docs.insurance_certificate': {
                label: 'Insurance Certificate',
                description: 'General liability insurance certificate (PDF only, max 10MB)',
                widget: 'file_upload',
                options: {
                    accept: ['application/pdf'],
                    maxBytes: 10000000,
                },
            },
            'risk.sanctions_check_passed': {
                label: 'Sanctions Check Passed',
                widget: 'checkbox',
            },
            'risk.sanctions_check_evidence': {
                label: 'Sanctions Check Reference',
                description: 'Case ID or reference number from sanctions screening',
                placeholder: 'OFAC-2024-XXXXXX',
            },
            'risk.risk_tier': {
                label: 'Risk Classification',
                widget: 'radio',
            },
            notes: {
                label: 'Additional Notes',
                description: 'Any special requirements or notes for this vendor',
                widget: 'textarea',
                placeholder: 'Optional notes...',
            },
        },
    },
};
export default vendorOnboardingIntake;
//# sourceMappingURL=vendor-onboarding.js.map