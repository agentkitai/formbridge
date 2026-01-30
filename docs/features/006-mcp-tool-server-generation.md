# Feature 006 — MCP Tool Server Generation

> **Status:** IMPLEMENTED | **Phase:** 2 | **Priority:** must | **Complexity:** high | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as part of the FormBridge build. The MCP tool server auto-generates Model Context Protocol tools from IntakeSchema definitions, enabling LLM agents to interact with FormBridge forms programmatically. Built using `@modelcontextprotocol/sdk` with stdio and SSE transports. Currently exists as a standalone package requiring monorepo integration.

**Key files:**
- `src/mcp/server.ts` — `FormBridgeMCPServer` main server class
- `src/mcp/tool-generator.ts` — schema-to-MCP-tool generation logic
- `src/mcp/submission-store.ts` — in-process submission state store
- `src/mcp/transports/stdio.ts` — stdio transport implementation
- `src/mcp/transports/sse.ts` — SSE (Server-Sent Events) transport implementation
- `src/schemas/intake-schema.ts` — IntakeSchema type definitions (local copy)
- `src/schemas/json-schema-converter.ts` — IntakeSchema to JSON Schema converter
- `src/validation/validator.ts` — field validation logic (local copy)
- `src/validation/error-mapper.ts` — error-to-MCP-response mapper
- `src/types/intake-contract.ts` — intake contract type definitions
- `src/types/mcp-types.ts` — MCP-specific type definitions
- `examples/vendor-onboarding/` — example vendor onboarding intake
- `tests/` — unit, integration, and transport tests
- `docs/` — MCP server documentation

**Known issues:**
- Code duplication: The MCP server package contains its own `SubmissionStore`, `validator.ts`, and `intake-schema.ts` that duplicate equivalent code in the main `src/` directory. This creates a maintenance burden and risk of divergence.
- Built as a standalone worktree package and needs integration into the monorepo structure to share common code.

## Summary

The MCP Tool Server Generation feature auto-generates Model Context Protocol (MCP) tool servers from IntakeSchema definitions. For each intake form, four MCP tools are generated: `create` (start a new submission), `set` (set field values), `validate` (check current submission validity), and `submit` (finalize and submit). The server supports both stdio transport (for local CLI agents) and SSE transport (for remote/web agents), enabling LLM agents to fill out and submit FormBridge forms through structured tool calls with full validation feedback.

## Dependencies

**Upstream:**
- Feature 002 (Schema Parsing) — IntakeSchema definitions that drive tool generation
- Feature 003 (Intake Contract Spec) — contract semantics for submission lifecycle

**Downstream:**
- Feature 007 (Structured Retryable Error Protocol) — error responses from MCP tools follow the error protocol
- Feature 015 (End-to-End Testing) — integration tests exercise MCP tool flows
- Feature 017 (Accessibility Compliance) — MCP tool descriptions serve as accessible interfaces for agents

## Architecture & Design

The MCP server follows a three-layer architecture:

1. **Tool Generation Layer** — `tool-generator.ts` reads IntakeSchema definitions and produces MCP tool definitions with JSON Schema input schemas, descriptions, and handler functions. Each intake generates four tools with names derived from the intake ID (e.g., `vendor_onboarding_create`, `vendor_onboarding_set`, `vendor_onboarding_validate`, `vendor_onboarding_submit`).

2. **Server Layer** — `FormBridgeMCPServer` registers generated tools with the MCP SDK, manages transport lifecycle, and routes incoming tool calls to the appropriate handler. The server class is transport-agnostic and accepts any MCP-compliant transport.

3. **State Layer** — `SubmissionStore` manages in-process submission state (field values, validation state, submission status). `validator.ts` checks field values against IntakeSchema constraints. `error-mapper.ts` converts validation errors into MCP-compliant error responses with structured retry hints.

Tool generation flow:
```
IntakeSchema --> tool-generator.ts --> MCP Tool Definitions
                                         |
                                         +--> create_tool (start submission)
                                         +--> set_tool (set field values)
                                         +--> validate_tool (check validity)
                                         +--> submit_tool (finalize)
```

Transport architecture:
- **stdio** — reads JSON-RPC from stdin, writes to stdout. Suitable for local agent processes (e.g., Claude Desktop).
- **SSE** — HTTP server with Server-Sent Events for server-to-client messages and POST endpoint for client-to-server messages. Suitable for remote/web agents.

## Implementation Tasks

### Task 1: FormBridgeMCPServer Class
- [x] Create server class with MCP SDK integration
- [x] Accept IntakeSchema definitions at construction
- [x] Register tools with the MCP SDK tool registry
- [x] Implement server start/stop lifecycle
- [x] Support multiple intakes (multiple tool sets)

**Validation:** Server starts, registers tools, and responds to MCP `tools/list` requests.

### Task 2: Tool Generator
- [x] Convert IntakeSchema fields to JSON Schema input definitions
- [x] Generate `create` tool — initializes a new submission, returns submission ID
- [x] Generate `set` tool — accepts field path and value, updates submission state
- [x] Generate `validate` tool — runs validation, returns errors or success
- [x] Generate `submit` tool — finalizes submission, returns result or errors
- [x] Include descriptive tool names and descriptions for LLM comprehension

**Validation:** Generated tools have correct JSON Schema inputs. Tool descriptions are clear and actionable for LLMs.

### Task 3: stdio Transport
- [x] Implement stdio transport reading JSON-RPC from stdin
- [x] Write JSON-RPC responses to stdout
- [x] Handle connection lifecycle (init, ready, shutdown)
- [x] Support MCP protocol handshake

**Validation:** MCP client (e.g., `mcp-cli`) connects over stdio and invokes tools successfully.

### Task 4: SSE Transport
- [x] Implement HTTP server for SSE transport
- [x] SSE endpoint for server-to-client messages
- [x] POST endpoint for client-to-server messages
- [x] Handle connection lifecycle and reconnection
- [x] Support concurrent client connections

**Validation:** Web-based MCP client connects over SSE and invokes tools. Connection survives brief disconnects.

### Task 5: Submission Store
- [x] Implement in-process submission state storage
- [x] Store field values, validation state, submission status per submission ID
- [x] Support create, read, update operations
- [x] Handle submission lifecycle (draft, validating, submitted)
- [x] TTL-based cleanup of stale submissions

**Validation:** Submissions persist across tool calls within a session. Stale submissions are cleaned up.

### Task 6: Error Mapper
- [x] Map validation errors to MCP error responses
- [x] Include field path, error code, message, and hint in error content
- [x] Format errors for LLM parseability (structured JSON in content block)
- [x] Support error categories: missing, invalid, conflict

**Validation:** Validation errors from `set` and `submit` tools include actionable field-level error details.

### Task 7: Validator Integration
- [x] Integrate field validation against IntakeSchema constraints
- [x] Validate required fields, type constraints, patterns, ranges
- [x] Support nested object and array field validation
- [x] Return structured FieldError objects

**Validation:** All IntakeSchema constraint types are validated correctly. Nested fields validate at correct paths.

### Task 8: Vendor Onboarding Example
- [x] Create example IntakeSchema for vendor onboarding use case
- [x] Include example MCP client interaction script
- [x] Document setup and usage instructions

**Validation:** Example runs end-to-end with stdio transport. README instructions are complete.

### Task 9: Tests
- [x] Unit tests for tool generator (schema-to-tool conversion)
- [x] Unit tests for submission store operations
- [x] Unit tests for error mapper
- [x] Integration tests for full tool call flows (create, set, validate, submit)
- [x] Transport tests for stdio and SSE

**Validation:** All tests pass. Coverage meets project threshold.

## Test Plan

| Type | Description | Count |
|------|-------------|-------|
| Unit | Tool generator, submission store, error mapper, validator | ~30 |
| Integration | Full MCP tool call flows (create/set/validate/submit) | ~15 |
| Transport | stdio and SSE connection, message exchange, lifecycle | ~10 |
| Protocol | MCP handshake, tools/list, tool invocation compliance | ~8 |
| Example | Vendor onboarding end-to-end scenario | ~3 |

## Documentation Tasks

- [x] MCP server setup and configuration guide
- [x] Tool generation API reference
- [x] Transport configuration (stdio, SSE) documentation
- [x] Vendor onboarding example walkthrough
- [x] Integration guide for LLM agent frameworks

## Code Review Checklist

- [x] Type safety verified — all MCP types and IntakeSchema types enforced
- [x] Patterns consistent — tool naming, error formatting, transport abstraction
- [x] No regressions — existing IntakeSchema processing unaffected
- [x] Performance acceptable — tool generation is synchronous and fast
- [ ] Code duplication with main src/ needs resolution via monorepo integration

## Deployment & Release

- Package distributable as standalone npm package or monorepo workspace
- stdio transport: run as subprocess from MCP-compatible client (e.g., Claude Desktop)
- SSE transport: deploy as HTTP server behind reverse proxy
- Configuration via environment variables (port, host, intake schema paths)
- No external database dependency (in-process state store)

## Observability & Monitoring

- Tool invocation logging (tool name, submission ID, duration)
- Validation error frequency tracking per field
- Transport connection/disconnection events
- Submission lifecycle events (created, validated, submitted, failed)
- SSE transport health endpoint for load balancer checks

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Code duplication causes divergence from main src/ | High | Medium | Prioritize monorepo integration to share common code |
| MCP SDK breaking changes | Low | High | Pin SDK version, monitor upstream releases |
| SSE transport scalability with many concurrent agents | Medium | Medium | Connection pooling, horizontal scaling behind LB |
| Tool descriptions insufficient for LLM comprehension | Medium | Medium | Iterative prompt testing with multiple LLM models |
| Submission store memory growth with long-running server | Medium | Medium | TTL cleanup, configurable max submissions |

## Definition of Done

- [x] All acceptance criteria met (10/10)
- [x] Tests passing
- [x] Code reviewed
- [x] Documentation updated
- [ ] Monorepo integration to eliminate code duplication tracked for resolution
