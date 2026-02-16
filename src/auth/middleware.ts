/**
 * Auth Middleware — Hono middleware pipeline for authentication.
 *
 * Supports:
 * - API key authentication (Authorization: Bearer fb_key_...)
 * - OAuth JWT authentication (Authorization: Bearer <jwt>)
 * - Optional auth (disabled in dev)
 */

import type { Context, Next } from "hono";
import {
  hashApiKey,
  isFormBridgeApiKey,
  type ApiKeyStore,
} from "./api-key-auth.js";
import { OAuthProvider } from "./oauth-provider.js";
import { type Role, hasPermission, type Permission } from "./rbac.js";
import { RateLimiter } from "./rate-limiter.js";

const VALID_ROLES = new Set<string>(["admin", "reviewer", "viewer"]);
function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && VALID_ROLES.has(value);
}

// =============================================================================
// § Types
// =============================================================================

export interface AuthConfig {
  /** Whether auth is enabled (false in dev) */
  enabled: boolean;
  /** API key store */
  apiKeyStore?: ApiKeyStore;
  /** OAuth provider config */
  oauthProvider?: OAuthProvider;
  /** Rate limiter */
  rateLimiter?: RateLimiter;
  /** Default role for API key auth when no role is specified */
  defaultRole?: Role;
}

export interface AuthContext {
  authenticated: boolean;
  tenantId?: string;
  userId?: string;
  role?: Role;
  authMethod?: "api-key" | "oauth" | "none";
}

// =============================================================================
// § Middleware Factory
// =============================================================================

/**
 * Create the auth middleware.
 *
 * When auth is disabled, all requests pass through with a default auth context.
 */
export function createAuthMiddleware(config: AuthConfig) {
  return async (c: Context, next: Next) => {
    // Auth disabled — pass through
    if (!config.enabled) {
      setAuthContext(c, {
        authenticated: true,
        authMethod: "none",
        role: "admin",
        tenantId: "default",
      });
      return next();
    }

    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        {
          ok: false,
          error: {
            type: "unauthorized",
            message: "Missing or invalid Authorization header",
          },
        },
        401
      );
    }

    const token = authHeader.slice("Bearer ".length);

    let authContext: AuthContext;

    if (isFormBridgeApiKey(token)) {
      // API key auth
      authContext = authenticateApiKey(token, config);
    } else {
      // OAuth JWT auth
      authContext = await authenticateOAuth(token, config);
    }

    if (!authContext.authenticated) {
      return c.json(
        {
          ok: false,
          error: { type: "unauthorized", message: "Authentication failed" },
        },
        401
      );
    }

    // Rate limiting
    if (config.rateLimiter && authContext.tenantId) {
      const rateLimitKey = authContext.tenantId;
      const result = config.rateLimiter.check(rateLimitKey);

      c.header("X-RateLimit-Limit", String(result.limit));
      c.header("X-RateLimit-Remaining", String(result.remaining));
      c.header("X-RateLimit-Reset", String(result.resetAt));

      if (!result.allowed) {
        return c.json(
          {
            ok: false,
            error: {
              type: "rate_limited",
              message: "Rate limit exceeded",
              retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
            },
          },
          429
        );
      }
    }

    setAuthContext(c, authContext);
    return next();
  };
}

/**
 * Create a permission-checking middleware.
 */
export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next) => {
    const auth = getAuthContext(c);

    if (!auth?.authenticated) {
      return c.json(
        { ok: false, error: { type: "unauthorized", message: "Not authenticated" } },
        401
      );
    }

    if (!auth.role || !hasPermission(auth.role, permission)) {
      return c.json(
        {
          ok: false,
          error: { type: "forbidden", message: `Missing permission: ${permission}` },
        },
        403
      );
    }

    return next();
  };
}

// =============================================================================
// § Auth Helpers
// =============================================================================

function authenticateApiKey(rawKey: string, config: AuthConfig): AuthContext {
  if (!config.apiKeyStore) {
    return { authenticated: false };
  }

  const keyHash = hashApiKey(rawKey);
  const key = config.apiKeyStore.getByHash(keyHash);

  if (!key || !key.active) {
    return { authenticated: false };
  }

  // Check expiration
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return { authenticated: false };
  }

  // Map API key operations to role
  const role: Role = key.operations.includes("admin")
    ? "admin"
    : key.operations.includes("approve")
      ? "reviewer"
      : "viewer";

  return {
    authenticated: true,
    authMethod: "api-key",
    tenantId: key.tenantId,
    role,
  };
}

async function authenticateOAuth(
  token: string,
  config: AuthConfig
): Promise<AuthContext> {
  if (!config.oauthProvider) {
    return { authenticated: false };
  }

  const result = await config.oauthProvider.validateToken(token);

  if (!result.valid || !result.claims) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    authMethod: "oauth",
    userId: result.claims.sub,
    tenantId: result.claims.tenantId,
    role: isValidRole(result.claims.role) ? result.claims.role : (config.defaultRole ?? "viewer"),
  };
}

// =============================================================================
// § Context Accessors
// =============================================================================

const AUTH_CONTEXT_KEY = "formbridge-auth";

function setAuthContext(c: Context, auth: AuthContext): void {
  c.set(AUTH_CONTEXT_KEY, auth);
}

export function getAuthContext(c: Context): AuthContext | undefined {
  const value: unknown = c.get(AUTH_CONTEXT_KEY);
  if (
    value !== null &&
    typeof value === 'object' &&
    'authenticated' in value &&
    typeof (value as Record<string, unknown>).authenticated === 'boolean'
  ) {
    // SAFE: runtime shape validated above — this is a manual type guard
    return value as AuthContext;
  }
  return undefined;
}

// =============================================================================
// § Tenant Scoping Helpers
// =============================================================================

/**
 * Get the tenant ID from the auth context for the current request.
 * Returns undefined if auth is disabled or no tenant context.
 */
export function getRequestTenantId(c: Context): string | undefined {
  const auth = getAuthContext(c);
  return auth?.tenantId;
}

/**
 * Check if the current request should bypass tenant filtering.
 * Admin role can access all tenants.
 */
export function isTenantFilterBypassed(c: Context): boolean {
  const auth = getAuthContext(c);
  return auth?.role === "admin";
}

/**
 * Check if a submission matches the tenant scope of the current request.
 * Returns true if:
 * - The user is admin (bypasses tenant filter)
 * - The submission's tenantId matches the request's tenantId
 * - The submission has no tenantId (legacy data)
 */
export function matchesTenantScope(
  c: Context,
  submissionTenantId: string | undefined
): boolean {
  if (isTenantFilterBypassed(c)) return true;
  const requestTenantId = getRequestTenantId(c);
  if (!requestTenantId) return true; // No tenant context (auth disabled)
  if (!submissionTenantId) return true; // Legacy data without tenant
  return submissionTenantId === requestTenantId;
}
