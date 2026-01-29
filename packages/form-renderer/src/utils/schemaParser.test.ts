/**
 * Tests for schema parser utility
 */

import { describe, it, expect } from 'vitest';
import {
  parseSchema,
  parseField,
  parseObjectFields,
  getFieldType,
  getPrimaryType,
  isNullable,
  formatLabel,
  getDefaultValue,
  buildInitialData,
  getFieldValue,
  setFieldValue,
  isEnumField,
  isArrayField,
  isObjectField,
  getEnumOptions,
} from './schemaParser';
import { IntakeSchema, JSONSchemaProperty } from '../types';

describe('schemaParser', () => {
  describe('parseSchema', () => {
    it('parses simple schema with string and number fields', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Full Name' },
          age: { type: 'number', title: 'Age' },
        },
        required: ['name'],
      };

      const fields = parseSchema(schema);

      expect(fields).toHaveLength(2);
      expect(fields[0]).toMatchObject({
        path: 'name',
        type: 'string',
        label: 'Full Name',
        required: true,
      });
      expect(fields[1]).toMatchObject({
        path: 'age',
        type: 'number',
        label: 'Age',
        required: false,
      });
    });

    it('parses schema with no properties', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {},
      };

      const fields = parseSchema(schema);
      expect(fields).toHaveLength(0);
    });

    it('parses schema without properties field', () => {
      const schema: IntakeSchema = {
        type: 'object',
      } as IntakeSchema;

      const fields = parseSchema(schema);
      expect(fields).toHaveLength(0);
    });

    it('parses schema with boolean and enum fields', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          active: { type: 'boolean', title: 'Active Status' },
          status: { type: 'string', enum: ['draft', 'published'], title: 'Status' },
        },
      };

      const fields = parseSchema(schema);

      expect(fields).toHaveLength(2);
      expect(fields[0].type).toBe('boolean');
      expect(fields[1].schema.enum).toEqual(['draft', 'published']);
    });

    it('applies UI hints to fields', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      };

      const uiHints = {
        fieldHints: {
          email: {
            placeholder: 'Enter your email',
            helpText: 'We will never share your email',
          },
        },
      };

      const fields = parseSchema(schema, uiHints);

      expect(fields[0].hint).toEqual({
        placeholder: 'Enter your email',
        helpText: 'We will never share your email',
      });
    });

    it('includes schema property in field metadata', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 20,
            pattern: '^[a-z0-9]+$',
          },
        },
      };

      const fields = parseSchema(schema);

      expect(fields[0].schema).toEqual({
        type: 'string',
        minLength: 3,
        maxLength: 20,
        pattern: '^[a-z0-9]+$',
      });
    });

    it('includes description in field metadata', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          bio: {
            type: 'string',
            title: 'Biography',
            description: 'Tell us about yourself',
          },
        },
      };

      const fields = parseSchema(schema);

      expect(fields[0].description).toBe('Tell us about yourself');
    });
  });

  describe('parseField', () => {
    it('parses string field with title', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
        title: 'Email Address',
        description: 'Your email',
      };

      const field = parseField('email', property, true);

      expect(field).toEqual({
        path: 'email',
        type: 'string',
        label: 'Email Address',
        description: 'Your email',
        required: true,
        schema: property,
        hint: undefined,
      });
    });

    it('generates label from path when no title provided', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
      };

      const field = parseField('firstName', property);

      expect(field.label).toBe('First Name');
    });

    it('includes UI hint when provided', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
      };

      const hint = { placeholder: 'Enter name' };
      const field = parseField('name', property, false, hint);

      expect(field.hint).toEqual(hint);
    });

    it('defaults required to false when not specified', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
      };

      const field = parseField('name', property);

      expect(field.required).toBe(false);
    });
  });

  describe('parseObjectFields', () => {
    it('parses nested object fields', () => {
      const property: JSONSchemaProperty = {
        type: 'object',
        properties: {
          street: { type: 'string', title: 'Street' },
          city: { type: 'string', title: 'City' },
          zipCode: { type: 'string', title: 'ZIP Code' },
        },
        required: ['street', 'city'],
      };

      const fields = parseObjectFields('address', property);

      expect(fields).toHaveLength(3);
      expect(fields[0]).toMatchObject({
        path: 'address.street',
        type: 'string',
        label: 'Street',
        required: true,
      });
      expect(fields[1]).toMatchObject({
        path: 'address.city',
        type: 'string',
        label: 'City',
        required: true,
      });
      expect(fields[2]).toMatchObject({
        path: 'address.zipCode',
        type: 'string',
        label: 'ZIP Code',
        required: false,
      });
    });

    it('returns empty array when no properties', () => {
      const property: JSONSchemaProperty = {
        type: 'object',
      };

      const fields = parseObjectFields('obj', property);

      expect(fields).toHaveLength(0);
    });

    it('applies UI hints to nested fields', () => {
      const property: JSONSchemaProperty = {
        type: 'object',
        properties: {
          line1: { type: 'string' },
        },
      };

      const uiHints = {
        fieldHints: {
          'address.line1': { placeholder: 'Street address' },
        },
      };

      const fields = parseObjectFields('address', property, uiHints);

      expect(fields[0].hint).toEqual({ placeholder: 'Street address' });
    });
  });

  describe('getFieldType', () => {
    it('returns type for simple types', () => {
      expect(getFieldType({ type: 'string' })).toBe('string');
      expect(getFieldType({ type: 'number' })).toBe('number');
      expect(getFieldType({ type: 'boolean' })).toBe('boolean');
    });

    it('returns type array for union types', () => {
      const type = getFieldType({ type: ['string', 'null'] });
      expect(type).toEqual(['string', 'null']);
    });

    it('infers object type from properties', () => {
      expect(getFieldType({ properties: { name: { type: 'string' } } })).toBe(
        'object'
      );
    });

    it('infers array type from items', () => {
      expect(getFieldType({ items: { type: 'string' } })).toBe('array');
    });

    it('infers string type from enum', () => {
      expect(getFieldType({ enum: ['a', 'b', 'c'] })).toBe('string');
    });

    it('defaults to string when no type info', () => {
      expect(getFieldType({})).toBe('string');
    });
  });

  describe('getPrimaryType', () => {
    it('returns single type as-is', () => {
      expect(getPrimaryType('string')).toBe('string');
      expect(getPrimaryType('number')).toBe('number');
    });

    it('returns first non-null type from array', () => {
      expect(getPrimaryType(['string', 'null'])).toBe('string');
      expect(getPrimaryType(['null', 'number'])).toBe('number');
    });

    it('defaults to string when only null in array', () => {
      expect(getPrimaryType(['null'])).toBe('string');
    });
  });

  describe('isNullable', () => {
    it('returns false for single non-null types', () => {
      expect(isNullable('string')).toBe(false);
      expect(isNullable('number')).toBe(false);
    });

    it('returns true when null is in type array', () => {
      expect(isNullable(['string', 'null'])).toBe(true);
      expect(isNullable(['null', 'number'])).toBe(true);
    });

    it('returns false when null is not in type array', () => {
      expect(isNullable(['string', 'number'])).toBe(false);
    });
  });

  describe('formatLabel', () => {
    it('formats camelCase to Title Case', () => {
      expect(formatLabel('firstName')).toBe('First Name');
      expect(formatLabel('emailAddress')).toBe('Email Address');
    });

    it('formats snake_case to Title Case', () => {
      expect(formatLabel('first_name')).toBe('First Name');
      expect(formatLabel('email_address')).toBe('Email Address');
    });

    it('formats single word', () => {
      expect(formatLabel('name')).toBe('Name');
      expect(formatLabel('email')).toBe('Email');
    });

    it('handles nested paths by using last segment', () => {
      expect(formatLabel('address.streetName')).toBe('Street Name');
      expect(formatLabel('user.profile.firstName')).toBe('First Name');
    });

    it('removes array indices', () => {
      expect(formatLabel('items[0]')).toBe('Items');
      expect(formatLabel('users[0].name')).toBe('Name');
    });

    it('handles all caps', () => {
      expect(formatLabel('URL')).toBe('Url');
    });

    it('handles mixed formats', () => {
      expect(formatLabel('user_firstName')).toBe('User First Name');
    });
  });

  describe('getDefaultValue', () => {
    it('returns explicit default value when provided', () => {
      expect(getDefaultValue({ type: 'string', default: 'hello' })).toBe('hello');
      expect(getDefaultValue({ type: 'number', default: 42 })).toBe(42);
      expect(getDefaultValue({ type: 'boolean', default: true })).toBe(true);
    });

    it('returns const value when provided', () => {
      expect(getDefaultValue({ type: 'string', const: 'fixed' })).toBe('fixed');
    });

    it('prefers default over const', () => {
      expect(getDefaultValue({ type: 'string', default: 'def', const: 'con' })).toBe(
        'def'
      );
    });

    it('returns empty string for string type', () => {
      expect(getDefaultValue({ type: 'string' })).toBe('');
    });

    it('returns null for number type', () => {
      expect(getDefaultValue({ type: 'number' })).toBeNull();
      expect(getDefaultValue({ type: 'integer' })).toBeNull();
    });

    it('returns false for boolean type', () => {
      expect(getDefaultValue({ type: 'boolean' })).toBe(false);
    });

    it('returns empty array for array type', () => {
      expect(getDefaultValue({ type: 'array' })).toEqual([]);
    });

    it('returns empty object for object type', () => {
      expect(getDefaultValue({ type: 'object' })).toEqual({});
    });

    it('returns null for null type', () => {
      expect(getDefaultValue({ type: 'null' })).toBeNull();
    });

    it('handles union types by using primary type', () => {
      expect(getDefaultValue({ type: ['string', 'null'] })).toBe('');
      expect(getDefaultValue({ type: ['null', 'number'] })).toBeNull();
    });
  });

  describe('buildInitialData', () => {
    it('builds initial data with default values', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
      };

      const data = buildInitialData(schema);

      expect(data).toEqual({
        name: '',
        age: null,
        active: false,
      });
    });

    it('uses explicit default values from schema', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'John' },
          age: { type: 'number', default: 25 },
        },
      };

      const data = buildInitialData(schema);

      expect(data).toEqual({
        name: 'John',
        age: 25,
      });
    });

    it('returns empty object when no properties', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {},
      };

      const data = buildInitialData(schema);

      expect(data).toEqual({});
    });

    it('returns empty object when properties undefined', () => {
      const schema: IntakeSchema = {
        type: 'object',
      } as IntakeSchema;

      const data = buildInitialData(schema);

      expect(data).toEqual({});
    });
  });

  describe('getFieldValue', () => {
    it('gets top-level field value', () => {
      const data = { name: 'John', age: 30 };

      expect(getFieldValue(data, 'name')).toBe('John');
      expect(getFieldValue(data, 'age')).toBe(30);
    });

    it('gets nested field value', () => {
      const data = {
        user: {
          profile: {
            firstName: 'John',
          },
        },
      };

      expect(getFieldValue(data, 'user.profile.firstName')).toBe('John');
    });

    it('gets array element value', () => {
      const data = {
        items: ['apple', 'banana', 'cherry'],
      };

      expect(getFieldValue(data, 'items[0]')).toBe('apple');
      expect(getFieldValue(data, 'items[1]')).toBe('banana');
    });

    it('gets nested object in array', () => {
      const data = {
        users: [{ name: 'John' }, { name: 'Jane' }],
      };

      expect(getFieldValue(data, 'users[0].name')).toBe('John');
      expect(getFieldValue(data, 'users[1].name')).toBe('Jane');
    });

    it('returns undefined for non-existent path', () => {
      const data = { name: 'John' };

      expect(getFieldValue(data, 'age')).toBeUndefined();
      expect(getFieldValue(data, 'address.city')).toBeUndefined();
    });

    it('returns undefined for undefined intermediate values', () => {
      const data = { user: null };

      expect(getFieldValue(data, 'user.name')).toBeUndefined();
    });
  });

  describe('setFieldValue', () => {
    it('sets top-level field value', () => {
      const data = { name: 'John' };

      const result = setFieldValue(data, 'age', 30);

      expect(result).toEqual({ name: 'John', age: 30 });
      expect(data).toEqual({ name: 'John' }); // Original unchanged
    });

    it('updates existing top-level field', () => {
      const data = { name: 'John', age: 25 };

      const result = setFieldValue(data, 'age', 30);

      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('sets nested field value', () => {
      const data = { user: { name: 'John' } };

      const result = setFieldValue(data, 'user.age', 30);

      expect(result).toEqual({ user: { name: 'John', age: 30 } });
    });

    it('creates nested path if not exists', () => {
      const data = {};

      const result = setFieldValue(data, 'user.profile.firstName', 'John');

      expect(result).toEqual({
        user: {
          profile: {
            firstName: 'John',
          },
        },
      });
    });

    it('sets array element value', () => {
      const data = { items: ['apple', 'banana'] };

      const result = setFieldValue(data, 'items[1]', 'cherry');

      expect(result).toEqual({ items: ['apple', 'cherry'] });
    });

    it('creates array if not exists', () => {
      const data = {};

      const result = setFieldValue(data, 'items[0]', 'apple');

      expect(result.items).toEqual(['apple']);
    });

    it('sets nested object in array', () => {
      const data = { users: [{ name: 'John' }] };

      const result = setFieldValue(data, 'users[0].age', 30);

      expect(result).toEqual({ users: [{ name: 'John', age: 30 }] });
    });

    it('maintains immutability', () => {
      const data = { user: { profile: { name: 'John' } } };
      const original = JSON.parse(JSON.stringify(data));

      setFieldValue(data, 'user.profile.age', 30);

      expect(data).toEqual(original);
    });

    it('handles deeply nested paths', () => {
      const data = {};

      const result = setFieldValue(data, 'a.b.c.d.e', 'deep');

      expect(result).toEqual({
        a: {
          b: {
            c: {
              d: {
                e: 'deep',
              },
            },
          },
        },
      });
    });
  });

  describe('isEnumField', () => {
    it('returns true for field with enum values', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
        enum: ['a', 'b', 'c'],
      };

      expect(isEnumField(property)).toBe(true);
    });

    it('returns false for field without enum', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
      };

      expect(isEnumField(property)).toBe(false);
    });

    it('returns false for empty enum array', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
        enum: [],
      };

      expect(isEnumField(property)).toBe(false);
    });

    it('returns false when enum is not an array', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
        enum: 'invalid' as any,
      };

      expect(isEnumField(property)).toBe(false);
    });
  });

  describe('isArrayField', () => {
    it('returns true for array type', () => {
      const property: JSONSchemaProperty = {
        type: 'array',
        items: { type: 'string' },
      };

      expect(isArrayField(property)).toBe(true);
    });

    it('returns false for non-array types', () => {
      expect(isArrayField({ type: 'string' })).toBe(false);
      expect(isArrayField({ type: 'number' })).toBe(false);
      expect(isArrayField({ type: 'object' })).toBe(false);
    });

    it('returns true for union type with array', () => {
      const property: JSONSchemaProperty = {
        type: ['array', 'null'],
      };

      expect(isArrayField(property)).toBe(true);
    });
  });

  describe('isObjectField', () => {
    it('returns true for object type', () => {
      const property: JSONSchemaProperty = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };

      expect(isObjectField(property)).toBe(true);
    });

    it('returns false for non-object types', () => {
      expect(isObjectField({ type: 'string' })).toBe(false);
      expect(isObjectField({ type: 'number' })).toBe(false);
      expect(isObjectField({ type: 'array' })).toBe(false);
    });

    it('returns true for union type with object', () => {
      const property: JSONSchemaProperty = {
        type: ['object', 'null'],
      };

      expect(isObjectField(property)).toBe(true);
    });
  });

  describe('getEnumOptions', () => {
    it('returns enum values', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };

      expect(getEnumOptions(property)).toEqual(['red', 'green', 'blue']);
    });

    it('returns empty array when no enum', () => {
      const property: JSONSchemaProperty = {
        type: 'string',
      };

      expect(getEnumOptions(property)).toEqual([]);
    });

    it('handles mixed type enums', () => {
      const property: JSONSchemaProperty = {
        enum: [1, 'two', true, null],
      };

      expect(getEnumOptions(property)).toEqual([1, 'two', true, null]);
    });
  });

  describe('Edge Cases', () => {
    it('handles schema with all field types', () => {
      const schema: IntakeSchema = {
        type: 'object',
        properties: {
          str: { type: 'string' },
          num: { type: 'number' },
          int: { type: 'integer' },
          bool: { type: 'boolean' },
          arr: { type: 'array', items: { type: 'string' } },
          obj: { type: 'object', properties: { nested: { type: 'string' } } },
          enm: { type: 'string', enum: ['a', 'b'] },
        },
      };

      const fields = parseSchema(schema);

      expect(fields).toHaveLength(7);
      expect(fields.map((f) => f.type)).toEqual([
        'string',
        'number',
        'integer',
        'boolean',
        'array',
        'object',
        'string',
      ]);
    });

    it('handles complex nested structures', () => {
      const data = {
        users: [
          { profile: { address: { city: 'NYC' } } },
          { profile: { address: { city: 'LA' } } },
        ],
      };

      expect(getFieldValue(data, 'users[0].profile.address.city')).toBe('NYC');
      expect(getFieldValue(data, 'users[1].profile.address.city')).toBe('LA');
    });

    it('handles setting values in complex nested structures', () => {
      const data = {};

      let result = setFieldValue(data, 'users[0].profile.name', 'John');
      result = setFieldValue(result, 'users[0].profile.age', 30);
      result = setFieldValue(result, 'users[1].profile.name', 'Jane');

      expect(result).toEqual({
        users: [
          { profile: { name: 'John', age: 30 } },
          { profile: { name: 'Jane' } },
        ],
      });
    });
  });
});
