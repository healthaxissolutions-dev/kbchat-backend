/**
 * OAuth & Session Types
 * Defines interfaces for Azure Entra ID OAuth flow
 */

/**
 * Azure Entra ID token response
 * Received from token endpoint after code exchange
 */
export interface EntraIdTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  ext_expires_in?: number;
  id_token: string; // JWT containing user claims
  refresh_token?: string;
  scope?: string;
}

/**
 * Decoded ID token claims from Entra ID
 * Verified and validated before use
 */
export interface EntraIdTokenPayload {
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  email?: string;
  upn?: string; // User Principal Name
  name?: string;
  given_name?: string; // First name
  family_name?: string; // Last name
  oid: string; // Object ID (unique user identifier in Entra ID)
  tid?: string; // Tenant ID
  // Custom claims from Entra ID
  roles?: string[];
}

/**
 * Application user, mapped from Entra ID
 * Used internally for all business logic
 */
export interface AppUser {
  id: string; // Internal user ID (mapped from Entra ID OID)
  email: string;
  name: string;
  displayName: string;
  entraId: {
    oid: string; // Entra ID Object ID
    upn: string; // User Principal Name
  };
  roles: string[]; // Internal roles (e.g., "admin", "analyst", "viewer")
  permissions: string[]; // Granular permissions from RBAC
  lastLogin: Date;
  isActive: boolean;
}

/**
 * JWT payload for application session
 * Issued by backend, verified on subsequent requests
 * NEVER includes sensitive data or provider tokens
 */
export interface AppSessionJWT {
  sub: string; // Subject: internal user ID
  email: string;
  name: string;
  displayName: string;
  roles: string[]; // Essential roles only
  iat: number; // Issued at
  exp: number; // Expiration
  iss: string; // Issuer (backend URL)
  aud: string; // Audience (frontend domain)
}

/**
 * OAuth callback request from frontend
 */
export interface OAuthCallbackRequest {
  code: string; // Authorization code from Entra ID
  state: string; // CSRF protection
  session_state?: string; // Optional, for SSO
}

/**
 * JWT response to frontend
 * HttpOnly cookie + optional response body
 */
export interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    displayName: string;
    roles: string[];
  };
  error?: string;
}
