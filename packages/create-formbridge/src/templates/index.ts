/**
 * Template catalog for the CLI scaffolding tool.
 *
 * Maps template IDs from @agentkitai/formbridge-templates to interactive prompt choices.
 */

export const TEMPLATE_CHOICES = [
  {
    value: "vendor-onboarding",
    label: "Vendor Onboarding",
    hint: "Vendor registration & compliance",
  },
  {
    value: "it-access-request",
    label: "IT Access Request",
    hint: "System/resource access requests",
  },
  {
    value: "customer-intake",
    label: "Customer Intake",
    hint: "Customer registration form",
  },
  {
    value: "expense-report",
    label: "Expense Report",
    hint: "Employee expense submission",
  },
  {
    value: "bug-report",
    label: "Bug Report",
    hint: "Software issue tracking",
  },
] as const;

export const AVAILABLE_TEMPLATE_IDS = TEMPLATE_CHOICES.map((c) => c.value);
