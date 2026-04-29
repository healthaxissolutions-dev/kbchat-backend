# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start with tsx watch server.ts (auto-restarts on change)
npm run build      # Compile TypeScript to dist/
npm start          # node dist/server.js (requires build first)
npm run build:watch
```

No test runner is configured — use manual testing via `curl` or Postman.

## Architecture

This is a Node.js + Express backend using ES modules (`"type": "module"`). The codebase is **fully TypeScript**: all source files are `.ts`, compiled to `dist/` via `tsc`. Remaining `.js` files in `src/` are compiled with `allowJs: true` (no type-checking on them). The entry point is `server.ts` at the project root.

### Request flow

```
server.ts
  → /api/auth/*          src/auth/routes.ts          (Azure Entra ID OAuth)
  → /api/chat            src/routes/chatRag.ts        (RAG chat — main feature, public)
  → /api/documents       src/routes/documents.ts      (PDF serving from Blob, public)
  → /api/admin/*         src/routes/admin/            (admin only — authenticate + authorize(["admin"]))
  → /api/test-*          src/routes/test/             (dev only — not registered in production)
```

### RAG chat pipeline (chatRag.ts)

The core feature. For each `POST /api/chat`:
1. Generate a text embedding via **Ollama** (`mxbai-embed-large`)
2. Vector search in **Supabase** (`match_mxbai_chunks` RPC, default top-5 at ≥0.3 similarity)
3. Build a system prompt by appending retrieved chunks to the base instruction (from `src/prompts/systemPrompt.txt`, 5-min cached)
4. Call **Ollama** (default `llama3.2`) or **Gemini** for the answer
5. Supports SSE streaming (`stream: true` in body) — sends `status`, `token`, `done`, and `error` events

Selecting the model: pass `aimodel: "gemini"` or `model: "gemini"` in the request body; anything else defaults to Ollama.

Rate limit: 5 requests per minute per IP (`src/middleware/chatRateLimit.js`).

Note: the `service` field in the request body is logged but not used for filtering — `match_mxbai_chunks` searches all chunks. A filtered RPC variant is needed in Supabase before service-scoped search can be enabled.

### Auth module (src/auth/)

Full Azure Entra ID OAuth 2.0 flow. All files are TypeScript:

- **nonce.service.ts** — generates and validates one-time state nonces for CSRF protection (10-min TTL, in-memory)
- **entraId.service.ts** — exchanges authorization code for tokens, verifies ID token signature against cached Entra ID JWKS (1-hour cache)
- **jwt.service.ts** — issues/verifies a short-lived (1 h) HS256 application JWT; the payload includes both `roles` and `permissions`
- **user.service.ts** — maps Entra ID claims to an internal `AppUser` with RBAC roles; `getPermissionsForRoles` computes permissions from roles (no DB yet — TODO)
- **authenticate.ts** — reads JWT from `app_session` HttpOnly cookie, attaches payload to `req.user`
- **authorize.ts** — role-based (`authorize(["admin"])`) and permission-based (`requirePermission("delete:documents")`) middleware; both enforce using JWT claims
- **user.service.ts** — upserts user to `knowledge.users` on every login via T-SQL `MERGE`; `getUserWithPermissions` reads live roles from DB; `hasPermission` derives from DB roles (not JWT). DB failure does not block login.

OAuth frontend flow (must be followed in order):
1. `GET /api/auth/nonce` → receive `{ state }`
2. Redirect user to Entra ID with `state` in the authorization URL
3. Entra ID echoes `state` back with `code`
4. `POST /api/auth/callback` with `{ code, state }` — nonce consumed, session cookie set

Dev (`tsx watch server.ts`) executes TypeScript directly. Prod runs `dist/server.js` compiled by `tsc` with `rootDir: "."`, so `server.ts` → `dist/server.js` and `src/**` → `dist/src/**`.

### Data layer

- **Azure SQL / MSSQL** (`src/db.ts`) — services, documents metadata, chat logs, users, system prompt (all under `knowledge.*`). Pool is created lazily on first query and auto-resets on error so the next query reconnects. Queries use `?` positional placeholders rewritten to `@p0`, `@p1`, … at call time with count validation.
- **Error responses** — all application routes use `sendError(res, status, message, detail?)` from `src/utils/error.ts`. The `detail` field is included only outside production. Auth routes keep their own `{ success, error }` envelope.

### Required SQL migrations

Run these once per environment before first deploy:

```sql
-- System prompt storage (replaces bundled .txt file)
CREATE TABLE knowledge.system_prompts (
  name         VARCHAR(100)   NOT NULL PRIMARY KEY,
  prompt       NVARCHAR(MAX)  NOT NULL,
  updated_date DATETIME2      NOT NULL DEFAULT SYSDATETIME()
);

-- User persistence and RBAC
CREATE TABLE knowledge.users (
  id           VARCHAR(100)   NOT NULL PRIMARY KEY,
  email        VARCHAR(255)   NOT NULL,
  name         VARCHAR(255),
  display_name VARCHAR(255),
  entra_oid    VARCHAR(100)   NOT NULL,
  entra_upn    VARCHAR(255),
  roles        NVARCHAR(MAX)  NOT NULL DEFAULT '["viewer"]',
  is_active    BIT            NOT NULL DEFAULT 1,
  created_date DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
  last_login   DATETIME2
);
```

If the migrations haven't been run: `system_prompts` falls back to the bundled `src/prompts/systemPrompt.txt`; user login still succeeds (DB failure is logged but not fatal).
- **Supabase** — pgvector store for document chunks; searched via `match_mxbai_chunks` RPC
- **Azure Blob Storage** — PDF source files; all blob access goes through the singleton in `src/utils/blobClient.js`. Use `getBlobByUrl(url)` to resolve a `BlobClient` from any full HTTPS blob URL without re-instantiating the service client.

### Environment variables

Copy `.env.example` to `.env`. Key groupings:
- **Server**: `PORT`, `NODE_ENV`, `BACKEND_URL`, `FRONTEND_URL`
- **Azure Entra ID**: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `OAUTH_REDIRECT_URI`
- **JWT**: `JWT_SECRET`, `JWT_EXPIRES_IN`
- **SQL**: `SQL_CONNECTION_STRING` (preferred in prod) or `DB_SERVER`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`
- **Supabase**: `SUPABASE_URL`, `SUPABASE_KEY`
- **Ollama**: `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL`, `OLLAMA_EMBEDDING_MODEL`
- **Gemini**: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.0-flash`)
- **Azure Storage**: `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_USE_MI`
- **Azure Search / OpenAI**: accepted by `src/config.ts` but optional — not used by the active chat route

`src/config.ts` calls `process.exit(1)` for missing required vars at startup — check its `required()` calls if the server won't start.

### TypeScript compilation

`tsconfig.json` targets `NodeNext` modules, `rootDir: "."`, outputs to `dist/`, strict mode on, `allowJs: true` / `checkJs: false` so remaining `.js` helpers compile without errors. `dist/` is in `.gitignore` — CI runs `npm run build` before packaging.

### Known remaining issues (to address next)

- Service-scoped RAG search not yet implemented — `searchDocuments` searches all chunks; add a filtered Supabase RPC when ready
