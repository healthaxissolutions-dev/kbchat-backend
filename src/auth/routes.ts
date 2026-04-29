import { Router, Request, Response } from "express";
import { entraIdService } from "./services/entraId.service.js";
import { userService } from "./services/user.service.js";
import { jwtService } from "./services/jwt.service.js";
import { nonceService } from "./services/nonce.service.js";
import { authConfig } from "./config.js";
import { authenticate } from "./middleware/authenticate.js";
import { OAuthCallbackRequest, AuthResponse } from "./types.js";

const router = Router();

/**
 * GET /api/auth/nonce
 * Issues a one-time state nonce the frontend must use when starting the OAuth redirect.
 * On callback, the backend validates the nonce to prevent CSRF / authorization-code injection.
 *
 * Flow:
 *  1. Frontend calls GET /api/auth/nonce → receives { state }
 *  2. Frontend appends state to the Entra ID authorization URL
 *  3. Entra ID echoes state back in the redirect
 *  4. Frontend POSTs { code, state } to POST /api/auth/callback
 *  5. Backend consumes (validates + deletes) the nonce before proceeding
 */
router.get("/nonce", (_req: Request, res: Response) => {
  const state = nonceService.generate();
  res.json({ state });
});

/**
 * POST /api/auth/callback
 * Exchanges an authorization code for an application session.
 *
 * Requires a valid state nonce issued by GET /api/auth/nonce.
 */
router.post("/callback", async (req: Request, res: Response) => {
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
      error: error instanceof Error ? error.message : "Authentication failed",
    });
  }
});

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie(authConfig.cookie.name, {
    httpOnly: authConfig.cookie.httpOnly,
    secure: authConfig.cookie.secure,
    sameSite: authConfig.cookie.sameSite,
  });
  res.json({ success: true, message: "Logged out successfully" });
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user. Protected.
 */
router.get("/me", authenticate, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({
    id: req.user.sub,
    email: req.user.email,
    name: req.user.name,
    displayName: req.user.displayName,
    roles: req.user.roles,
  });
});

/**
 * POST /api/auth/refresh
 * Refreshes the session JWT.
 * TODO: Re-issue a signed token with a fresh expiry once user DB is wired up.
 */
router.post("/refresh", authenticate, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ success: true, message: "Token refreshed" });
});

export default router;
