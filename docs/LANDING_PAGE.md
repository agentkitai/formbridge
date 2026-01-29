# FormBridge Landing Page Structure

## Hero

**Headline:** Agent-native intake from your schemas

**Subheadline:** Turn Zod / JSON Schema / OpenAPI into a dual-interface intake point: an embeddable web form for humans + an MCP tool (or plain HTTP) for agents — backed by the same validation and destination.

**Primary CTA:** Get started (OSS SDK)
**Secondary CTA:** Read the Intake Contract (spec)
**Tertiary CTA (optional):** View demo (Vendor onboarding)

**3 quick value bullets:**
- **Agents can retry safely:** structured errors + idempotency keys
- **Resumable multi-step intake:** pause → gather info → resume with state intact
- **Mixed-mode by default:** human approvals, audit trail, governance controls

**Code teaser:**
```json
{
  "error": { "type": "missing", "fields": ["tax_id"], "resumeToken": "fb_8x3k..." }
}
```

---

## Problem

**Section title:** Agents break at the handoff

**Short intro:** Production agents don't fail on reasoning — they fail when they need structured inputs from humans, documents, and approvals.

**Pain points (grid):**
- **Brittle automation:** Headless browsing breaks on UI changes
- **Glue code everywhere:** Custom endpoints per form/workflow
- **No agent semantics:** APIs return human-centric validation errors
- **No governance:** Hard to prove who submitted/approved what, and when
- **Mixed-mode is hacked:** Human-in-the-loop becomes manual busywork

**Callout quote (optional):**
*"Every workflow becomes a form, and every form becomes a blocker."*

---

## Solution

**Section title:** One schema. Two interfaces. One contract.

**Core pitch:** FormBridge generates:
- **Human UI:** a clean, embeddable React form (or hosted page)
- **Agent interface:** an MCP tool endpoint (plus plain HTTP/JSON)

**What makes it different (the wedge):**
The FormBridge Intake Contract — a submission state machine + error schema designed for agent loops and mixed-mode governance.

**Feature bullets (with "why it matters"):**

- **Structured validation taxonomy** (missing/invalid/conflict/needs-approval)
  → Agents can repair and retry deterministically.

- **Idempotency + dedupe**
  → Safe retries, no duplicate vendor records.

- **Resumable sessions**
  → Agents can pause, ask a human, come back with a resume token.

- **Upload negotiation** (signed URLs + constraints)
  → Agents can orchestrate file collection reliably.

- **Approval gates + audit events**
  → Compliance workflows become first-class, not bolt-ons.

---

## How it works

**Section title:** Define once, deploy everywhere

**Step 1 — Bring your schema**
- Zod / JSON Schema / OpenAPI
- Annotate descriptions, examples, and constraints (optional but recommended)

**Step 2 — Generate interfaces**
- React component (embeddable) or hosted form page
- MCP tool (and HTTP endpoint) with discoverable, typed input schema

**Step 3 — Run intake sessions**
- Start a session (`submission.created`)
- Agent pre-fills what it knows, requests missing info
- Human uploads/edits as needed
- Submit for review, approve, finalize

**Step 4 — Deliver to your destination**
- Forward finalized payload to your existing API/webhook
- Emit audit-ready events for downstream systems

**Optional mini diagram:**
```
Schema → (UI renderer) + (MCP/HTTP server) → Intake sessions → Webhook/API + Event stream
```

---

## Pricing

**Section title:** Start OSS. Upgrade when governance matters.

### OSS SDK — Free
- Schema → React form + MCP/HTTP endpoint generator
- Intake Contract runtime (errors, resume tokens, idempotency)
- Local event log + webhook forwarding
- Community support
- **CTA:** Install the SDK

### Hosted Starter — $ (self-serve)
- Hosted endpoints + managed storage (optional)
- API keys + basic auth
- Rate limiting
- Webhooks
- Basic dashboard

### Team — $ (production)
- Tenant isolation
- PII controls (retention policies, redaction rules)
- Audit log explorer + export
- SSO (SAML/OIDC)
- Higher limits + support SLA

### Enterprise — $$
- Custom data residency / BYOK (if you choose to offer)
- Advanced policy controls
- Dedicated support
- Compliance packages (if relevant)

**Footnote positioning line:**
*If you don't want FormBridge storing anything, you can run it in "forward-only" mode: store state in your own DB, and FormBridge just enforces the contract + emits events.*

---

## Optional sections (worth adding for "real SaaS" feel)

- **Security & governance** (encryption, access scoping, retention, redaction)
- **Integrations** (webhooks, Kafka/SQS, CRMs, vendor systems)
- **FAQ** (How is this different from Typeform? Do I need MCP? Can I self-host?)
