/**
 * User Service
 * Handles user mapping, RBAC, and database integration
 *
 * Responsibilities:
 * - Map Entra ID users to internal users
 * - Apply role mappings and RBAC
 * - Database sync (create, update, provisioning)
 * - Permission computation
 */

import { EntraIdTokenPayload, AppUser } from "../types.js";
import { authConfig } from "../config.js";

export class UserService {
  /**
   * Create or update application user from Entra ID claims
   * In production: sync with database, apply role mappings
   *
   * @param entraIdClaims Verified token claims from Entra ID
   * @returns Application user with roles and permissions
   */
  async syncUserFromEntraId(
    entraIdClaims: EntraIdTokenPayload
  ): Promise<AppUser> {
    // TODO: In production, integrate with database
    // 1. Check if user exists (by OID)
    // 2. Create if new, update if exists
    // 3. Fetch user permissions from RBAC table
    // 4. Apply role mappings from configuration

    const entraRoles = entraIdClaims.roles || [];

    // Map Entra ID roles to internal roles
    const internalRoles = entraRoles
      .map((role) => authConfig.roleMapping[role])
      .filter((role): role is string => role !== undefined);

    // Default to 'viewer' if no matching roles
    const finalRoles = internalRoles.length > 0 ? internalRoles : ["viewer"];

    const user: AppUser = {
      id: entraIdClaims.oid, // Use Entra ID OID as internal ID
      email: entraIdClaims.email || entraIdClaims.upn || "",
      name: entraIdClaims.name || "User",
      displayName: entraIdClaims.name || "User",
      entraId: {
        oid: entraIdClaims.oid,
        upn: entraIdClaims.upn || "",
      },
      roles: finalRoles,
      permissions: this.getPermissionsForRoles(finalRoles),
      lastLogin: new Date(),
      isActive: true,
    };

    // TODO: Save to database
    // await db.query(
    //   `INSERT INTO users (id, email, display_name, roles, last_login)
    //    VALUES (@id, @email, @displayName, @roles, @lastLogin)
    //    ON CONFLICT(id) DO UPDATE SET last_login = @lastLogin`
    // );

    return user;
  }

  /**
   * Get granular permissions based on roles
   * Example: "admin" has all permissions, "viewer" has read-only
   *
   * In production: fetch from database rbac_permissions table
   *
   * @param roles User roles
   * @returns Array of permission strings
   */
  private getPermissionsForRoles(roles: string[]): string[] {
    const permissionMap: Record<string, string[]> = {
      admin: [
        "read:documents",
        "write:documents",
        "delete:documents",
        "manage:users",
        "manage:rag",
        "manage:roles",
      ],
      analyst: [
        "read:documents",
        "write:documents",
        "query:rag",
        "export:documents",
      ],
      viewer: ["read:documents", "query:rag"],
    };

    const permissions = new Set<string>();
    for (const role of roles) {
      const rolePerms = permissionMap[role] || [];
      rolePerms.forEach((p) => permissions.add(p));
    }

    return Array.from(permissions);
  }

  /**
   * Fetch user with current permissions
   * Used by middleware and protected endpoints
   * In production: query database
   *
   * @param userId Internal user ID
   * @returns User with permissions, or null if inactive/deleted
   */
  async getUserWithPermissions(userId: string): Promise<AppUser | null> {
    // TODO: Fetch from database
    // SELECT u.*, GROUP_CONCAT(p.permission) as permissions
    // FROM users u
    // LEFT JOIN user_roles ur ON u.id = ur.user_id
    // LEFT JOIN role_permissions rp ON ur.role_id = rp.role_id
    // LEFT JOIN permissions p ON rp.permission_id = p.id
    // WHERE u.id = @userId AND u.is_active = 1
    return null;
  }

  /**
   * Check if user has permission
   * Used for fine-grained authorization
   * In production: cache permissions, validate against database
   *
   * @param userId User ID
   * @param permission Permission string to check
   * @returns True if user has permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    // TODO: Fetch user permissions from cache or database
    // Check if permission is in user.permissions array
    return false;
  }
}

export const userService = new UserService();
