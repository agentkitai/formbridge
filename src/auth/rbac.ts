/**
 * Role-Based Access Control (RBAC)
 *
 * Defines roles and their permissions:
 * - admin: Full access to all operations
 * - reviewer: Read + approve/reject submissions
 * - viewer: Read-only access
 */

// =============================================================================
// § Types
// =============================================================================

export type Role = "admin" | "reviewer" | "viewer";

export type Permission =
  | "intake:read"
  | "intake:write"
  | "intake:delete"
  | "submission:read"
  | "submission:write"
  | "submission:delete"
  | "approval:read"
  | "approval:approve"
  | "approval:reject"
  | "webhook:read"
  | "webhook:write"
  | "webhook:retry"
  | "analytics:read"
  | "tenant:read"
  | "tenant:write"
  | "apikey:read"
  | "apikey:write"
  | "apikey:revoke";

// =============================================================================
// § Permission Matrix
// =============================================================================

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "intake:read",
    "intake:write",
    "intake:delete",
    "submission:read",
    "submission:write",
    "submission:delete",
    "approval:read",
    "approval:approve",
    "approval:reject",
    "webhook:read",
    "webhook:write",
    "webhook:retry",
    "analytics:read",
    "tenant:read",
    "tenant:write",
    "apikey:read",
    "apikey:write",
    "apikey:revoke",
  ],

  reviewer: [
    "intake:read",
    "submission:read",
    "approval:read",
    "approval:approve",
    "approval:reject",
    "webhook:read",
    "analytics:read",
  ],

  viewer: [
    "intake:read",
    "submission:read",
    "approval:read",
    "webhook:read",
    "analytics:read",
  ],
};

// =============================================================================
// § RBAC Functions
// =============================================================================

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions != null && permissions.includes(permission);
}

/**
 * Get all permissions for a role.
 */
export function getPermissions(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/**
 * Get all defined roles.
 */
export function getRoles(): Role[] {
  // SAFE: ROLE_PERMISSIONS is a const Record<Role, ...> defined in this file —
  // Object.keys returns string[] by design but here the keys are known at compile time
  const roles: Role[] = ["admin", "reviewer", "viewer"];
  return roles;
}

/**
 * Validate that a string is a valid role.
 */
export function isValidRole(role: string): role is Role {
  return role in ROLE_PERMISSIONS;
}

/**
 * Check if role A has at least all permissions of role B.
 */
export function isRoleAtLeast(role: Role, minimumRole: Role): boolean {
  const minimumPermissions = ROLE_PERMISSIONS[minimumRole];
  const rolePermissions = new Set(ROLE_PERMISSIONS[role]);
  return minimumPermissions.every((p) => rolePermissions.has(p));
}
