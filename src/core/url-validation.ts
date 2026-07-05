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

/** Cloud metadata hostnames — never a valid webhook destination. */
const CLOUD_METADATA_HOSTNAMES = new Set(['metadata.google.internal', 'metadata', 'instance-data']);

/**
 * Cloud metadata endpoints (AWS/GCP IMDS at 169.254.169.254 and friends). These are
 * the canonical SSRF credential-theft targets and stay blocked ALWAYS — even under the
 * dev `allowPrivate` escape hatch. Checked BEFORE the general private-IP relaxation so
 * the escape hatch can never re-open the metadata address (which is itself link-local).
 */
export function isCloudMetadata(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === '169.254.169.254' || h === 'fd00:ec2::254') return true;
  if (CLOUD_METADATA_HOSTNAMES.has(h)) return true;
  for (const meta of CLOUD_METADATA_HOSTNAMES) {
    if (h.endsWith('.' + meta)) return true;
  }
  return false;
}

/**
 * Whether loopback/private webhook destinations are permitted — driven by
 * `FORMBRIDGE_ALLOW_PRIVATE_WEBHOOKS` (dev/test ONLY, default off).
 *
 * HARD-REFUSED in production: when `NODE_ENV=production` this always returns false,
 * even if the env var is set, so a dev-only ergonomics switch can never open an SSRF
 * hole in prod. Cloud metadata + non-HTTP(S) stay blocked regardless (see
 * {@link validateWebhookUrl}).
 */
export function allowPrivateWebhooks(): boolean {
  if (process.env['NODE_ENV'] === 'production') return false;
  const raw = (process.env['FORMBRIDGE_ALLOW_PRIVATE_WEBHOOKS'] ?? '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** Options for {@link validateWebhookUrl}. */
export interface ValidateWebhookUrlOptions {
  /**
   * Dev/test ONLY: permit loopback + RFC-1918/private-range destinations
   * (127.0.0.1, ::1, 10.x, 172.16-31.x, 192.168.x, localhost). Cloud metadata and
   * non-HTTP(S) stay blocked even when set. Defaults to {@link allowPrivateWebhooks}
   * (the `FORMBRIDGE_ALLOW_PRIVATE_WEBHOOKS` env flag, hard-refused in production).
   */
  allowPrivate?: boolean;
}

/**
 * Validate a webhook destination URL for SSRF safety.
 *
 * @returns null if the URL is safe, or an error message string if blocked.
 */
export function validateWebhookUrl(
  urlString: string,
  options: ValidateWebhookUrlOptions = {}
): string | null {
  const allowPrivate = options.allowPrivate ?? allowPrivateWebhooks();

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return 'Invalid URL format';
  }

  // Check scheme (always enforced)
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return `Scheme '${parsed.protocol}' is not allowed. Only http: and https: are permitted.`;
  }

  // Check hostname
  const hostname = parsed.hostname;

  // Block empty hostname
  if (!hostname) {
    return 'URL must have a hostname';
  }

  // Cloud metadata is NEVER allowed — not even under the allowPrivate escape hatch.
  if (isCloudMetadata(hostname)) {
    return `Hostname '${hostname}' targets a cloud metadata endpoint`;
  }

  // Loopback / private ranges — relaxable only via the dev allowPrivate escape hatch.
  if (!allowPrivate) {
    // Block IP-based hostnames that resolve to private ranges
    if (isPrivateIP(hostname)) {
      return `Hostname '${hostname}' resolves to a private/reserved IP range`;
    }

    // Block localhost variants
    if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
      return `Hostname '${hostname}' is not allowed for webhook destinations`;
    }
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
