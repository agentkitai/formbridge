/**
 * Tests for SSRF prevention URL validation utilities.
 */

import { describe, it, expect } from 'vitest';
import { isPrivateIP, validateWebhookUrl, sanitizeDestinationHeaders } from '../../src/core/url-validation.js';

describe('isPrivateIP', () => {
  it('should detect loopback addresses', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
    expect(isPrivateIP('127.0.0.2')).toBe(true);
    expect(isPrivateIP('127.255.255.255')).toBe(true);
  });

  it('should detect 10.x.x.x private range', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('10.255.255.255')).toBe(true);
  });

  it('should detect 172.16-31.x.x private range', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
    expect(isPrivateIP('172.15.0.1')).toBe(false);
    expect(isPrivateIP('172.32.0.1')).toBe(false);
  });

  it('should detect 192.168.x.x private range', () => {
    expect(isPrivateIP('192.168.0.1')).toBe(true);
    expect(isPrivateIP('192.168.255.255')).toBe(true);
  });

  it('should detect link-local / AWS IMDS address', () => {
    expect(isPrivateIP('169.254.169.254')).toBe(true);
    expect(isPrivateIP('169.254.0.1')).toBe(true);
  });

  it('should detect 0.0.0.0', () => {
    expect(isPrivateIP('0.0.0.0')).toBe(true);
  });

  it('should detect IPv6 loopback', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('[::1]')).toBe(true);
  });

  it('should detect IPv6 link-local', () => {
    expect(isPrivateIP('fe80::1')).toBe(true);
  });

  it('should detect IPv6 unique local', () => {
    expect(isPrivateIP('fc00::1')).toBe(true);
    expect(isPrivateIP('fd00::1')).toBe(true);
  });

  it('should detect IPv4-mapped IPv6', () => {
    expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
  });

  it('should allow public IPs', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('1.1.1.1')).toBe(false);
    expect(isPrivateIP('93.184.216.34')).toBe(false);
  });
});

describe('validateWebhookUrl', () => {
  it('should allow https URLs with public hostnames', () => {
    expect(validateWebhookUrl('https://example.com/webhook')).toBeNull();
    expect(validateWebhookUrl('https://api.example.com/v1/hook')).toBeNull();
    expect(validateWebhookUrl('http://example.com/webhook')).toBeNull();
  });

  it('should block private IP addresses', () => {
    expect(validateWebhookUrl('https://127.0.0.1/webhook')).not.toBeNull();
    expect(validateWebhookUrl('https://10.0.0.1/webhook')).not.toBeNull();
    expect(validateWebhookUrl('https://192.168.1.1/webhook')).not.toBeNull();
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data')).not.toBeNull();
  });

  it('should block localhost', () => {
    expect(validateWebhookUrl('https://localhost/webhook')).not.toBeNull();
    expect(validateWebhookUrl('http://localhost:3000/webhook')).not.toBeNull();
  });

  it('should block non-http/https schemes', () => {
    expect(validateWebhookUrl('file:///etc/passwd')).not.toBeNull();
    expect(validateWebhookUrl('ftp://example.com/data')).not.toBeNull();
  });

  it('should reject invalid URLs', () => {
    expect(validateWebhookUrl('not-a-url')).not.toBeNull();
    expect(validateWebhookUrl('')).not.toBeNull();
  });
});

describe('sanitizeDestinationHeaders', () => {
  it('should remove blocked headers', () => {
    const result = sanitizeDestinationHeaders({
      'Host': 'evil.com',
      'X-FormBridge-Signature': 'forged',
      'X-Custom': 'allowed',
    });
    expect(result).toEqual({ 'X-Custom': 'allowed' });
  });

  it('should be case-insensitive for blocked headers', () => {
    const result = sanitizeDestinationHeaders({
      'content-type': 'text/html',
      'host': 'evil.com',
      'X-My-Header': 'value',
    });
    expect(result).toEqual({ 'X-My-Header': 'value' });
  });

  it('should allow Authorization header (needed for webhook auth)', () => {
    const result = sanitizeDestinationHeaders({
      'Authorization': 'Bearer token',
      'Host': 'evil.com',
    });
    expect(result).toEqual({ 'Authorization': 'Bearer token' });
  });

  it('should return empty object for undefined input', () => {
    expect(sanitizeDestinationHeaders(undefined)).toEqual({});
  });

  it('should pass through allowed headers', () => {
    const result = sanitizeDestinationHeaders({
      'X-Custom-Header': 'value',
      'Accept': 'application/json',
    });
    expect(result).toEqual({
      'X-Custom-Header': 'value',
      'Accept': 'application/json',
    });
  });
});
