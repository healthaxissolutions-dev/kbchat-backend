# KBChat Backend

A Node.js + Express backend that integrates:
- Microsoft SQL Server (Azure SQL)
- Azure Cognitive Search
- Azure OpenAI (GPT-4.1-mini deployment)
- Azure Blob Storage

Provides chat functionality, embedding/vector search, service management, and document ingestion.

---

## 🚀 Features

- RESTful API (Express)
- MSSQL connection pooling
- Secure environment configuration
- Azure Cognitive Search hybrid search
- Azure OpenAI Chat completion
- File upload + blob storage upload (in development)
- Modular route structure

**Upcoming**
- Add admin auth middleware
- Frontend implementation (users - chat, admin - documents/services management)

---

## 📂 Project Structure
```
project/
│
├── server.js
│
├── src/
│ ├── db.js
│ ├── config.js
│ │
│ ├── routes/
│ │ ├── chat.js
│ │ ├── services.js
│ │ ├── upload.js
│ │ │
│ │ └── test/
│ │  ├── testDB.js
│ │  └── testBackend.js
│ │
│ └── utils/
│   ├── blobClient.js
│   └── validateEnv.js
│
├── uploads/ # Temp upload folder
└── .env
```

---

## ⚙️ Environment Variables

Create a `.env`:

```dotenv
PORT=5000
NODE_ENV=development

# SQL
DB_SERVER=
DB_NAME=
DB_USER=
DB_PASS=
DB_ENCRYPT=true

# If using connection string (prod)
DB_CONNECTION_STRING=""

# Azure Cognitive Search
SEARCH_ENDPOINT=
SEARCH_INDEX=
SEARCH_API_KEY=

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_KEY=
AZURE_OPENAI_DEPLOYMENT=

# Storage
AZURE_STORAGE_ACCOUNT=
AZURE_STORAGE_CONTAINER=
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_USE_MI=false
```
---

## 🛠 Installation

```bash
npm install
```
---

## ▶️ Run the Server

```bash
npm start
```
For development with auto-restart:
```bash
npm run dev
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
| `POST` | `/api/auth/callback` | Exchange authorization code for session cookie |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET` | `/api/auth/me` | Get current user (requires session) |

### Chat

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | RAG chat (Ollama or Gemini, optional SSE streaming) |

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

### POST `/api/upload` (in development)

Upload a PDF → stored to Azure Blob Storage.

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

## 📄 PDF Extraction Logic

- PDF is downloaded from Azure Blob Storage
- Pages can be optionally skipped via page_to_skip
- Extracted text is sent to Azure OpenAI for grounded Q&A

---

## 🤖 Chat Completion (Azure OpenAI)

Uses:

```json
client.chat.completions.create({
  model: config.openai.deployment,
  messages: [...]
})
```
> Response is logged into chat_logs.

---

## 💡 Development Notes

- SQL pool is reused across all modules
- Blob access supports both connection string and Managed Identity
- Use Postman or PowerShell `Invoke-RestMethod` to test `/api/chat`

---

## 🔒 Security

- Do **not** commit `.env`
- Use Managed Identity in production
- Restrict SQL firewall rules
- Rotate all Azure access keys periodically

---

## 🐞 Troubleshooting

### 401 from `/api/chat` but `/api/test-db` works

Usually caused by unquoted `.env` values or invalid Azure OpenAI endpoint format.

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
