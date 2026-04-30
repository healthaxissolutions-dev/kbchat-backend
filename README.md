# KBChat Backend

A Node.js + Express backend that integrates:
- Microsoft SQL Server (Azure SQL)
- Supabase pgvector for RAG document retrieval
- Ollama (local) and Google Gemini for LLM inference
- Azure Entra ID for OAuth 2.0 authentication
- Azure Blob Storage for PDF source files

Provides RAG chat, document management, service management, and JWT-based authentication.

---

## 🚀 Features

- RESTful API (Express) with SSE streaming for chat
- Azure Entra ID OAuth 2.0 with CSRF-protected callback, HttpOnly JWT cookie, live deactivation check on `/me` and `/refresh`
- RAG pipeline: Ollama embeddings → Supabase vector search → Ollama or Gemini generation
- MSSQL connection pooling for services and document metadata
- Admin API for services, documents, and system prompt management (admin role required)
- Azure Blob Storage for PDFs (connection string in dev, Managed Identity in prod); LRU byte-capped in-memory cache with direct blob streaming on miss
- Security: `helmet`, per-route rate limiting (chat / auth callback / admin), request body size cap

---

## 📂 Project Structure
```
project/
│
├── server.ts               # Entry point; wires routes and middleware
│
├── src/
│   ├── db.ts               # MSSQL connection pool and query helper
│   ├── config.ts           # Environment variable loading
│   │
│   ├── auth/               # Azure Entra ID OAuth module (TypeScript)
│   │   ├── routes.ts
│   │   ├── config.ts
│   │   ├── types.ts
│   │   ├── middleware/     # authenticate.ts, authorize.ts
│   │   └── services/       # entraId, jwt, user, nonce services
│   │
│   ├── routes/
│   │   ├── chatRag.ts      # RAG chat (main feature)
│   │   ├── documents.ts    # PDF serving from Blob Storage
│   │   └── admin/          # Services, documents, system prompt CRUD
│   │
│   ├── services/
│   │   ├── ollama.ts       # Embeddings + chat via local Ollama
│   │   ├── gemini.ts       # Chat via Google Gemini
│   │   ├── supabase.ts     # pgvector similarity search
│   │   └── systemPrompt.ts # System prompt loading (SQL-backed, cached)
│   │
│   ├── prompts/
│   │   └── systemPrompt.txt
│   │
│   ├── middleware/
│   │   ├── chatRateLimit.ts
│   │   └── rateLimits.ts       # authRateLimit, adminRateLimit
│   │
│   └── utils/
│       ├── blobClient.ts
│       ├── error.ts
│       └── validateEnv.ts
│
└── .env
```

---

## ⚙️ Environment Variables

Create a `.env`:

See `.env.example` for the full list. Minimum required for local development:

```dotenv
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:4000

# Azure Entra ID (OAuth)
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# JWT
JWT_SECRET=

# SQL Server
DB_SERVER=
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_ENCRYPT=true

# Supabase (pgvector)
SUPABASE_URL=
SUPABASE_KEY=

# Ollama (runs locally — no key needed)
OLLAMA_BASE_URL=http://localhost:11434

# Azure Storage
AZURE_STORAGE_ACCOUNT=
AZURE_STORAGE_CONTAINER=
AZURE_STORAGE_CONNECTION_STRING=
```

See `.env.example` for the full list including optional RAG and PDF cache tuning vars.
---

## 🛠 Installation

```bash
npm install
```
---

## ▶️ Run the Server

```bash
npm run build   # Compile TypeScript to dist/
npm start       # node dist/server.js
```
For development with auto-restart:
```bash
npm run dev     # tsx watch server.ts (no build needed)
```
---

## 🔐 OAuth Flow

The frontend must follow this sequence to authenticate:

1. `GET /api/auth/nonce` → receive `{ state }`
2. Redirect user to Entra ID with `state` appended to the authorization URL
3. Entra ID redirects back to the frontend with `code` and `state`
4. `POST /api/auth/callback` with `{ code, state }` → session cookie is set
5. All subsequent requests include the cookie automatically

The `state` nonce is one-time-use and expires after 10 minutes. An invalid or missing state returns `400`.

---

## 🧪 API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/nonce` | Get a one-time state nonce before starting OAuth |
| `POST` | `/api/auth/callback` | Exchange authorization code for session cookie (rate-limited: 10 req / 15 min) |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET` | `/api/auth/me` | Get current user; 401 if deactivated (requires session) |
| `POST` | `/api/auth/refresh` | Re-issue JWT; 401 if deactivated (requires session) |

### Chat

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | RAG chat — requires auth (rate-limited: 5 req / min per IP) |

### Admin (requires `admin` role)

| Method | Endpoint | Description |
|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/admin/services` | Manage services |
| `GET/POST/PUT/DELETE` | `/api/admin/documents` | Manage document mappings |
| `GET/PUT` | `/api/admin/system-prompt` | Read/update the system prompt |

### Test (development only — not available in production)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/test-db` | Test SQL connectivity |
| `GET` | `/api/test-backend` | Basic health check |

---

## 🧱 SQL Schema (Expected Tables)

`services`

```sql
service_id (int)
service_name (varchar)
submodules (nvarchar(max))
```
`service_documents`

```sql
id (int)
service_id (int)
service_submodule (varchar)
blob_directory (varchar)
page_from_inclusive (int)
page_to_inclusive (int)
page_to_skip (nvarchar(max))
deleted_date (datetime, nullable)
```
`chat_logs`

```sql
id (int)
username (varchar)
service_id (int)
submodule (varchar)
question (nvarchar(max))
answer (nvarchar(max))
created_date (datetime)
```
---

## 🤖 Chat Pipeline

1. Ollama generates an embedding for the user's question (`mxbai-embed-large`)
2. Supabase pgvector similarity search returns the top-K relevant document chunks (default: top 5, threshold 0.3 — tunable via `RAG_MATCH_COUNT` / `RAG_MATCH_THRESHOLD`)
3. Chunks are appended to the base system prompt (DB-backed, 5-min cached; falls back to `src/prompts/systemPrompt.txt`)
4. Ollama (`llama3.2` by default) or Gemini generates the answer

Pass `"aimodel": "gemini"` in the request body to use Gemini instead of Ollama. Pass `"stream": true` for SSE token streaming (`status`, `token`, `done`, `error` events).

---

## 💡 Development Notes

- SQL pool is reused across all modules; only fatal `ConnectionError` causes a pool reset — transient errors are logged and the pool stays up
- Blob access supports both connection string (dev) and Managed Identity (prod)
- PDF cache is LRU, byte-capped (200 MB total / 50 MB per entry by default), and streams directly to the client on miss
- Use Postman or PowerShell `Invoke-RestMethod` to test `/api/chat`

---

## 🔒 Security

- Do **not** commit `.env`
- Use Managed Identity in production
- Restrict SQL firewall rules
- Rotate all Azure access keys periodically

---

## 🐞 Troubleshooting

### Chat returns no results

Check that Ollama is running (`http://localhost:11434`) and the `mxbai-embed-large` and `llama3.2` models are pulled (`ollama pull mxbai-embed-large && ollama pull llama3.2`).

### PDF contains no text

Some PDFs store text as images → OCR module may be needed.

### Blob URL invalid

`blob_directory` must be a **full HTTPS URL**, e.g.:

```json
https://<account>.blob.core.windows.net/documents/manual.pdf
```
---

## 📜 License
This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.
