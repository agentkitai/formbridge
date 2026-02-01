/**
 * Test HTTP Server
 * Runs FormBridge locally with sample intake definitions for development/testing
 */

import { serve } from "@hono/node-server";
import { createFormBridgeAppWithIntakes } from "./app.js";
import type { IntakeDefinition } from "./submission-types.js";
import { IntakeId } from "./types/branded.js";

// Sample vendor onboarding intake
const vendorOnboarding: IntakeDefinition = {
  id: IntakeId("vendor-onboarding"),
  version: "1.0.0",
  name: "Vendor Onboarding",
  description: "Onboard new vendors with tax ID, bank account, and documentation",
  schema: {
    type: "object",
    properties: {
      legal_name: { type: "string", minLength: 1, description: "Legal business name" },
      country: { type: "string", enum: ["US", "CA", "UK", "DE", "FR"], description: "Country code" },
      tax_id: { type: "string", pattern: "^[0-9]{2}-[0-9]{7}$", description: "Tax ID (XX-XXXXXXX)" },
      contact_email: { type: "string", format: "email", description: "Contact email" },
      bank_account: {
        type: "object",
        properties: {
          routing: { type: "string", description: "Routing number" },
          account: { type: "string", description: "Account number" },
        },
        required: ["routing", "account"],
      },
      business_type: {
        type: "string",
        enum: ["sole_proprietor", "llc", "corporation", "partnership"],
        description: "Business entity type",
      },
    },
    required: ["legal_name", "country", "tax_id", "contact_email"],
  },
  destination: {
    kind: "webhook",
    url: "https://example.com/vendor-webhook",
  },
};

// Insurance Claim intake — rich schema with 20+ fields, conditional fields, file uploads, approval gates
const insuranceClaim: IntakeDefinition = {
  id: IntakeId("insurance-claim"),
  version: "1.0.0",
  name: "Auto Insurance Claim",
  description: "File a comprehensive auto insurance claim with incident details, vehicle info, and supporting documents",
  schema: {
    type: "object",
    properties: {
      // ── Policy Information ──
      policy_number: { type: "string", minLength: 3, description: "Insurance policy number" },
      policyholder_name: { type: "string", minLength: 1, description: "Name on the policy" },
      policyholder_email: { type: "string", format: "email", description: "Contact email" },
      policyholder_phone: { type: "string", description: "Contact phone number" },
      policy_type: {
        type: "string",
        enum: ["comprehensive", "collision", "liability", "uninsured_motorist"],
        description: "Type of coverage",
      },

      // ── Incident Details ──
      incident_date: { type: "string", description: "Date of the incident (YYYY-MM-DD)" },
      incident_time: { type: "string", description: "Approximate time of the incident" },
      incident_location: { type: "string", description: "Location where the incident occurred" },
      incident_description: { type: "string", minLength: 20, description: "Detailed description of what happened" },
      incident_type: {
        type: "string",
        enum: ["collision", "theft", "vandalism", "weather", "animal", "other"],
        description: "Type of incident",
      },
      fault_assessment: {
        type: "string",
        enum: ["claimant_at_fault", "other_party_at_fault", "shared_fault", "no_fault", "unknown"],
        description: "Initial fault assessment",
      },

      // ── Vehicle Information ──
      vehicle: {
        type: "object",
        description: "Vehicle details",
        properties: {
          make: { type: "string", description: "Vehicle manufacturer" },
          model: { type: "string", description: "Vehicle model" },
          year: { type: "integer", minimum: 1990, maximum: 2025, description: "Model year" },
          vin: { type: "string", description: "Vehicle Identification Number" },
          color: { type: "string", description: "Vehicle color" },
          mileage: { type: "integer", minimum: 0, description: "Current mileage" },
        },
        required: ["make", "model", "year"],
      },

      // ── Damage Assessment ──
      damage_severity: {
        type: "string",
        enum: ["minor", "moderate", "severe", "total_loss"],
        description: "Severity of the damage",
      },
      damage_areas: {
        type: "string",
        description: "Areas of the vehicle that are damaged (e.g. front bumper, hood, windshield)",
      },
      estimated_repair_cost: { type: "number", minimum: 0, description: "Estimated cost of repair in USD" },
      is_drivable: { type: "boolean", description: "Can the vehicle still be driven?" },

      // ── Conditional: Police Report ──
      police_report_filed: { type: "boolean", description: "Was a police report filed?" },
      police_report_number: { type: "string", description: "Police report number (if filed)" },
      police_department: { type: "string", description: "Name of the police department" },

      // ── Conditional: Injuries ──
      injuries_reported: { type: "boolean", description: "Were any injuries reported?" },
      injury_description: { type: "string", description: "Description of injuries" },
      medical_treatment_sought: { type: "boolean", description: "Was medical treatment sought?" },

      // ── Other Party Info ──
      other_party: {
        type: "object",
        description: "Other party's information (if applicable)",
        properties: {
          name: { type: "string", description: "Other driver's name" },
          phone: { type: "string", description: "Other driver's phone" },
          insurance_company: { type: "string", description: "Other driver's insurance company" },
          policy_number: { type: "string", description: "Other driver's policy number" },
        },
      },

      // ── Witnesses ──
      has_witnesses: { type: "boolean", description: "Were there any witnesses?" },
      witness_info: { type: "string", description: "Witness names and contact information" },

      // ── File Uploads ──
      damage_photos: {
        type: "file",
        description: "Photos of the vehicle damage",
        maxSize: 10485760,
        allowedTypes: ["image/jpeg", "image/png", "image/webp"],
        maxCount: 5,
      },
      police_report_document: {
        type: "file",
        description: "Scanned copy of the police report (PDF)",
        maxSize: 5242880,
        allowedTypes: ["application/pdf"],
        maxCount: 1,
      },

      // ── Additional ──
      additional_notes: { type: "string", description: "Any additional information" },
      preferred_repair_shop: { type: "string", description: "Preferred body shop for repairs" },
    },
    required: [
      "policy_number",
      "policyholder_name",
      "policyholder_email",
      "incident_date",
      "incident_location",
      "incident_description",
      "incident_type",
      "damage_severity",
    ],
  },
  // Approval gates — triggers needs_review state on submit
  approvalGates: [
    {
      name: "claims-adjuster-review",
      reviewers: ["claims-adjuster"],
      requiredApprovals: 1,
    },
  ],
  destination: {
    kind: "webhook",
    url: "https://example.com/insurance-claim-webhook",
  },
};

// Simple contact form intake
const contactForm: IntakeDefinition = {
  id: IntakeId("contact-form"),
  version: "1.0.0",
  name: "Contact Form",
  description: "Simple contact form",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, description: "Your name" },
      email: { type: "string", format: "email", description: "Your email" },
      message: { type: "string", minLength: 10, description: "Your message" },
    },
    required: ["name", "email", "message"],
  },
  destination: {
    kind: "webhook",
    url: "https://example.com/contact-webhook",
  },
};

const app = createFormBridgeAppWithIntakes(
  [vendorOnboarding, insuranceClaim, contactForm],
  { cors: { origin: "*", allowMethods: ["GET", "POST", "PATCH", "OPTIONS"] } }
);

const PORT = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n🌉 FormBridge dev server running at http://localhost:${PORT}\n`);
  console.log("Available intakes:");
  console.log("  GET  /health");
  console.log("  GET  /intake/vendor-onboarding/schema");
  console.log("  GET  /intake/insurance-claim/schema");
  console.log("  GET  /intake/contact-form/schema");
  console.log("  POST /intake/vendor-onboarding/submissions");
  console.log("  POST /intake/insurance-claim/submissions");
  console.log("  POST /intake/contact-form/submissions");
  console.log("");
});

export default app;
