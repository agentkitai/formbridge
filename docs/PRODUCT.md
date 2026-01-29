# FormBridge — Agent-native intake from your schemas

AI agents are moving into production, but they keep stalling at the same bottleneck: collecting structured data. An agent onboarding a vendor needs tax IDs, compliance documents, and bank details. An agent qualifying a lead needs budget, timeline, and decision-maker info. An agent processing an IT access request needs role, justification, and manager sign-off. These are the handoff points where agents must gather real-world information — from humans, from other systems, or from a mix of both. Today, developers solve this with fragile browser automation, custom API glue, or by dropping a human into the loop every time. There's no standard way for an agent to discover an intake form, understand its fields, and submit structured data with proper validation, error handling, and audit trails.

FormBridge turns your existing schema — Zod, JSON Schema, or OpenAPI — into a dual-interface intake point:

- a polished, embeddable web form for humans
- a discoverable MCP tool endpoint for agents (with plain HTTP/JSON as a first-class alternative)

One definition, two interfaces, same validation, same destination. If you already have an API, FormBridge gives you the agent-grade submission semantics and human fallback UI you don't have today.

MCP wrapping is becoming table stakes. Tools that generate MCP servers from OpenAPI already exist. FormBridge's core is what those tools don't provide: the **FormBridge Intake Contract** — a submission state machine and error schema that agents can reliably loop over.

## The Intake Contract includes:

- **Retryable, structured validation designed for LLM loops**
  Example: `{ type: "missing", fields: ["tax_id"], resumeToken: "fb_8x3k..." }`

- **Idempotent submissions** so agents can safely retry without duplicates

- **Resumable multi-step intake** with partial saves (pause → gather info → resume)

- **File upload negotiation** via signed URLs with declared constraints

- **Human approval gates** for sensitive workflows (agent fills → human reviews → finalize)

- **Audit-ready events** on every transition: `submission.created`, `field.updated`, `review.requested`, `approved`, `finalized`

## Mixed-Mode by Default

Real workflows are mixed-mode. An agent handles 80% of a vendor intake, but a compliance officer verifies documents. A lead qualification starts with the agent, but the prospect finishes a few fields manually. An access request is submitted by an agent, approved by a human manager, and logged for audit. FormBridge treats this as the default, not the edge case — with governance built in: encryption at rest, per-field retention controls, redaction policies, and least-privilege access scoping.

## Architecture

By default, FormBridge forwards finalized submissions to your existing endpoint or webhook — it fits into your current stack without forcing a platform migration. The hosted tier optionally stores and governs submissions, adding authentication, rate limiting, tenant isolation, PII controls, persistent storage, webhooks, and an admin dashboard.

## Distribution

FormBridge ships as an open-source SDK. Developers bring their schema, get an MCP server and an embeddable React form in minutes. Teams adopt the OSS SDK in development, then switch on hosted governance when they hit PII, audit, or SSO requirements.

## Audience

The initial audience is teams building agentic internal operations — IT requests, vendor onboarding, security access, customer intake — where structured data, approval workflows, and audit trails aren't optional. Why not use an existing form tool with an API? Because those APIs are built for humans and backends, not agent retry loops, resumable sessions, and approval governance.

The bet: as AI agents become the default way work gets done, every intake point will need a machine interface. FormBridge is that interface.

---

**One-liner:** FormBridge turns your Zod / JSON Schema / OpenAPI into agent-native intake: an embeddable web form for humans and an MCP tool for agents, backed by the same validation and destination. The difference is the Intake Contract — structured retryable errors, idempotent and resumable submissions, upload negotiation, and optional human approval — so agents can collect data reliably in production.
