/**
 * OAuth Configuration
 * Entra ID and JWT settings loaded from environment
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue?: string): string {
  return process.env[name] || defaultValue || "";
}

export const authConfig = {
  // Development mode flag
  isDevelopment: process.env.NODE_ENV !== "production",
  
  // Azure Entra ID OAuth
  entraId: {
    clientId: requireEnv("AZURE_AD_CLIENT_ID"),
    clientSecret: requireEnv("AZURE_AD_CLIENT_SECRET"), // Server-side only!
    tenantId: requireEnv("AZURE_AD_TENANT_ID"),
    authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
    redirectUri: requireEnv("OAUTH_REDIRECT_URI"),
    scopes: ["openid", "profile", "email"],
  },


  // Session cookie
  cookie: {
    name: "app_session",
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    sameSite: (process.env.NODE_ENV === "production" ? "strict" : "lax") as "strict" | "lax", // Lax for local dev
    maxAge: 1000 * 60 * 60, // 1 hour
  },

  // JWT configuration
  jwt: {
    secret: requireEnv("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
    issuer: process.env.BACKEND_URL || "http://localhost:4000",
    audience: process.env.FRONTEND_URL || "http://localhost:3000",
  },

  // RBAC mappings (map Entra ID roles to internal roles)
  roleMapping: {
    "admin": "admin",
    "viewer": "viewer",
  } as Record<string, string>,
};
