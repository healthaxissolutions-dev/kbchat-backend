import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Origin-check CSRF middleware for state-changing routes.
 * Rejects requests whose Origin header doesn't match the configured frontend URL.
 * Requests with no Origin (same-origin, non-browser, or Postman) are allowed through.
 */
export const csrfProtect = (req: Request, res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (origin && origin !== config.server.frontendUrl) {
    res.status(403).json({ error: "Forbidden: Cross-origin request rejected" });
    return;
  }
  next();
};
