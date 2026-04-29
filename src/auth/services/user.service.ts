/**
 * User Service
 * Persists users to SQL on login and provides DB-backed permission lookup.
 *
 * Required migration:
 *   CREATE TABLE knowledge.users (
 *     id           VARCHAR(100)   NOT NULL PRIMARY KEY,
 *     email        VARCHAR(255)   NOT NULL,
 *     name         VARCHAR(255),
 *     display_name VARCHAR(255),
 *     entra_oid    VARCHAR(100)   NOT NULL,
 *     entra_upn    VARCHAR(255),
 *     roles        NVARCHAR(MAX)  NOT NULL DEFAULT '["viewer"]',
 *     is_active    BIT            NOT NULL DEFAULT 1,
 *     created_date DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
 *     last_login   DATETIME2
 *   );
 */

import { EntraIdTokenPayload, AppUser } from "../types.js";
import { authConfig } from "../config.js";
import { queryDb } from "../../db.js";

export class UserService {
  /**
   * Upsert the authenticated user into knowledge.users and return an AppUser.
   * DB failure does NOT block login — the user is still authenticated, error is logged.
   */
  async syncUserFromEntraId(entraIdClaims: EntraIdTokenPayload): Promise<AppUser> {
    const entraRoles = entraIdClaims.roles || [];
    const internalRoles = entraRoles
      .map((role) => authConfig.roleMapping[role])
      .filter((role): role is string => role !== undefined);
    const finalRoles = internalRoles.length > 0 ? internalRoles : ["viewer"];

    const user: AppUser = {
      id: entraIdClaims.oid,
      email: entraIdClaims.email || entraIdClaims.upn || "",
      name: entraIdClaims.name || "User",
      displayName: entraIdClaims.name || "User",
      entraId: { oid: entraIdClaims.oid, upn: entraIdClaims.upn || "" },
      roles: finalRoles,
      permissions: this.getPermissionsForRoles(finalRoles),
      lastLogin: new Date(),
      isActive: true,
    };

    try {
      // MERGE: update last_login + roles on subsequent logins; insert on first login
      await queryDb(
        `MERGE knowledge.users AS target
         USING (SELECT ? AS id, ? AS email, ? AS name, ? AS display_name,
                       ? AS entra_oid, ? AS entra_upn, ? AS roles) AS source
         ON target.id = source.id
         WHEN MATCHED THEN
           UPDATE SET email        = source.email,
                      name         = source.name,
                      display_name = source.display_name,
                      entra_upn    = source.entra_upn,
                      roles        = source.roles,
                      last_login   = SYSDATETIME()
         WHEN NOT MATCHED THEN
           INSERT (id, email, name, display_name, entra_oid, entra_upn,
                   roles, is_active, created_date, last_login)
           VALUES (source.id, source.email, source.name, source.display_name,
                   source.entra_oid, source.entra_upn, source.roles,
                   1, SYSDATETIME(), SYSDATETIME());`,
        [
          user.id,
          user.email,
          user.name,
          user.displayName,
          entraIdClaims.oid,
          entraIdClaims.upn || "",
          JSON.stringify(finalRoles),
        ]
      );
    } catch (err) {
      console.error("[UserService] Failed to persist user to DB:", (err as Error).message);
    }

    return user;
  }

  /**
   * Fetch a user and their computed permissions from the DB.
   * Returns null if the user doesn't exist or is inactive.
   */
  async getUserWithPermissions(userId: string): Promise<AppUser | null> {
    try {
      const result = await queryDb(
        `SELECT id, email, name, display_name, entra_oid, entra_upn,
                roles, is_active, last_login
         FROM knowledge.users
         WHERE id = ? AND is_active = 1`,
        [userId]
      );

      if (result.recordset.length === 0) return null;

      const row = result.recordset[0];
      const roles: string[] = JSON.parse(row.roles || '["viewer"]');

      return {
        id: row.id,
        email: row.email,
        name: row.name,
        displayName: row.display_name,
        entraId: { oid: row.entra_oid, upn: row.entra_upn || "" },
        roles,
        permissions: this.getPermissionsForRoles(roles),
        lastLogin: row.last_login ? new Date(row.last_login) : new Date(),
        isActive: true,
      };
    } catch (err) {
      console.error("[UserService] Failed to fetch user from DB:", (err as Error).message);
      return null;
    }
  }

  /**
   * Check if a user has a specific permission.
   * Derives from DB roles — not from the JWT, so it reflects the latest state.
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const user = await this.getUserWithPermissions(userId);
    return user?.permissions.includes(permission) ?? false;
  }

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
      for (const p of permissionMap[role] || []) permissions.add(p);
    }
    return Array.from(permissions);
  }
}

export const userService = new UserService();
