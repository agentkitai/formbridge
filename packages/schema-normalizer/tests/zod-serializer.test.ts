import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ZodParser } from '../src/parsers/zod-parser';
import { JSONSchemaParser } from '../src/parsers/json-schema-parser';
import { ZodSerializer, serializeToZod } from '../src/serializers/zod-serializer';
import type { IntakeSchema } from '../src/types/intake-schema';

const zodParser = new ZodParser();
const jsonParser = new JSONSchemaParser();
const serializer = new ZodSerializer();

describe('ZodSerializer — Zod → IR → Zod behavioral round-trip', () => {
  // Two ZodTypes are never ===, so assert behavioral equivalence: the rebuilt
  // schema must accept/reject the same fixtures as the original.
  const cases: Array<{
    name: string;
    schema: z.ZodTypeAny;
    valid: unknown[];
    invalid: unknown[];
  }> = [
    {
      name: 'string min/max',
      schema: z.object({ a: z.string().min(2).max(4) }),
      valid: [{ a: 'abc' }],
      invalid: [{ a: 'a' }, { a: 'abcde' }],
    },
    {
      name: 'string email format',
      schema: z.object({ a: z.string().email() }),
      valid: [{ a: 'x@y.com' }],
      invalid: [{ a: 'nope' }],
    },
    {
      name: 'string regex pattern',
      schema: z.object({ a: z.string().regex(/^[a-z]+$/) }),
      valid: [{ a: 'abc' }],
      invalid: [{ a: 'ABC' }],
    },
    {
      name: 'number min/max',
      schema: z.object({ a: z.number().min(0).max(10) }),
      valid: [{ a: 5 }],
      invalid: [{ a: -1 }, { a: 11 }],
    },
    {
      name: 'integer + multipleOf',
      schema: z.object({ a: z.number().int().multipleOf(2) }),
      valid: [{ a: 4 }],
      invalid: [{ a: 3 }, { a: 2.5 }],
    },
    {
      name: 'boolean',
      schema: z.object({ a: z.boolean() }),
      valid: [{ a: true }],
      invalid: [{ a: 'x' }],
    },
    {
      name: 'string enum',
      schema: z.object({ a: z.enum(['x', 'y']) }),
      valid: [{ a: 'x' }],
      invalid: [{ a: 'z' }],
    },
    {
      name: 'array min/max',
      schema: z.object({ a: z.array(z.string()).min(1).max(2) }),
      valid: [{ a: ['x'] }],
      invalid: [{ a: [] }, { a: ['x', 'y', 'z'] }],
    },
    {
      name: 'optional field',
      schema: z.object({ a: z.string().optional() }),
      valid: [{}, { a: 'x' }],
      invalid: [{ a: 1 }],
    },
    {
      name: 'nullable field',
      schema: z.object({ a: z.string().nullable() }),
      valid: [{ a: null }, { a: 'x' }],
      invalid: [{ a: 1 }],
    },
    {
      name: 'nested object',
      schema: z.object({ a: z.object({ b: z.number() }) }),
      valid: [{ a: { b: 1 } }],
      invalid: [{ a: { b: 'x' } }, {}],
    },
  ];

  for (const c of cases) {
    it(`round-trips ${c.name}`, () => {
      const ir = zodParser.parse(c.schema);
      const rebuilt = serializer.serialize(ir);
      for (const v of c.valid) {
        expect(rebuilt.safeParse(v).success).toBe(true);
      }
      for (const v of c.invalid) {
        expect(rebuilt.safeParse(v).success).toBe(false);
      }
    });
  }

  it('preserves a default value and treats the defaulted field as optional', () => {
    const ir = zodParser.parse(z.object({ a: z.string().default('d') }));
    const rebuilt = serializer.serialize(ir) as z.ZodObject<z.ZodRawShape>;
    const parsed = rebuilt.parse({}) as { a?: string };
    expect(parsed.a).toBe('d');
  });
});

describe('ZodSerializer — JSON Schema → IR → Zod validation', () => {
  it('validates a flat object schema like a UCP field set', () => {
    const jsonSchema = {
      type: 'object' as const,
      properties: {
        sku: { type: 'string' as const, minLength: 1 },
        qty: { type: 'integer' as const, minimum: 1 },
        currency: { type: 'string' as const, enum: ['USD', 'EUR'] },
        note: { type: 'string' as const },
      },
      required: ['sku', 'qty', 'currency'],
    };
    const rebuilt = serializeToZod(jsonParser.parse(jsonSchema));

    expect(rebuilt.safeParse({ sku: 'A1', qty: 2, currency: 'USD' }).success).toBe(true);
    expect(rebuilt.safeParse({ qty: 2, currency: 'USD' }).success).toBe(false); // missing required
    expect(rebuilt.safeParse({ sku: 'A1', qty: 'two', currency: 'USD' }).success).toBe(false); // wrong type
    expect(rebuilt.safeParse({ sku: 'A1', qty: 2, currency: 'GBP' }).success).toBe(false); // enum
    expect(rebuilt.safeParse({ sku: '', qty: 2, currency: 'USD' }).success).toBe(false); // too short
  });

  it('reports the failing field path', () => {
    const rebuilt = serializeToZod(
      jsonParser.parse({
        type: 'object',
        properties: { qty: { type: 'integer', minimum: 1 } },
        required: ['qty'],
      })
    );
    const res = rebuilt.safeParse({ qty: 0 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.path).toEqual(['qty']);
    }
  });
});

describe('ZodSerializer — structural guarantees', () => {
  it('returns a ZodObject for an object-root IR so .partial() works', () => {
    const rebuilt = serializeToZod(
      jsonParser.parse({
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a'],
      })
    );
    // Capability check (not `instanceof`): the serializer builds via require('zod')
    // while this test imports via ESM, so they're distinct class instances under
    // vitest — `instanceof` would be a false negative. `.partial()` is what the
    // MCP partial-submission path actually needs.
    const asObject = rebuilt as z.ZodObject<z.ZodRawShape>;
    expect(typeof asObject.partial).toBe('function');
    expect(asObject.safeParse({}).success).toBe(false); // required 'a' missing
    expect(asObject.partial().safeParse({}).success).toBe(true); // now optional
  });

  it('serializes a file field to a permissive placeholder without throwing', () => {
    const ir: IntakeSchema = {
      version: '1.0',
      schema: {
        type: 'object',
        required: true,
        properties: { doc: { type: 'file', required: false } },
      },
    };
    expect(() => serializeToZod(ir)).not.toThrow();
    expect(serializeToZod(ir).safeParse({ doc: 'anything' }).success).toBe(true);
  });

  it('maps a numeric enum to a literal union', () => {
    const ir: IntakeSchema = {
      version: '1.0',
      schema: { type: 'enum', required: true, values: [{ value: 1 }, { value: 2 }] },
    };
    const rebuilt = serializeToZod(ir);
    expect(rebuilt.safeParse(1).success).toBe(true);
    expect(rebuilt.safeParse(3).success).toBe(false);
  });

  it('drops JSON-unrepresentable enum labels without error', () => {
    const ir: IntakeSchema = {
      version: '1.0',
      schema: {
        type: 'enum',
        required: true,
        values: [
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ],
      },
    };
    const rebuilt = serializeToZod(ir);
    expect(rebuilt.safeParse('a').success).toBe(true);
    expect(rebuilt.safeParse('c').success).toBe(false);
  });
});
