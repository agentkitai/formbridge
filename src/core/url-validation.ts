/**
 * URL validation utilities for SSRF prevention.
 *
 * Blocks requests to private/internal IP ranges and dangerous URL schemes.
 * Implements CWE-918 protection.
 */

import { URL } from 'url';

/** Allowed URL schemes for webhook destinations */
const ALLOWED_SCHEMES = new Set(['https:', 'http:']);

/** Headers that must not be overridden by destination config */
const BLOCKED_HEADERS = new Set([
  'host',
  'content-type',
  'content-length',
  'transfer-encoding',
  'x-formbridge-signature',
  'x-formbridge-timestamp',
]);

/**
 * Check if an IP address is in a private/reserved range.
 * Blocks RFC 1918 ranges, loopback, link-local, and IPv6 equivalents.
 */
export function isPrivateIP(ip: string): boolean {
  // IPv4 checks
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    // Loopback: 127.0.0.0/8
    if (parts[0] === 127) return true;
    // Private: 10.0.0.0/8
    if (parts[0] === 10) return true;
    // Private: 172.16.0.0/12
    if (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31) return true;
    // Private: 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // Link-local: 169.254.0.0/16 (includes AWS IMDS at 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // Broadcast: 0.0.0.0
    if (parts[0] === 0) return true;
  }

  // IPv6 checks
  const lowerIp = ip.toLowerCase();
  // Loopback: ::1
  if (lowerIp === '::1' || lowerIp === '[::1]') return true;
  // Link-local: fe80::/10
  if (lowerIp.startsWith('fe80:') || lowerIp.startsWith('[fe80:')) return true;
  // Unique local: fc00::/7 (fd00::/8 and fc00::/8)
  if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd') ||
      lowerIp.startsWith('[fc') || lowerIp.startsWith('[fd')) return true;
  // IPv4-mapped IPv6: ::ffff:127.0.0.1 etc.
  if (lowerIp.startsWith('::ffff:') || lowerIp.startsWith('[::ffff:')) {
    const v4Part = lowerIp.replace(/^\[?::ffff:/, '').replace(/\]$/, '');
    return isPrivateIP(v4Part);
  }

  return false;
}

/**
 * Validate a webhook destination URL for SSRF safety.
 *
 * @returns null if the URL is safe, or an error message string if blocked.
 */
export function validateWebhookUrl(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return 'Invalid URL format';
  }

  // Check scheme
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return `Scheme '${parsed.protocol}' is not allowed. Only http: and https: are permitted.`;
  }

  // Check hostname
  const hostname = parsed.hostname;

  // Block empty hostname
  if (!hostname) {
    return 'URL must have a hostname';
  }

  // Block IP-based hostnames that resolve to private ranges
  if (isPrivateIP(hostname)) {
    return `Hostname '${hostname}' resolves to a private/reserved IP range`;
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
    return `Hostname '${hostname}' is not allowed for webhook destinations`;
  }

  return null;
}

/**
 * Sanitize destination headers by removing blocked headers.
 * Returns a new headers object with only allowed headers.
 */
export function sanitizeDestinationHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  if (!headers) return {};

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
