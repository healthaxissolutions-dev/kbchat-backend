import { Router, Request, Response } from "express";
import { z } from "zod";
import { entraIdService } from "./services/entraId.service.js";
import { userService } from "./services/user.service.js";
import { jwtService } from "./services/jwt.service.js";
import { nonceService } from "./services/nonce.service.js";
import { authConfig } from "./config.js";
import { authenticate } from "./middleware/authenticate.js";
import { authRateLimit } from "../middleware/rateLimits.js";
import { sendError } from "../utils/error.js";
import { validateBody } from "../utils/validate.js";
import { logger } from "../utils/logger.js";
import { AuthResponse } from "./types.js";

const router = Router();

const CallbackSchema = z.object({
  code: z.string().min(1, "Missing authorization code"),
  state: z.string().min(1, "Missing state parameter"),
});

router.get("/nonce", (_req: Request, res: Response) => {
  const state = nonceService.generate();
  res.json({ state });
});

router.post("/callback", authRateLimit, async (req: Request, res: Response) => {
  try {
    const data = validateBody(CallbackSchema, req, res);
    if (!data) return;

    if (!nonceService.consume(data.state)) {
      return sendError(res, 400, "Invalid or expired state parameter");
    }

    const tokens = await entraIdService.exchangeCodeForTokens(data.code, data.state);
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
    logger.error({ err: error }, "OAuth callback error");
    sendError(res, 500, "Authentication failed", (error as Error).message);
  }
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(authConfig.cookie.name, {
    httpOnly: authConfig.cookie.httpOnly,
    secure: authConfig.cookie.secure,
    sameSite: authConfig.cookie.sameSite,
  });
  res.json({ success: true, message: "Logged out successfully" });
});

router.get("/me", authenticate, async (req: Request, res: Response) => {
  const user = await userService.getUserWithPermissions(req.user!.sub);
  if (!user) {
    return sendError(res, 401, "Session invalid or user deactivated");
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    displayName: user.displayName,
    roles: user.roles,
  });
});

router.post("/refresh", authenticate, async (req: Request, res: Response) => {
  const user = await userService.getUserWithPermissions(req.user!.sub);
  if (!user) {
    return sendError(res, 401, "Session invalid or user deactivated");
  }
  const { token, expiresIn } = jwtService.issueToken(user);
  res.cookie(authConfig.cookie.name, token, {
    ...authConfig.cookie,
    maxAge: expiresIn * 1000,
  });
  res.json({ success: true });
});

export default router;
