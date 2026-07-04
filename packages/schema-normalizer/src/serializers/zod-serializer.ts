/**
 * Zod Serializer
 *
 * Converts IntakeSchema IR into a live Zod schema — the symmetric counterpart of
 * JSONSchemaSerializer, completing the parser/serializer matrix. With it, an intake
 * built from any source (Zod, JSON Schema, OpenAPI) can be turned back into a
 * runtime Zod validator.
 *
 * Zod is an optional peer dependency; serialize() throws a SerializerError if it
 * is not installed.
 *
 * Wrapper ordering note: ZodParser.unwrapSchema peels ZodDefault → ZodOptional →
 * ZodNullable (outer to inner). To keep a Zod → IR → Zod round-trip faithful, the
 * wrappers here are applied so the resulting nesting matches: describe on the base,
 * then nullable, then optional, then default (default outermost).
 */

import type {
  IntakeSchema,
  IntakeSchemaField,
  BaseField,
  StringField,
  NumberField,
  IntegerField,
  ObjectField,
  ArrayField,
  EnumField,
  StringFormat,
} from '../types/intake-schema';
import type { ZodTypeAny, ZodString } from 'zod';
import { SerializerError } from './json-schema-serializer';

/**
 * Zod is an optional peer dependency - load it lazily, mirroring ZodParser.
 */
let z: typeof import('zod');
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  z = require('zod');
} catch {
  // Zod is not installed - serialize() will throw a SerializerError on use.
}

/**
 * ZodSerializer configuration options
 */
export interface ZodSerializerOptions {
  /**
   * How z.object() treats unknown keys when a field's `additionalProperties` is
   * undefined. `additionalProperties: true/false` always override this.
   * @default 'strip'
   */
  objectMode?: 'strict' | 'strip' | 'passthrough';

  /**
   * Enforce array `uniqueItems` via a `.refine()` check (Zod has no native keyword).
   * @default true
   */
  enforceUniqueItems?: boolean;

  /**
   * Zod type used for `file` fields (Zod has no native file value type). File
   * upload constraints are enforced by the upload validator, not the submission schema.
   * @default 'string'
   */
  fileType?: 'string' | 'any';
}

/**
 * Serializes IntakeSchema IR into a live Zod schema.
 *
 * Lossless for everything the runtime validator checks: types, constraints,
 * required/optional, nullable, defaults, enums, and nested objects/arrays.
 * Deliberately drops form-only / cosmetic IR that Zod cannot represent
 * (conditions, steps, enum labels, examples); `file` fields become a permissive
 * placeholder.
 */
export class ZodSerializer {
  private options: Required<ZodSerializerOptions>;

  constructor(options: ZodSerializerOptions = {}) {
    this.options = {
      objectMode: options.objectMode ?? 'strip',
      enforceUniqueItems: options.enforceUniqueItems ?? true,
      fileType: options.fileType ?? 'string',
    };
  }

  /**
   * Serialize an IntakeSchema IR into a Zod schema. The root object is returned as
   * a ZodObject so callers can use `.partial()` for partial-submission validation.
   */
  serialize(input: IntakeSchema): ZodTypeAny {
    if (!z) {
      throw new SerializerError('Zod is not installed. Install "zod" to use the ZodSerializer.');
    }
    if (!input || typeof input !== 'object') {
      throw new SerializerError('Invalid IntakeSchema: expected an object', input);
    }
    if (!input.schema) {
      throw new SerializerError('Invalid IntakeSchema: missing schema field', undefined, { input });
    }
    return this.serializeField(input.schema);
  }

  private serializeField(field: IntakeSchemaField): ZodTypeAny {
    return this.applyWrappers(this.buildBase(field), field);
  }

  private buildBase(field: IntakeSchemaField): ZodTypeAny {
    switch (field.type) {
      case 'string':
        return this.buildString(field);
      case 'number':
        return this.buildNumber(field, false);
      case 'integer':
        return this.buildNumber(field, true);
      case 'boolean':
        return z.boolean();
      case 'null':
        return z.null();
      case 'object':
        return this.buildObject(field);
      case 'array':
        return this.buildArray(field);
      case 'enum':
        return this.buildEnum(field);
      case 'file':
        return this.options.fileType === 'any' ? z.any() : z.string();
      default:
        throw new SerializerError(
          `Unknown IntakeSchema field type: ${(field as IntakeSchemaField).type}`,
          undefined,
          { field }
        );
    }
  }

  private buildString(field: StringField): ZodTypeAny {
    let s = z.string();
    const c = field.constraints;
    if (c) {
      if (c.format) {
        s = this.applyStringFormat(s, c.format);
      }
      if (c.minLength !== undefined) {
        s = s.min(c.minLength);
      }
      if (c.maxLength !== undefined) {
        s = s.max(c.maxLength);
      }
      if (c.pattern !== undefined) {
        s = s.regex(new RegExp(c.pattern));
      }
    }
    return s;
  }

  private applyStringFormat(s: ZodString, format: StringFormat): ZodString {
    switch (format) {
      case 'email':
        return s.email();
      case 'url':
      case 'uri':
        return s.url();
      case 'uuid':
        return s.uuid();
      case 'date-time':
        return s.datetime();
      case 'date':
        return s.date();
      case 'time':
        return s.time();
      case 'ipv4':
        return s.ip({ version: 'v4' });
      case 'ipv6':
        return s.ip({ version: 'v6' });
      case 'hostname':
      case 'regex':
        // No native Zod string check — leave unconstrained.
        return s;
      default:
        return s;
    }
  }

  private buildNumber(field: NumberField | IntegerField, integer: boolean): ZodTypeAny {
    let n = z.number();
    if (integer) {
      n = n.int();
    }
    const c = field.constraints;
    if (c) {
      if (c.minimum !== undefined) {
        n = n.min(c.minimum);
      }
      if (c.maximum !== undefined) {
        n = n.max(c.maximum);
      }
      if (c.exclusiveMinimum !== undefined) {
        n = n.gt(c.exclusiveMinimum);
      }
      if (c.exclusiveMaximum !== undefined) {
        n = n.lt(c.exclusiveMaximum);
      }
      if (c.multipleOf !== undefined) {
        n = n.multipleOf(c.multipleOf);
      }
    }
    return n;
  }

  private buildObject(field: ObjectField): ZodTypeAny {
    const shape: Record<string, ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(field.properties)) {
      shape[key] = this.serializeField(prop);
    }
    const obj = z.object(shape);
    if (field.additionalProperties === true) {
      return obj.passthrough();
    }
    if (field.additionalProperties === false) {
      return obj.strict();
    }
    // additionalProperties undefined → fall back to the configured objectMode.
    if (this.options.objectMode === 'passthrough') {
      return obj.passthrough();
    }
    if (this.options.objectMode === 'strict') {
      return obj.strict();
    }
    return obj; // 'strip' — z.object() strips unknown keys by default
  }

  private buildArray(field: ArrayField): ZodTypeAny {
    let arr = z.array(this.serializeField(field.items));
    const c = field.constraints;
    if (c) {
      if (c.minItems !== undefined) {
        arr = arr.min(c.minItems);
      }
      if (c.maxItems !== undefined) {
        arr = arr.max(c.maxItems);
      }
      if (c.uniqueItems && this.options.enforceUniqueItems) {
        return arr.refine(
          (items: unknown[]) => new Set(items.map((i) => JSON.stringify(i))).size === items.length,
          { message: 'Array items must be unique' }
        );
      }
    }
    return arr;
  }

  private buildEnum(field: EnumField): ZodTypeAny {
    const values = field.values.map((v) => v.value);
    if (values.length === 0) {
      throw new SerializerError('Invalid enum field: no values', undefined, { field });
    }
    if (values.every((v) => typeof v === 'string')) {
      return z.enum(values as [string, ...string[]]);
    }
    // Numeric or mixed values → literal union (z.enum only accepts strings).
    const literals = values.map((v) => z.literal(v));
    if (literals.length === 1) {
      return literals[0] as ZodTypeAny;
    }
    return z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  }

  private applyWrappers(base: ZodTypeAny, field: BaseField): ZodTypeAny {
    let schema = base;
    if (field.description !== undefined) {
      schema = schema.describe(field.description);
    }
    if (field.nullable === true) {
      schema = schema.nullable();
    }
    if (field.required === false) {
      schema = schema.optional();
    }
    if (field.default !== undefined) {
      schema = schema.default(field.default);
    }
    return schema;
  }
}

/**
 * Convenience: serialize an IntakeSchema IR to a Zod schema in one call.
 */
export function serializeToZod(ir: IntakeSchema, options?: ZodSerializerOptions): ZodTypeAny {
  return new ZodSerializer(options).serialize(ir);
}

/**
 * Convenience factory mirroring createJSONSchemaSerializer.
 */
export function createZodSerializer(options?: ZodSerializerOptions): ZodSerializer {
  return new ZodSerializer(options);
}
