import { IntakeSchema } from '@formbridge/react-form-renderer';

/**
 * Vendor Onboarding Schema
 *
 * This schema demonstrates all field types supported by FormBridge:
 * - String fields with various formats (email, url, tel)
 * - Number fields (integer and decimal)
 * - Boolean fields
 * - Enum fields (select and radio)
 * - Array fields for repeatable data
 * - Nested object fields
 */
export const vendorOnboardingSchema: IntakeSchema = {
  intakeId: 'vendor-onboarding',
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  title: 'Vendor Onboarding Form',
  description: 'Complete this form to register your company as a vendor',
  properties: {
    // String fields with various formats
    companyName: {
      type: 'string',
      title: 'Company Name',
      description: 'Legal name of your company',
      minLength: 2,
      maxLength: 100,
    },
    email: {
      type: 'string',
      format: 'email',
      title: 'Primary Email',
      description: 'Main contact email for your company',
    },
    website: {
      type: 'string',
      format: 'uri',
      title: 'Website',
      description: 'Your company website URL',
    },
    phone: {
      type: 'string',
      format: 'tel',
      title: 'Phone Number',
      description: 'Primary contact phone number',
      pattern: '^[+]?[(]?[0-9]{1,4}[)]?[-\\s.]?[(]?[0-9]{1,4}[)]?[-\\s.]?[0-9]{1,9}$',
    },

    // Textarea field (long description)
    description: {
      type: 'string',
      title: 'Company Description',
      description: 'Brief description of your company and services',
      minLength: 50,
      maxLength: 500,
    },

    // Number fields
    yearEstablished: {
      type: 'integer',
      title: 'Year Established',
      description: 'Year your company was founded',
      minimum: 1800,
      maximum: new Date().getFullYear(),
    },
    annualRevenue: {
      type: 'number',
      title: 'Annual Revenue (USD)',
      description: 'Approximate annual revenue in US dollars',
      minimum: 0,
    },
    employeeCount: {
      type: 'integer',
      title: 'Number of Employees',
      description: 'Total number of employees',
      minimum: 1,
      maximum: 1000000,
    },

    // Boolean fields
    isMinorityOwned: {
      type: 'boolean',
      title: 'Minority-Owned Business',
      description: 'Is your company certified as a minority-owned business?',
    },
    agreeToTerms: {
      type: 'boolean',
      title: 'I agree to the terms and conditions',
    },

    // Enum field (select dropdown - more than 5 options)
    businessType: {
      type: 'string',
      title: 'Business Type',
      description: 'Select your primary business classification',
      enum: [
        'sole-proprietorship',
        'partnership',
        'llc',
        'corporation',
        's-corporation',
        'non-profit',
        'government',
        'other',
      ],
    },

    // Enum field (radio buttons - 5 or fewer options)
    companySize: {
      type: 'string',
      title: 'Company Size',
      description: 'Select the category that best describes your company',
      enum: ['startup', 'small', 'medium', 'enterprise'],
    },

    // Nested object field
    address: {
      type: 'object',
      title: 'Primary Business Address',
      description: 'Main office address',
      properties: {
        street: {
          type: 'string',
          title: 'Street Address',
          minLength: 5,
          maxLength: 100,
        },
        city: {
          type: 'string',
          title: 'City',
          minLength: 2,
          maxLength: 50,
        },
        state: {
          type: 'string',
          title: 'State/Province',
          minLength: 2,
          maxLength: 50,
        },
        zipCode: {
          type: 'string',
          title: 'ZIP/Postal Code',
          pattern: '^[0-9]{5}(-[0-9]{4})?$',
        },
        country: {
          type: 'string',
          title: 'Country',
          enum: ['US', 'CA', 'MX', 'UK', 'AU', 'Other'],
        },
      },
    },

    // Array field (repeatable items)
    certifications: {
      type: 'array',
      title: 'Certifications',
      description: 'List any relevant business certifications',
      minItems: 0,
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            title: 'Certification Name',
            minLength: 2,
            maxLength: 100,
          },
          issuingOrganization: {
            type: 'string',
            title: 'Issuing Organization',
            minLength: 2,
            maxLength: 100,
          },
          expirationDate: {
            type: 'string',
            format: 'date',
            title: 'Expiration Date',
          },
        },
      },
    },

    // Array of strings
    serviceCategories: {
      type: 'array',
      title: 'Service Categories',
      description: 'Categories of services or products you provide',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'string',
        enum: [
          'Manufacturing',
          'Technology',
          'Consulting',
          'Construction',
          'Healthcare',
          'Education',
          'Finance',
          'Retail',
          'Hospitality',
          'Transportation',
        ],
      },
    },

    // File upload field
    documents: {
      type: 'string',
      title: 'Company Documents',
      description: 'Upload relevant company documents (W-9, certificates, etc.)',
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['application/pdf', 'image/png', 'image/jpeg'],
      maxCount: 3,
      multiple: true,
    },
  },
  required: [
    'companyName',
    'email',
    'phone',
    'description',
    'businessType',
    'companySize',
    'agreeToTerms',
    'serviceCategories',
  ],
  additionalProperties: false,
};
