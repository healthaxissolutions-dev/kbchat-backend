# Authentication Module - Azure Entra ID OAuth

Production-grade authentication implementation for Azure Entra ID OAuth with TypeScript.

## Architecture

```
src/auth/
├── types.ts                    # TypeScript interfaces
├── config.ts                   # OAuth & JWT configuration
├── services/
│   ├── entraId.service.ts     # OAuth token exchange & verification
│   ├── jwt.service.ts         # JWT generation & verification
│   └── user.service.ts        # User mapping & RBAC
├── middleware/
│   ├── authenticate.ts        # JWT verification middleware
│   └── authorize.ts           # Role-based authorization
└── routes.ts                  # Auth endpoints
```

## Security Features

### 1. **Client Secret Protection**
- Client secret is **server-side only**
- Never exposed to frontend
- Used only for OAuth token exchange

### 2. **Token Validation**
- ID token signature verified using Entra ID public keys
- Issuer validation (must be Entra ID authority)
- Audience validation (must match client ID)
- Expiration check (iat, exp, nbf)

### 3. **Session Management**
- JWT stored in **HttpOnly cookie** (prevents XSS)
- Secure flag enforces **HTTPS** in production
- SameSite=strict prevents **CSRF** attacks
- Token expiration: 1 hour (hardcoded)

### 4. **Role-Based Access Control (RBAC)**
- Entra ID roles mapped to internal roles
- Granular permissions computed from roles
- Authorization middleware for protected routes

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy and update `.env`:

```bash
# Azure Entra ID
AZURE_AD_CLIENT_ID=<from Azure Portal>
AZURE_AD_CLIENT_SECRET=<from Azure Portal>
AZURE_AD_TENANT_ID=<your tenant ID>
OAUTH_REDIRECT_URI=http://localhost:5001/api/auth/callback

# JWT
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# URLs
BACKEND_URL=http://localhost:5001
FRONTEND_URL=http://localhost:3000
```

### 3. Build TypeScript
```bash
npm run build
npm run build:watch  # Watch mode
```

## API Endpoints

### POST `/api/auth/callback`
OAuth callback endpoint. Frontend redirects here with authorization code.

**Request:**
```json
{
  "code": "authorization_code_from_entra_id",
  "state": "csrf_state_token"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user-oid",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["analyst"]
  }
}
```

**JWT in HttpOnly cookie:** `Set-Cookie: app_session=<jwt>; HttpOnly; Secure; SameSite=Strict`

### GET `/api/auth/me`
Get current authenticated user (protected route).

**Headers:**
```
Cookie: app_session=<jwt>
```

**Response:**
```json
{
  "id": "user-oid",
  "email": "user@example.com",
  "displayName": "John Doe",
  "roles": ["analyst"]
}
```

### POST `/api/auth/logout`
Logout and clear session cookie.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST `/api/auth/refresh`
Refresh JWT token (extend session).

**Headers:**
```
Cookie: app_session=<jwt>
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed"
}
```

## Usage in Routes

### Require Authentication
```typescript
import { authenticate } from "./auth/middleware/authenticate";

router.get("/api/documents", authenticate, (req, res) => {
  const userId = req.user?.sub;
  // User is authenticated
});
```

### Require Specific Roles
```typescript
import { authorize } from "./auth/middleware/authorize";

router.post("/api/admin/users", 
  authenticate,
  authorize(["admin"]), 
  (req, res) => {
    // Only admins can access
  }
);
```

### Require Permission
```typescript
import { requirePermission } from "./auth/middleware/authorize";

router.delete("/api/documents/:id",
  authenticate,
  requirePermission("delete:documents"),
  (req, res) => {
    // User has delete permission
  }
);
```

### Optional Authentication
```typescript
import { optionalAuth } from "./auth/middleware/authenticate";

router.get("/api/public", optionalAuth, (req, res) => {
  if (req.user) {
    // User is authenticated, personalize response
  } else {
    // User is not authenticated, return generic response
  }
});
```

## OAuth Flow

```
┌─────────────────────┐
│   Frontend App      │
│ (React/Vue/Angular) │
└──────────┬──────────┘
           │ 1. Redirect to Entra ID
           │ /authorize?code=...&state=...
           ▼
┌─────────────────────────────────────┐
│    Azure Entra ID                   │
│    (Microsoft Identity Platform)    │
└──────────┬──────────────────────────┘
           │ 2. User authenticates
           │ Returns authorization_code
           ▼
┌─────────────────────┐
│   Frontend App      │
│  Redirect to        │
│  /auth/callback?    │
│    code=...&state=..│
└──────────┬──────────┘
           │ 3. POST /api/auth/callback
           │ {code, state}
           ▼
┌─────────────────────────────────────┐
│   Backend (This Service)            │
│                                     │
│ 1. Exchange code for tokens         │
│    (with client_secret)             │
│ 2. Verify ID token signature        │
│ 3. Sync user to database            │
│ 4. Issue application JWT            │
│ 5. Set HttpOnly cookie              │
└──────────┬──────────────────────────┘
           │ 4. Return user + Set-Cookie
           ▼
┌─────────────────────┐
│   Frontend App      │
│   With session      │
│   cookie            │
└─────────────────────┘
```

## Role Mapping

Configure in `src/auth/config.ts`:

```typescript
roleMapping: {
  "Entra.AdminGroup": "admin",           // Entra ID group → internal role
  "Entra.AnalystGroup": "analyst",
  "Entra.ViewerGroup": "viewer",
}
```

Update based on your Entra ID security groups.

## Permissions

Define in `src/auth/services/user.service.ts`:

```typescript
const permissionMap: Record<string, string[]> = {
  admin: [
    "read:documents",
    "write:documents",
    "delete:documents",
    "manage:users",
    "manage:rag",
  ],
  analyst: [
    "read:documents",
    "write:documents",
    "query:rag",
  ],
  viewer: [
    "read:documents",
    "query:rag",
  ],
};
```

## Database Integration (TODO)

Implement in `src/auth/services/user.service.ts`:

```typescript
async syncUserFromEntraId(entraIdClaims: EntraIdTokenPayload): Promise<AppUser> {
  // 1. Query database for user (by OID)
  const existingUser = await db.users.findByOid(entraIdClaims.oid);

  // 2. Create or update user
  if (existingUser) {
    await db.users.update(existingUser.id, {
      lastLogin: new Date(),
      // ...
    });
  } else {
    await db.users.create({
      oid: entraIdClaims.oid,
      email: entraIdClaims.email,
      // ...
    });
  }

  // 3. Fetch user roles and permissions
  const user = await db.users.findWithPermissions(entraIdClaims.oid);
  
  return user;
}
```

## Testing

### Get Authorization Code
1. Visit Azure Entra ID login endpoint
2. Authorize the app
3. You'll be redirected with `?code=...&state=...`

### Test Callback
```bash
curl -X POST http://localhost:5001/api/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"code":"auth_code","state":"state_value"}'
```

### Test Protected Route
```bash
curl http://localhost:5001/api/auth/me \
  -H "Cookie: app_session=<jwt_token>"
```

## Troubleshooting

### Token Verification Fails
- Check JWT_SECRET matches between issue and verify
- Verify token hasn't expired
- Check issuer and audience configuration

### ID Token Validation Fails
- Verify Entra ID tenant ID is correct
- Check client ID matches Entra ID registration
- Ensure ID token hasn't expired
- Verify public key is fetched correctly

### Cookie Not Set
- Check if `secure` flag is false in development
- Ensure response is setting `Set-Cookie` header
- Check SameSite policy

## Future Enhancements

1. **Refresh Token Rotation**
   - Store refresh tokens in database
   - Rotate on each refresh
   - Detect token reuse (security)

2. **Multi-Factor Authentication**
   - Enforce MFA for admin roles
   - Integration with Entra ID MFA

3. **Session Management**
   - Track active sessions
   - Revoke sessions (logout all devices)
   - Activity logging

4. **RBAC Enhancements**
   - Dynamic role assignment
   - Role inheritance
   - Time-based access (e.g., temporary permissions)

5. **Audit Logging**
   - Log all auth events
   - Track permission changes
   - Compliance reporting

## Security Checklist

- ✅ Client secret server-side only
- ✅ ID token signature verified
- ✅ JWT in HttpOnly cookie
- ✅ CSRF protection (SameSite)
- ✅ Token expiration enforced
- ✅ RBAC implemented
- ✅ Role mapping configured
- ✅ Permissions computed
- ✅ Error messages sanitized
- ✅ No sensitive data in logs

---

**Questions?** Refer to implementation in `src/auth/` or Azure Entra ID docs.
