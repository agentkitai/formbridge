# @formbridge/schema-normalizer

> Schema normalization engine that converts Zod schemas, JSON Schema, and OpenAPI specs into a unified IntakeSchema IR

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

## Overview

`@formbridge/schema-normalizer` is a foundational library that enables FormBridge's "define once, use everywhere" approach by abstracting over three popular schema formats:

- **Zod schemas** - TypeScript-first validation library
- **JSON Schema** - Industry-standard JSON schema format (draft-07 and draft-2020-12)
- **OpenAPI 3.0/3.1** - API specification request body schemas

All three formats are normalized into a unified **IntakeSchema IR** (Internal Representation) that preserves field definitions, types, constraints, descriptions, required/optional status, nested objects, arrays, and enums. This enables downstream features (validation, form rendering, MCP tool generation) to work from a single canonical schema format.

## Features

✅ **Universal Schema Support**
- Parse Zod schemas with full constraint extraction
- Parse JSON Schema (draft-07 and draft-2020-12)
- Extract request body schemas from OpenAPI 3.0/3.1 documents

✅ **Complete Type Coverage**
- Primitives: string, number, integer, boolean, null
- Complex types: objects, arrays, enums
- Full constraint support: minLength, maxLength, minimum, maximum, pattern, format, etc.
- Nested objects and arrays with unlimited depth

✅ **Metadata Preservation**
- Field descriptions and examples
- Default values
- Required vs optional fields
- OpenAPI-specific metadata (operationId, tags, summary)

✅ **Round-trip Conversion**
- Serialize IntakeSchema IR back to JSON Schema
- Zero information loss during conversion
- 398+ test cases ensuring correctness

✅ **Developer Experience**
- Comprehensive TypeScript types
- Clear error messages for unsupported constructs
- Extensive documentation and examples

## Installation

```bash
npm install @formbridge/schema-normalizer
```

### Optional Peer Dependencies

If you want to parse Zod schemas, install Zod:

```bash
npm install zod
```

Zod is an optional peer dependency - you can use JSON Schema and OpenAPI parsers without it.

## Quick Start

### JSON Schema

```typescript
import { JSONSchemaParser } from '@formbridge/schema-normalizer';

const parser = new JSONSchemaParser();

const jsonSchema = {
  type: 'object',
  properties: {
    username: { type: 'string', minLength: 3, maxLength: 20 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 18 }
  },
  required: ['username', 'email']
};

const intakeSchema = parser.parse(jsonSchema);
console.log(intakeSchema);
```

### Zod Schema

```typescript
import { ZodParser } from '@formbridge/schema-normalizer';
import { z } from 'zod';

const parser = new ZodParser();

const zodSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  age: z.number().int().min(18)
});

const intakeSchema = parser.parse(zodSchema);
console.log(intakeSchema);
```

### OpenAPI Document

```typescript
import { OpenAPIParser } from '@formbridge/schema-normalizer';

const parser = new OpenAPIParser();

const openApiDoc = {
  openapi: '3.0.0',
  info: { title: 'User API', version: '1.0.0' },
  paths: {
    '/users': {
      post: {
        operationId: 'createUser',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string', minLength: 3 },
                  email: { type: 'string', format: 'email' }
                },
                required: ['username', 'email']
              }
            }
          }
        }
      }
    }
  }
};

// Parse by operationId
const intakeSchema = parser.parse(openApiDoc, {
  operationId: 'createUser'
});

// OR parse by path and method
const intakeSchema2 = parser.parse(openApiDoc, {
  path: '/users',
  method: 'post'
});
```

## Usage Examples

### Full Example with All Field Types

```typescript
import { JSONSchemaParser } from '@formbridge/schema-normalizer';

const parser = new JSONSchemaParser();

const schema = {
  type: 'object',
  title: 'User Registration',
  description: 'Complete user registration form',
  properties: {
    // String with constraints
    username: {
      type: 'string',
      description: 'Unique username',
      minLength: 3,
      maxLength: 20,
      pattern: '^[a-zA-Z0-9_]+$'
    },

    // String with format
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address'
    },

    // Integer with range
    age: {
      type: 'integer',
      minimum: 18,
      maximum: 120,
      description: 'User age'
    },

    // Number with precision
    salary: {
      type: 'number',
      minimum: 0,
      exclusiveMinimum: true,
      multipleOf: 0.01,
      description: 'Annual salary in USD'
    },

    // Boolean
    agreeToTerms: {
      type: 'boolean',
      description: 'Agree to terms and conditions',
      default: false
    },

    // Enum
    role: {
      enum: ['admin', 'user', 'guest'],
      description: 'User role'
    },

    // Array
    tags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
      description: 'User tags'
    },

    // Nested object
    address: {
      type: 'object',
      properties: {
        street: { type: 'string' },
        city: { type: 'string' },
        zipCode: { type: 'string', pattern: '^\\d{5}$' }
      },
      required: ['city']
    }
  },
  required: ['username', 'email', 'age', 'agreeToTerms']
};

const ir = parser.parse(schema);

// Access the normalized schema
console.log(`Schema title: ${ir.title}`);
console.log(`Root type: ${ir.schema.type}`);

if (ir.schema.type === 'object') {
  for (const [name, field] of Object.entries(ir.schema.properties)) {
    console.log(`${name}: ${field.type} (${field.required ? 'required' : 'optional'})`);
  }
}
```

### Working with Nested Zod Schemas

```typescript
import { ZodParser } from '@formbridge/schema-normalizer';
import { z } from 'zod';

const parser = new ZodParser();

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  zipCode: z.string().regex(/^\d{5}$/),
  country: z.string().default('USA')
});

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  addresses: z.array(addressSchema).min(1),
  primaryAddress: addressSchema,
  newsletter: z.boolean().default(true).optional()
});

const ir = parser.parse(userSchema);
console.log(JSON.stringify(ir, null, 2));
```

### Round-trip Conversion

```typescript
import {
  JSONSchemaParser,
  JSONSchemaSerializer
} from '@formbridge/schema-normalizer';

const parser = new JSONSchemaParser();
const serializer = new JSONSchemaSerializer();

// Original JSON Schema
const original = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'integer', minimum: 0 }
  },
  required: ['name']
};

// Parse to IR
const ir = parser.parse(original);

// Serialize back to JSON Schema
const output = serializer.serialize(ir);

console.log('Round-trip successful!');
console.log(JSON.stringify(output, null, 2));

// You can also use the convenience function
import { serializeToJSONSchema } from '@formbridge/schema-normalizer';

const jsonSchema = serializeToJSONSchema(ir, {
  schemaVersion: 'draft-2020-12',
  includeSchemaVersion: true
});
```

### Error Handling

```typescript
import {
  JSONSchemaParser,
  UnsupportedFeatureError,
  SchemaValidationError,
  ParserError
} from '@formbridge/schema-normalizer';

const parser = new JSONSchemaParser();

try {
  // This will throw - $ref is not supported
  parser.parse({
    $ref: '#/definitions/User'
  });
} catch (error) {
  if (error instanceof UnsupportedFeatureError) {
    console.log('Unsupported feature:', error.message);
    console.log('Feature:', error.feature);
    console.log('Suggestion:', error.suggestion);
  }
}

try {
  // This will throw - anyOf is not supported
  parser.parse({
    anyOf: [
      { type: 'string' },
      { type: 'number' }
    ]
  });
} catch (error) {
  if (error instanceof UnsupportedFeatureError) {
    console.log('Cannot parse union types (anyOf)');
  }
}

try {
  // This will throw - invalid schema
  parser.parse({
    type: 'invalid-type'
  });
} catch (error) {
  if (error instanceof SchemaValidationError) {
    console.log('Invalid schema:', error.message);
  }
}
```

### Parser Options

```typescript
import { JSONSchemaParser } from '@formbridge/schema-normalizer';

// Strict mode (default: true) - fail on unsupported features
const strictParser = new JSONSchemaParser({ strict: true });

// Disable metadata inclusion
const noMetadataParser = new JSONSchemaParser({
  includeMetadata: false
});

// Add custom metadata
const customParser = new JSONSchemaParser({
  customMetadata: {
    source: 'user-registration-v2',
    version: '2.0.0',
    createdAt: new Date().toISOString()
  }
});

const ir = customParser.parse(schema);
console.log(ir.metadata); // Contains your custom metadata
```

## API Reference

### Parsers

#### `JSONSchemaParser`

Parses JSON Schema (draft-07 and draft-2020-12) into IntakeSchema IR.

```typescript
class JSONSchemaParser implements Parser<JSONSchema> {
  constructor(options?: ParserOptions)
  parse(schema: JSONSchema, options?: ParserOptions): IntakeSchema
  canParse(schema: JSONSchema): boolean
}
```

**Supported JSON Schema features:**
- All primitive types: `string`, `number`, `integer`, `boolean`, `null`
- Complex types: `object`, `array`
- Enum values
- All standard constraints
- Nested structures

**Not supported:**
- `$ref` references
- `allOf`, `anyOf`, `oneOf`, `not` combinators
- Tuple validation (`items` as array)

#### `ZodParser`

Parses Zod schemas into IntakeSchema IR.

```typescript
class ZodParser implements Parser<ZodTypeAny> {
  constructor(options?: ParserOptions)
  parse(schema: ZodTypeAny, options?: ParserOptions): IntakeSchema
  canParse(schema: unknown): boolean
}
```

**Supported Zod types:**
- `z.string()`, `z.number()`, `z.boolean()`, `z.null()`
- `z.object()`, `z.array()`, `z.enum()`, `z.nativeEnum()`
- `.optional()`, `.nullable()`, `.default()`
- `.describe()` for descriptions
- All constraint methods: `.min()`, `.max()`, `.email()`, `.regex()`, etc.

**Not supported:**
- `z.union()`, `z.intersection()`, `z.discriminatedUnion()`
- `z.tuple()`, `z.record()`, `z.map()`, `z.set()`
- `z.lazy()`, `z.promise()`, `z.function()`
- `z.any()`, `z.unknown()`, `z.void()`, `z.undefined()`, `z.never()`

#### `OpenAPIParser`

Extracts and parses request body schemas from OpenAPI 3.0/3.1 documents.

```typescript
class OpenAPIParser implements Parser<OpenAPIDocument> {
  constructor(options?: ParserOptions)
  parse(doc: OpenAPIDocument, options?: OpenAPIParserOptions): IntakeSchema
  canParse(doc: OpenAPIDocument): boolean
}

interface OpenAPIParserOptions extends ParserOptions {
  operationId?: string;      // Find operation by ID
  path?: string;             // Find operation by path
  method?: string;           // HTTP method (with path)
  mediaType?: string;        // Default: 'application/json'
}
```

**Schema extraction modes:**
1. **By operationId**: `parser.parse(doc, { operationId: 'createUser' })`
2. **By path + method**: `parser.parse(doc, { path: '/users', method: 'post' })`
3. **Auto-discovery**: Automatically finds first POST/PUT/PATCH with request body

**OpenAPI metadata preserved:**
- `operationId`, `summary`, `description`
- `tags`, `path`, `method`

### Serializers

#### `JSONSchemaSerializer`

Serializes IntakeSchema IR back to JSON Schema.

```typescript
class JSONSchemaSerializer {
  constructor(options?: SerializerOptions)
  serialize(schema: IntakeSchema): JSONSchema
}

interface SerializerOptions {
  schemaVersion?: 'draft-07' | 'draft-2020-12';  // Default: 'draft-2020-12'
  includeSchemaVersion?: boolean;                 // Add $schema property
}
```

**Convenience function:**

```typescript
function serializeToJSONSchema(
  schema: IntakeSchema,
  options?: SerializerOptions
): JSONSchema
```

### Type Exports

```typescript
// IntakeSchema IR types
export type {
  IntakeSchema,
  IntakeSchemaField,
  IntakeSchemaFieldType,
  StringField,
  NumberField,
  IntegerField,
  BooleanField,
  NullField,
  ObjectField,
  ArrayField,
  EnumField,
  StringConstraints,
  NumberConstraints,
  ArrayConstraints,
  EnumValue,
  StringFormat
}

// Type guards
export {
  isStringField,
  isNumberField,
  isIntegerField,
  isBooleanField,
  isNullField,
  isObjectField,
  isArrayField,
  isEnumField
}

// Parser types
export type { Parser, ParserOptions }
export { ParserError, isParser }

// Error types
export {
  UnsupportedFeatureError,
  SchemaValidationError,
  createUnsupportedFeatureError
}
```

### Factory Functions

Convenience functions to create parser/serializer instances:

```typescript
export function createJSONSchemaParser(options?: ParserOptions): JSONSchemaParser
export function createZodParser(options?: ParserOptions): ZodParser
export function createOpenAPIParser(options?: ParserOptions): OpenAPIParser
export function createJSONSchemaSerializer(options?: SerializerOptions): JSONSchemaSerializer
```

## IntakeSchema IR Format

The IntakeSchema IR is the normalized internal representation that all parsers produce.

### Structure

```typescript
interface IntakeSchema {
  version: string;              // IR version (e.g., '1.0.0')
  schema: IntakeSchemaField;    // Root field (usually ObjectField)
  title?: string;               // Schema title
  description?: string;         // Schema description
  metadata?: Record<string, unknown>;  // Additional metadata
}
```

### Field Types

All fields share a common base structure:

```typescript
interface BaseField {
  type: IntakeSchemaFieldType;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  required: boolean;            // Is this field required?
  nullable?: boolean;           // Can this field be null?
}
```

#### String Field

```typescript
interface StringField extends BaseField {
  type: 'string';
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;           // Regular expression
    format?: StringFormat;      // email, url, uuid, date, etc.
  };
  default?: string;
  examples?: string[];
}
```

**Supported formats:**
- `email`, `uri`, `url`, `uuid`
- `date`, `date-time`, `time`
- `ipv4`, `ipv6`, `hostname`
- `regex`

#### Number/Integer Field

```typescript
interface NumberField extends BaseField {
  type: 'number';
  constraints?: {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
  };
  default?: number;
  examples?: number[];
}

interface IntegerField extends BaseField {
  type: 'integer';
  constraints?: NumberConstraints;
  default?: number;
  examples?: number[];
}
```

#### Boolean Field

```typescript
interface BooleanField extends BaseField {
  type: 'boolean';
  default?: boolean;
  examples?: boolean[];
}
```

#### Null Field

```typescript
interface NullField extends BaseField {
  type: 'null';
  default?: null;
}
```

#### Object Field

```typescript
interface ObjectField extends BaseField {
  type: 'object';
  properties: Record<string, IntakeSchemaField>;  // Recursive
  additionalProperties?: boolean;
  examples?: Record<string, unknown>[];
}
```

#### Array Field

```typescript
interface ArrayField extends BaseField {
  type: 'array';
  items: IntakeSchemaField;     // Array element schema (recursive)
  constraints?: {
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
  };
  examples?: unknown[][];
}
```

#### Enum Field

```typescript
interface EnumField extends BaseField {
  type: 'enum';
  values: EnumValue[];          // List of allowed values
  examples?: Array<string | number>;
}

interface EnumValue {
  value: string | number;       // The actual enum value
  label?: string;               // Optional display label
}
```

### Type Guards

Use type guards to work with IntakeSchema fields:

```typescript
import {
  isStringField,
  isObjectField,
  isArrayField
} from '@formbridge/schema-normalizer';

const field = ir.schema;

if (isObjectField(field)) {
  // TypeScript knows field is ObjectField
  for (const [name, prop] of Object.entries(field.properties)) {
    if (isStringField(prop) && prop.constraints?.format === 'email') {
      console.log(`${name} is an email field`);
    }
  }
}

if (isArrayField(field)) {
  // TypeScript knows field is ArrayField
  console.log(`Array of ${field.items.type}`);
}
```

## Configuration Options

### ParserOptions

```typescript
interface ParserOptions {
  // Strict mode - fail on unsupported features (default: true)
  strict?: boolean;

  // Include source metadata in parsed IntakeSchema (default: true)
  includeMetadata?: boolean;

  // Custom metadata to merge into IntakeSchema
  customMetadata?: Record<string, unknown>;
}
```

**Example:**

```typescript
const parser = new JSONSchemaParser({
  strict: true,
  includeMetadata: true,
  customMetadata: {
    source: 'user-api-v2',
    version: '2.0.0',
    author: 'API Team'
  }
});
```

### SerializerOptions

```typescript
interface SerializerOptions {
  // Target JSON Schema version (default: 'draft-2020-12')
  schemaVersion?: 'draft-07' | 'draft-2020-12';

  // Include $schema property in output (default: false)
  includeSchemaVersion?: boolean;
}
```

**Example:**

```typescript
const serializer = new JSONSchemaSerializer({
  schemaVersion: 'draft-07',
  includeSchemaVersion: true
});

const jsonSchema = serializer.serialize(ir);
// Output includes: { "$schema": "http://json-schema.org/draft-07/schema#", ... }
```

## Limitations

### Unsupported JSON Schema Features

The following JSON Schema features are **not supported** and will throw `UnsupportedFeatureError`:

- **`$ref`** - Schema references and definitions
  - *Why:* Would require schema resolution and can lead to circular references
  - *Alternative:* Inline your schemas or use Zod with recursive types

- **`allOf`** - Schema composition (intersection)
  - *Why:* Complex merging logic, ambiguous constraint resolution
  - *Alternative:* Flatten your schema manually

- **`anyOf`** - Union types
  - *Why:* IntakeSchema IR requires single, concrete types for form generation
  - *Alternative:* Use separate schemas or enum for limited choices

- **`oneOf`** - Exclusive union
  - *Why:* Same as `anyOf`

- **`not`** - Negation
  - *Why:* Cannot be represented in positive constraint form

- **Tuple validation** - `items` as array
  - *Why:* IntakeSchema arrays have homogeneous items
  - *Alternative:* Use object with numbered properties

### Unsupported Zod Types

The following Zod types are **not supported**:

- **`z.union()`**, `z.intersection()`, `z.discriminatedUnion()`**
  - *Reason:* Same as JSON Schema union types

- **`z.tuple()`**
  - *Reason:* Homogeneous arrays only

- **`z.record()`, `z.map()`, `z.set()`**
  - *Reason:* Dynamic key structures not supported

- **`z.lazy()`, `z.promise()`, `z.function()`**
  - *Reason:* Not applicable to static schema representation

- **`z.any()`, `z.unknown()`, `z.void()`, `z.undefined()`, `z.never()`**
  - *Reason:* Too permissive or not applicable to intake forms

### General Limitations

1. **No circular references** - Deeply nested schemas are supported, but circular references are not
2. **No conditional schemas** - `if/then/else` in JSON Schema not supported
3. **No pattern properties** - Object properties must be explicitly defined
4. **Single type per field** - Union types are not supported

## Testing

The schema-normalizer package has 398+ comprehensive test cases covering all parsers, serializers, and edge cases.

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- json-schema-parser.test.ts

# Run with coverage
npm test:coverage

# Watch mode
npm test:watch
```

### Test Coverage

- **JSON Schema Parser**: 83 tests
- **Zod Parser**: 80 tests
- **OpenAPI Parser**: 60 tests
- **Round-trip Tests**: 44 tests
- **Edge Cases**: 68 tests
- **Error Handling**: 63 tests

**Total: 398 tests**

### Build and Type Check

```bash
# Build TypeScript
npm run build

# Type check without emitting
npm run typecheck

# Clean build artifacts
npm run clean
```

## Examples

See the [`examples/basic-usage.ts`](./examples/basic-usage.ts) file for comprehensive usage examples including:

1. Parsing JSON Schema
2. Parsing Zod schemas
3. Parsing OpenAPI documents
4. Round-trip serialization
5. Working with IntakeSchema IR
6. Error handling
7. Parser configuration options

Run the examples:

```bash
npx tsx examples/basic-usage.ts
```

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass: `npm test`
2. Code follows TypeScript best practices
3. New features include comprehensive tests
4. Documentation is updated

## License

MIT © FormBridge Team

## Related Packages

This package is part of the FormBridge ecosystem:

- `@formbridge/validator` - Runtime validation using IntakeSchema IR
- `@formbridge/form-renderer` - Dynamic form generation from IntakeSchema IR
- `@formbridge/mcp-tools` - MCP tool generation from IntakeSchema IR

## Support

- **Issues**: [GitHub Issues](https://github.com/formbridge/formbridge/issues)
- **Documentation**: [Full Documentation](https://formbridge.dev/docs)
- **Examples**: See [`examples/`](./examples/) directory

---

**Built with ❤️ by the FormBridge Team**
