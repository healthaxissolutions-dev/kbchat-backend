import { Request, Response, NextFunction } from "express";

/**
 * Role-based authorization middleware.
 * Usage: router.post("/admin/users", authorize(["admin"]), handler)
 */
export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: "Forbidden: Insufficient role permissions",
        required: allowedRoles,
      });
      return;
    }

    next();
  };
};

/**
 * Permission-based authorization middleware (single permission).
 * Permissions are embedded in the JWT at login time from the role→permission map.
 * Usage: router.delete("/documents/:id", requirePermission("delete:documents"), handler)
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }

    const userPermissions = req.user.permissions ?? [];
    if (!userPermissions.includes(permission)) {
      res.status(403).json({
        error: "Forbidden: Missing permission",
        required: permission,
      });
      return;
    }

    next();
  };
};

/**
 * Permission-based authorization middleware (all permissions required).
 * Usage: router.post("/sensitive", requireAllPermissions(["write:documents", "manage:rag"]), handler)
 */
export const requireAllPermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }

    const userPermissions = req.user.permissions ?? [];
    const missing = permissions.filter((p) => !userPermissions.includes(p));
    if (missing.length > 0) {
      res.status(403).json({
        error: "Forbidden: Missing permissions",
        required: permissions,
      });
      return;
    }

    next();
  };
};

export const adminOnly = authorize(["admin"]);
