/**
 * JWT Service
 * Issues and verifies application JWT tokens
 *
 * SECURITY CRITICAL:
 * - Never include Entra ID tokens in application JWT
 * - Only include essential claims for authorization
 * - Use HS256 with strong secret (or RS256 for public key signing)
 */

import jwt from "jsonwebtoken";
import { AppSessionJWT, AppUser } from "../types.js";
import { authConfig } from "../config.js";

export class JwtService {
  /**
   * Issue application JWT
   * SECURITY: Never include Entra ID tokens in JWT
   * Only include claims needed for authorization
   *
   * @param user Application user with roles and permissions
   * @returns Signed JWT token and expiration time
   */
  issueToken(user: AppUser): {
    token: string;
    expiresIn: number;
  } {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 60 * 60; // 1 hour (hardcoded for security)

    const payload: AppSessionJWT = {
      sub: user.id, // Subject: internal user ID
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      roles: user.roles, // Essential roles for authorization
      iat: now,
      exp: now + expiresIn,
      iss: authConfig.jwt.issuer,
      aud: authConfig.jwt.audience,
    };

    const token = jwt.sign(payload, authConfig.jwt.secret, {
      algorithm: "HS256",
    });

    return { token, expiresIn };
  }

  /**
   * Verify application JWT
   * Used by middleware on protected routes
   * Validates issuer and audience for security
   *
   * @param token JWT from request cookie
   * @returns Verified token payload
   */
  verifyToken(token: string): AppSessionJWT {
    try {
      const decoded = jwt.verify(token, authConfig.jwt.secret, {
        algorithms: ["HS256"],
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
      }) as AppSessionJWT;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(`Token verification failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Refresh token (optional)
   * Implement separate refresh_token for long-lived sessions
   * Refresh tokens are typically longer-lived (7 days) and stored securely
   *
   * @param userId User ID to refresh
   * @returns Refresh token
   */
  issueRefreshToken(userId: string): string {
    const payload = { sub: userId, type: "refresh" };
    return jwt.sign(
      payload,
      authConfig.jwt.secret,
      { expiresIn: authConfig.jwt.refreshExpiresIn } as any
    );
  }
}

export const jwtService = new JwtService();
