/**
 * Authentication Middleware
 * Extracts and validates JWT from HttpOnly cookie
 * Attaches user claims to req.user for downstream use
 */

import { Request, Response, NextFunction } from "express";
import { jwtService } from "../services/jwt.service.js";
import { AppSessionJWT } from "../types.js";

/**
 * Extend Express Request to include user
 */
declare global {
  namespace Express {
    interface Request {
      user?: AppSessionJWT;
    }
  }
}

/**
 * Authenticate middleware - REQUIRED authentication
 * Returns 401 if no valid session
 * Usage: app.use("/api/protected", authenticate)
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Extract JWT from HttpOnly cookie
    const token = req.cookies.app_session;
    if (!token) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }

    // Verify and decode token
    const payload = jwtService.verifyToken(token);
    req.user = payload;

    next();
  } catch (error) {
    res.status(401).json({ error: "Unauthorized: Invalid session" });
  }
};

/**
 * Optional auth middleware - OPTIONAL authentication
 * Attaches user if available, doesn't reject if missing
 * Usage: app.use("/api/public", optionalAuth)
 */
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.cookies.app_session;
    if (token) {
      req.user = jwtService.verifyToken(token);
    }
  } catch {
    // Continue without user
  }
  next();
};
