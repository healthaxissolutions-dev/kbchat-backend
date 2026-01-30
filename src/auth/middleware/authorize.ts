/**
 * Authorization Middleware
 * Role-based and permission-based access control
 */

import { Request, Response, NextFunction } from "express";

/**
 * Role-based authorization middleware
 * Checks if user has at least one of the specified roles
 *
 * @param allowedRoles Array of roles that are allowed
 * @returns Middleware function
 *
 * Usage:
 * router.post("/admin/users", authorize(["admin"]), handler)
 * router.get("/reports", authorize(["admin", "analyst"]), handler)
 */
export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }

    // Check if user has any of the allowed roles
    const hasRole = req.user.roles.some((role) =>
      allowedRoles.includes(role)
    );

    if (!hasRole) {
      res.status(403).json({
        error: "Forbidden: Insufficient role permissions",
        required: allowedRoles,
        actual: req.user.roles,
      });
      return;
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 * More granular than role-based (single permission string)
 *
 * @param permission Single permission string to check
 * @returns Middleware function
 *
 * Usage:
 * router.delete("/documents/:id", requirePermission("delete:documents"), handler)
 * router.post("/rag/query", requirePermission("query:rag"), handler)
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }

    // TODO: Fetch user permissions from database or cache
    // For now, assume permissions would be fetched from user service
    // const userPermissions = await userService.getUserWithPermissions(req.user.sub);
    // const hasPermission = userPermissions.permissions.includes(permission);

    // Temporary: allow all for now
    // if (!hasPermission) {
    //   res.status(403).json({
    //     error: "Forbidden: Missing permission",
    //     required: permission,
    //   });
    //   return;
    // }

    next();
  };
};

/**
 * Multiple permission authorization
 * User must have ALL specified permissions
 *
 * @param permissions Array of permissions (user must have all)
 * @returns Middleware function
 */
export const requireAllPermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }

    // TODO: Implement permission check
    // const userPermissions = await userService.getUserWithPermissions(req.user.sub);
    // const hasAll = permissions.every(p => userPermissions.permissions.includes(p));

    next();
  };
};

/**
 * Admin-only authorization
 * Convenience middleware for admin endpoints
 */
export const adminOnly = authorize(["admin"]);
