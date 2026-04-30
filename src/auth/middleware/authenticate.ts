import { Request, Response, NextFunction } from "express";
import { jwtService } from "../services/jwt.service.js";
import { AppSessionJWT, AppUser } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AppSessionJWT;
      liveUser?: AppUser;
    }
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.cookies.app_session;
    if (!token) {
      res.status(401).json({ error: "Unauthorized: No session" });
      return;
    }
    req.user = jwtService.verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized: Invalid session" });
  }
};

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
