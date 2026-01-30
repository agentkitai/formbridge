# Feature 002 — Schema Normalization Layer

> **Status:** IMPLEMENTED | **Phase:** 1 | **Priority:** must | **Complexity:** high | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as the `@formbridge/schema-normalizer` package. Provides a parser-based architecture where each input format (Zod, JSON Schema, OpenAPI) has a dedicated parser that converts to a unified IntakeSchema IR. A JSON Schema serializer enables round-trip conversion. The IR type system uses a discriminated union with type guards for safe field access.

**Key files:**
- `packages/schema-normalizer/src/types/intake-schema.ts` -- IntakeSchema IR type definitions (discriminated union, type guards)
- `packages/schema-normalizer/src/types/parser.ts` -- Parser interface and base types
- `packages/schema-normalizer/src/types/errors.ts` -- Error classes (UnsupportedFeatureError, SchemaValidationError)
- `packages/schema-normalizer/src/parsers/zod-parser.ts` -- Zod schema parser
- `packages/schema-normalizer/src/parsers/json-schema-parser.ts` -- JSON Schema parser (draft-07, draft-2020-12)
- `packages/schema-normalizer/src/parsers/openapi-parser.ts` -- OpenAPI 3.0/3.1 parser
- `packages/schema-normalizer/src/serializers/json-schema-serializer.ts` -- IR to JSON Schema serializer
- `packages/schema-normalizer/src/index.ts` -- Public API exports and factory functions
- `packages/schema-normalizer/tests/zod-parser.test.ts` -- Zod parser tests
- `packages/schema-normalizer/tests/json-schema-parser.test.ts` -- JSON Schema parser tests
- `packages/schema-normalizer/tests/openapi-parser.test.ts` -- OpenAPI parser tests
- `packages/schema-normalizer/tests/round-trip.test.ts` -- IR to JSON Schema round-trip tests
- `packages/schema-normalizer/tests/edge-cases.test.ts` -- Edge case tests
- `packages/schema-normalizer/tests/error-handling.test.ts` -- Error handling tests
- `packages/schema-normalizer/examples/basic-usage.ts` -- Usage examples

**Known issues:**
- The schema normalizer is assessed as "solid" in code review with no critical issues. The IR type system (`IntakeSchemaField` union with type guards) is clean. Separate parsers for each format follow a consistent interface.

## Summary

Feature 002 implements a schema normalization engine that accepts schemas from three popular formats -- Zod, JSON Schema (draft-07 and draft-2020-12), and OpenAPI 3.0/3.1 -- and converts them into a unified IntakeSchema IR (Intermediate Representation). This IR is the canonical internal format used throughout FormBridge for validation, form rendering, and MCP tool generation. Each format has a dedicated parser implementing a common `Parser` interface, and a JSON Schema serializer provides the reverse direction for round-trip fidelity. The IR preserves all metadata: descriptions, examples, constraints, enums with labels, nested objects, arrays, and required/optional status.

## Dependencies

**Upstream:** Feature 001 (project scaffolding)
**Downstream:** Features 003, 005, 006, 015, 017, 018, 020

## Architecture & Design

- **Package:** `@formbridge/schema-normalizer` -- standalone package in `packages/schema-normalizer/`
- **Parser pattern:** Each parser implements the `Parser` interface with a `parse()` method that returns an `IntakeSchema` IR document. Parsers are stateless and instantiated via factory functions (`createJSONSchemaParser()`, `createZodParser()`, `createOpenAPIParser()`).
- **IntakeSchema IR:** Root document with `version: '1.0'`, `title`, `description`, `schema` (root field), and `metadata` (source format tracking). The `schema` field is a discriminated union (`IntakeSchemaField`) with 9 variants: `string`, `number`, `integer`, `boolean`, `null`, `object`, `array`, `enum`, `file`.
- **Type guards:** `isStringField()`, `isNumberField()`, `isIntegerField()`, `isBooleanField()`, `isNullField()`, `isObjectField()`, `isArrayField()`, `isEnumField()`, `isFileField()` for safe narrowing.
- **Constraints:** Per-type constraint interfaces (`StringConstraints`, `NumberConstraints`, `ArrayConstraints`, `FileConstraints`) capture format-specific validation rules (minLength, pattern, minimum, uniqueItems, etc.).
- **Enum values:** `EnumValue` type with `value` and optional `label` preserves display labels from source schemas.
- **Serialization:** `JSONSchemaSerializer` converts IR back to standard JSON Schema. Factory function `createJSONSchemaSerializer()` available.
- **Error handling:** `UnsupportedFeatureError` for constructs not representable in IR. `SchemaValidationError` for invalid input. `ParserError` as base error class.

## Implementation Tasks

### Task 1: IntakeSchema IR Type System
- [x] Define `IntakeSchemaFieldType` discriminator (`string`, `number`, `integer`, `boolean`, `null`, `object`, `array`, `enum`, `file`)
- [x] Define `BaseField` with common metadata (`description`, `default`, `examples`, `required`, `nullable`)
- [x] Define per-type field interfaces (`StringField`, `NumberField`, `ObjectField`, `ArrayField`, `EnumField`, `FileField`, etc.)
- [x] Define constraint interfaces (`StringConstraints`, `NumberConstraints`, `ArrayConstraints`, `FileConstraints`)
- [x] Define `EnumValue` with `value` and optional `label`
- [x] Define `IntakeSchemaField` discriminated union of all field types
- [x] Define root `IntakeSchema` document type with version, title, description, schema, metadata
- [x] Implement type guard functions for each field type
**Validation:** Types compile; type guards narrow correctly in tests.

### Task 2: Parser Interface
- [x] Define `Parser` interface with `parse()` method signature
- [x] Define `ParserOptions` for configuration
- [x] Define `ParserError` base error class
- [x] Define `isParser()` type guard
**Validation:** Interface compiles; implemented by all three parsers.

### Task 3: Zod Parser
- [x] Implement `ZodParser` class implementing `Parser` interface
- [x] Handle Zod primitives (string, number, boolean, null)
- [x] Handle Zod objects with nested properties
- [x] Handle Zod arrays with typed items
- [x] Handle Zod enums and native enums
- [x] Extract constraints (min, max, length, regex, email, url, uuid formats)
- [x] Extract descriptions and defaults
- [x] Handle optional vs required fields
- [x] Create factory function `createZodParser()`
**Validation:** Zod parser tests pass for all supported Zod types.

### Task 4: JSON Schema Parser
- [x] Implement `JSONSchemaParser` class implementing `Parser` interface
- [x] Support JSON Schema draft-07 and draft-2020-12
- [x] Handle primitive types (string, number, integer, boolean, null)
- [x] Handle object schemas with properties and required arrays
- [x] Handle array schemas with items
- [x] Handle enum values
- [x] Handle format keywords (email, uri, date-time, etc.)
- [x] Handle constraint keywords (minLength, maxLength, minimum, maximum, pattern)
- [x] Handle `$ref` and `$defs` references
- [x] Handle composition keywords (`allOf`, `anyOf`, `oneOf`)
- [x] Create factory function `createJSONSchemaParser()`
**Validation:** JSON Schema parser tests pass for all schema drafts and features.

### Task 5: OpenAPI Parser
- [x] Implement `OpenAPIParser` class implementing `Parser` interface
- [x] Parse OpenAPI 3.0 and 3.1 documents
- [x] Extract request body schemas from operations
- [x] Handle `$ref` resolution within OpenAPI components
- [x] Support operation selection by operationId
- [x] Delegate to JSON Schema parser for schema content
- [x] Create factory function `createOpenAPIParser()`
**Validation:** OpenAPI parser tests pass for sample API documents.

### Task 6: JSON Schema Serializer
- [x] Implement `JSONSchemaSerializer` class
- [x] Convert IntakeSchema IR fields back to JSON Schema properties
- [x] Preserve constraints, formats, enums, descriptions
- [x] Handle nested objects and arrays recursively
- [x] Handle required field aggregation at object level
- [x] Create factory function `createJSONSchemaSerializer()`
- [x] Create convenience function `serializeToJSONSchema()`
**Validation:** Round-trip tests pass (JSON Schema -> IR -> JSON Schema is semantically equivalent).

### Task 7: Test Suite
- [x] Zod parser tests covering all Zod types and constraints
- [x] JSON Schema parser tests covering drafts and keywords
- [x] OpenAPI parser tests covering operation extraction and ref resolution
- [x] Round-trip tests (JSON Schema -> IR -> JSON Schema)
- [x] Edge case tests (empty schemas, deeply nested objects, arrays of arrays)
- [x] Error handling tests (invalid input, unsupported features)
**Validation:** All 6 test files pass; combined test count exceeds 50.

## Test Plan

| Type | Description | Count |
|------|------------|-------|
| Unit | Zod parser tests (`zod-parser.test.ts`) | ~15+ |
| Unit | JSON Schema parser tests (`json-schema-parser.test.ts`) | ~15+ |
| Unit | OpenAPI parser tests (`openapi-parser.test.ts`) | ~10+ |
| Unit | Round-trip serialization tests (`round-trip.test.ts`) | ~10+ |
| Unit | Edge case tests (`edge-cases.test.ts`) | ~5+ |
| Unit | Error handling tests (`error-handling.test.ts`) | ~5+ |

## Documentation Tasks
- [x] JSDoc on all public types and interfaces
- [x] JSDoc on all parser and serializer classes
- [x] Basic usage example in `examples/basic-usage.ts`
- [x] Public API exported from `src/index.ts` with section comments

## Code Review Checklist
- [x] Type safety verified (discriminated union with type guards, strict mode)
- [x] Patterns consistent (all parsers implement same `Parser` interface)
- [x] No regressions (standalone package, no impact on other code)
- [x] Performance acceptable (parsers are stateless, no unnecessary allocations)

## Deployment & Release
- **Backward compatibility:** N/A (new package)
- **Migration:** None required
- **Versioning:** 0.1.0 (initial release)
- **Peer dependencies:** Zod is an optional peer dependency (only needed if using `ZodParser`)

## Observability & Monitoring
- **Logging:** Parsers throw structured errors (`ParserError`, `UnsupportedFeatureError`, `SchemaValidationError`) with descriptive messages
- **Metrics:** None (library package, no runtime monitoring)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| IR cannot represent all JSON Schema constructs | Medium | Medium | `UnsupportedFeatureError` thrown for unsupported features; IR designed to cover 95%+ of real-world schemas |
| Zod internal API changes break parser | Low | High | Zod peer dependency pinned to ^3.22; parser tests catch breakage |
| OpenAPI `$ref` resolution incomplete | Medium | Low | Covers inline and component refs; deep external refs not supported (documented limitation) |
| Round-trip is lossy for advanced schemas | Medium | Low | Round-trip tests verify core constructs; advanced features may lose metadata |

## Definition of Done
- [x] All acceptance criteria met
- [x] Tests passing (50+ test cases across 6 test files)
- [x] Code reviewed (assessed as "solid")
- [x] Documentation updated (JSDoc, examples, index exports)
- [x] Zod schemas parsed into IntakeSchema IR
- [x] JSON Schema (draft-07 and draft-2020-12) parsed
- [x] OpenAPI 3.0/3.1 request body schemas parsed
- [x] Nested objects and arrays supported
- [x] Enum types with labels preserved
- [x] Required vs optional correct
- [x] Descriptions and examples preserved
- [x] Invalid constructs produce clear errors
- [x] Round-trip IR to JSON Schema works
