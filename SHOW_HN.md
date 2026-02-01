# Show HN Post

## Title
Show HN: FormBridge – Form infrastructure for AI agents with human handoff

## URL
https://github.com/amitpaz1/formbridge

## Text
I built FormBridge because I kept running into the same problem: AI agents can fill out most of a form, but some fields genuinely need a human — signatures, file uploads, subjective choices. Existing form tools are either fully automated or fully manual. Nothing handles the handoff gracefully.

FormBridge is form submission infrastructure where an agent creates a submission via API, fills the fields it knows, and gets back a secure URL. A human opens that link, sees what the agent already filled (with attribution badges showing who filled what), completes the rest, and submits. From there it flows through validation, optional approval gates, and webhook delivery.

Key technical decisions:

- Field-level attribution — every field tracks which actor (agent, human, or system) set it and when
- Rotating resume tokens — the handoff URL token rotates on every state change, so old links become invalid
- MCP server built in — auto-generates MCP tools from intake definitions, so AI agents can discover and interact with forms natively
- Schema normalization — accepts Zod schemas, JSON Schema, or OpenAPI specs as input and converts to a unified IR

The stack is TypeScript, Hono for the HTTP layer, React for the form renderer, with pluggable storage backends (memory for dev, SQLite for prod, S3 for file uploads). 1,339 tests at 85.9% coverage.

I'm a solo dev who built this over about a week. It started from the question "what existing infrastructure was built for humans that needs rebuilding for AI agents?" — forms were the obvious answer.

Happy to answer questions about the architecture or the agent-human handoff model.
