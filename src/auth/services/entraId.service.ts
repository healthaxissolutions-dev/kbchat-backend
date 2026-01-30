/**
 * Entra ID Service
 * Handles OAuth token exchange and ID token verification
 *
 * SECURITY CRITICAL:
 * - Client secret is server-side only
 * - ID token signature is verified before use
 * - Token issuer and audience are validated
 */

import axios from "axios";
import jwt from "jsonwebtoken";
import { authConfig } from "../config.js";
import {
  EntraIdTokenResponse,
  EntraIdTokenPayload,
} from "../types.js";

export class EntraIdService {
  /**
   * Exchange authorization code for tokens
   * CRITICAL: This is SERVER-SIDE ONLY
   * Client secret is never exposed to frontend
   *
   * @param code Authorization code from Entra ID
   * @param state CSRF state for validation
   * @returns Token response with access_token, id_token, refresh_token
   */
  async exchangeCodeForTokens(
    code: string,
    state: string
  ): Promise<EntraIdTokenResponse> {
    try {
      const response = await axios.post(
        `${authConfig.entraId.authority}/oauth2/v2.0/token`,
        {
          client_id: authConfig.entraId.clientId,
          client_secret: authConfig.entraId.clientSecret, // Server-side secret
          code,
          redirect_uri: authConfig.entraId.redirectUri,
          grant_type: "authorization_code",
          scope: authConfig.entraId.scopes.join(" "),
        },
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      return response.data as EntraIdTokenResponse;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Token exchange failed:", error.response?.data);
        throw new Error(
          `Failed to exchange code for tokens: ${error.response?.data?.error_description || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Verify and decode ID token from Entra ID
   * Validates:
   * - Token signature using Entra ID public keys
   * - Issuer (must be Entra ID authority)
   * - Audience (must match client ID)
   * - Expiration (iat, exp, nbf)
   *
   * @param idToken JWT from Entra ID
   * @returns Verified token payload with user claims
   */
  async verifyIdToken(idToken: string): Promise<EntraIdTokenPayload> {
    try {
      // Decode WITHOUT verification first to inspect header
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || typeof decoded === "string") {
        throw new Error("Invalid token format");
      }

      // Fetch Entra ID public keys for signature verification
      const jwks = await axios.get(
        `${authConfig.entraId.authority}/discovery/v2.0/keys`
      );

      // Find the key matching the token's key ID
      const keyId = decoded.header.kid;
      const key = jwks.data.keys.find((k: any) => k.kid === keyId);
      if (!key) {
        throw new Error(`Token key not found: ${keyId}`);
      }

      // Convert JWK to PEM format for verification
      // In production, use jsonwebtoken's x5c directly
      const publicKey = `-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`;

      // Verify signature and claims
      const verified = jwt.verify(idToken, publicKey, {
        algorithms: ["RS256"],
        issuer: `${authConfig.entraId.authority}/v2.0`,
        audience: authConfig.entraId.clientId,
      }) as EntraIdTokenPayload;

      return verified;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.error("JWT verification failed:", error.message);
        throw new Error(`ID token validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get additional user info from Microsoft Graph
   * Optional: for fetching user profile picture, manager, etc.
   *
   * @param accessToken Token for Graph API
   * @returns User profile from Microsoft Graph
   */
  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Failed to fetch user info:", error.response?.data);
      }
      throw error;
    }
  }
}

export const entraIdService = new EntraIdService();
