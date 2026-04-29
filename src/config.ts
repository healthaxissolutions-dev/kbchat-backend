import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export const config = {
  server: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || "development",
  },
  sql: {
    connectionString: process.env.SQL_CONNECTION_STRING || null,
    server: process.env.DB_SERVER,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    pass: process.env.DB_PASSWORD,
    encrypt: process.env.DB_ENCRYPT === "true",
    auth: process.env.DB_AUTH, // "sql" | "managed_identity"
  },
  // Legacy Azure services — not used by the active chat route (Supabase/Ollama/Gemini).
  search: {
    endpoint: process.env.SEARCH_ENDPOINT || "",
    index: process.env.SEARCH_INDEX || "",
    key: process.env.SEARCH_API_KEY || "",
  },
  openai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
    key: process.env.AZURE_OPENAI_KEY || "",
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "",
  },
  storage: {
    useMI: process.env.AZURE_STORAGE_USE_MI === "true",
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || null,
    account: required("AZURE_STORAGE_ACCOUNT"),
    container: required("AZURE_STORAGE_CONTAINER"),
  },
};

console.log("✅ Environment variables loaded successfully");
