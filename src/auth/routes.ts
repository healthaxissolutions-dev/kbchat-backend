import { Router, Request, Response } from "express";
import { entraIdService } from "./services/entraId.service.js";
import { userService } from "./services/user.service.js";
import { jwtService } from "./services/jwt.service.js";
import { nonceService } from "./services/nonce.service.js";
import { authConfig } from "./config.js";
import { authenticate } from "./middleware/authenticate.js";
import { authRateLimit } from "../middleware/rateLimits.js";
import { OAuthCallbackRequest, AuthResponse } from "./types.js";

const router = Router();

/**
 * GET /api/auth/nonce
 * Issues a one-time state nonce the frontend must use when starting the OAuth redirect.
 */
router.get("/nonce", (_req: Request, res: Response) => {
  const state = nonceService.generate();
  res.json({ state });
});

/**
 * POST /api/auth/callback
 * Exchanges an authorization code for an application session.
 */
router.post("/callback", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { code, state } = req.body as OAuthCallbackRequest;

    if (!code) {
      return res.status(400).json({ success: false, error: "Missing authorization code" });
    }

    if (!state || !nonceService.consume(state)) {
      return res.status(400).json({ success: false, error: "Invalid or expired state parameter" });
    }

    const tokens = await entraIdService.exchangeCodeForTokens(code, state);
    const entraIdClaims = await entraIdService.verifyIdToken(tokens.id_token);
    const appUser = await userService.syncUserFromEntraId(entraIdClaims);
    const { token, expiresIn } = jwtService.issueToken(appUser);

    res.cookie(authConfig.cookie.name, token, {
      ...authConfig.cookie,
      maxAge: expiresIn * 1000,
    });

    const response: AuthResponse = {
      success: true,
      user: {
        id: appUser.id,
        email: appUser.email,
        name: appUser.name,
        displayName: appUser.displayName,
        roles: appUser.roles,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV !== "production" && error instanceof Error
          ? error.message
          : "Authentication failed",
    });
  }
});

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(authConfig.cookie.name, {
    httpOnly: authConfig.cookie.httpOnly,
    secure: authConfig.cookie.secure,
    sameSite: authConfig.cookie.sameSite,
  });
  res.json({ success: true, message: "Logged out successfully" });
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user, verified live against the DB.
 * Rejects if the user has been deactivated since the JWT was issued.
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const user = await userService.getUserWithPermissions(req.user!.sub);
  if (!user) {
    return res.status(401).json({ success: false, error: "Session invalid or user deactivated" });
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    displayName: user.displayName,
    roles: user.roles,
  });
});

/**
 * POST /api/auth/refresh
 * Re-issues a fresh session JWT from live DB state.
 * Rejects if the user has been deactivated since the original token was issued.
 */
router.post("/refresh", authenticate, async (req: Request, res: Response) => {
  const user = await userService.getUserWithPermissions(req.user!.sub);
  if (!user) {
    return res.status(401).json({ success: false, error: "Session invalid or user deactivated" });
  }
  const { token, expiresIn } = jwtService.issueToken(user);
  res.cookie(authConfig.cookie.name, token, {
    ...authConfig.cookie,
    maxAge: expiresIn * 1000,
  });
  res.json({ success: true });
});

export default router;
