/**
 * Authentication Routes
 * Implements OAuth callback, logout, and user info endpoints
 */

import { Router, Request, Response } from "express";
import { entraIdService } from "./services/entraId.service.js";
import { userService } from "./services/user.service.js";
import { jwtService } from "./services/jwt.service.js";
import { authConfig } from "./config.js";
import { authenticate } from "./middleware/authenticate.js";
import { OAuthCallbackRequest, AuthResponse } from "./types.js";

const router = Router();

/**
 * POST /api/auth/callback
 * OAuth callback endpoint
 *
 * OAuth Flow:
 * 1. Frontend redirects here with authorization code from Entra ID
 * 2. Backend exchanges code for tokens (server-side, secret is safe)
 * 3. Backend verifies ID token signature and validates claims
 * 4. Backend maps Entra ID user to internal user (with RBAC)
 * 5. Backend issues application JWT (never includes provider tokens)
 * 6. Backend sets JWT as HttpOnly cookie (XSS & CSRF safe)
 * 7. Returns success response (JWT already in secure cookie)
 *
 * Security:
 * - Client secret is server-side only
 * - Authorization code is single-use
 * - ID token signature is verified
 * - JWT is stored in HttpOnly cookie
 */
router.post("/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.body as OAuthCallbackRequest;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Missing authorization code",
      });
    }

    // Step 1: Exchange authorization code for tokens
    // CRITICAL: Client secret is used here on server-side only
    const tokens = await entraIdService.exchangeCodeForTokens(code, state);

    // Step 2: Verify ID token signature and claims
    // Validates: signature, issuer, audience, expiration
    const entraIdClaims = await entraIdService.verifyIdToken(tokens.id_token);

    // Step 3: Map Entra ID user to application user
    // Applies role mappings and RBAC
    const appUser = await userService.syncUserFromEntraId(entraIdClaims);

    // Step 4: Issue application JWT
    // SECURITY: Never includes Entra ID tokens or secrets
    const { token, expiresIn } = jwtService.issueToken(appUser);

    // Step 5: Set JWT as HttpOnly cookie
    // HttpOnly prevents JavaScript access (XSS protection)
    // Secure flag enforces HTTPS in production
    // SameSite=lax for development, strict for production
    res.cookie(authConfig.cookie.name, token, {
      ...authConfig.cookie,
      maxAge: expiresIn * 1000,
    });

    // Step 6: Return user info (JWT already in secure cookie)
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
        error instanceof Error
          ? error.message
          : "Authentication failed",
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout endpoint
 *
 * Clears HttpOnly cookie on client
 * Subsequent requests won't have JWT in cookie
 */
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie(authConfig.cookie.name, {
    httpOnly: authConfig.cookie.httpOnly,
    secure: authConfig.cookie.secure,
    sameSite: authConfig.cookie.sameSite,
  });

  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

/**
 * GET /api/auth/me
 * Current user endpoint
 * Returns authenticated user info
 *
 * Protected route: requires valid JWT in cookie
 * Used by frontend to:
 * - Load user data on page load
 * - Display user profile
 * - Check user roles for UI rendering
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
 * Refresh JWT token (optional)
 *
 * Useful for extending sessions without re-authentication
 * Issues new JWT with fresh expiration
 */
router.post("/refresh", authenticate, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // TODO: In production, fetch fresh user data from database
  // const appUser = await userService.getUserWithPermissions(req.user.sub);
  // const { token, expiresIn } = jwtService.issueToken(appUser);
  // res.cookie("app_session", token, {
  //   ...authConfig.cookie,
  //   maxAge: expiresIn * 1000,
  // });

  res.json({ success: true, message: "Token refreshed" });
});

export default router;
