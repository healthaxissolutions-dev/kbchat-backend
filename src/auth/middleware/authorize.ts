import { Request, Response, NextFunction } from "express";
import { userService } from "../services/user.service.js";

/**
 * Role-based authorization middleware — performs a live DB lookup so a role
 * change takes effect immediately without waiting for JWT expiry.
 * Sets req.liveUser for downstream permission checks.
 */
export const authorize = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized: No session" });
        return;
      }
      const user = await userService.getUserWithPermissions(req.user.sub);
      if (!user) {
        res.status(401).json({ error: "Unauthorized: Session invalid or user deactivated" });
        return;
      }
      req.liveUser = user;
      if (!user.roles.some((role) => allowedRoles.includes(role))) {
        res.status(403).json({ error: "Forbidden: Insufficient role" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Permission-based middleware (single permission).
 * Uses req.liveUser if authorize() has already run; falls back to JWT claims.
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }
    const permissions = req.liveUser?.permissions ?? req.user.permissions ?? [];
    if (!permissions.includes(permission)) {
      res.status(403).json({ error: "Forbidden: Missing permission" });
      return;
    }
    next();
  };
};

/**
 * Permission-based middleware (all permissions required).
 * Uses req.liveUser if authorize() has already run; falls back to JWT claims.
 */
export const requireAllPermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }
    const userPermissions = req.liveUser?.permissions ?? req.user.permissions ?? [];
    const missing = permissions.filter((p) => !userPermissions.includes(p));
    if (missing.length > 0) {
      res.status(403).json({ error: "Forbidden: Missing permissions" });
      return;
    }
    next();
  };
};

export const adminOnly = authorize(["admin"]);
