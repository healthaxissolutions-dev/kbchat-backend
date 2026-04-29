import dotenv from "dotenv";
dotenv.config();

function required(name) {
  if (!process.env[name] || process.env[name].trim() === "") {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

export const config = {
  server: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || "development",
  },

  sql: {
    // PRIORITY 1: Full connection string (release, production)
    connectionString: process.env.SQL_CONNECTION_STRING || null,

    // PRIORITY 2: Manual credentials (dev)
    server: process.env.DB_SERVER,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    pass: process.env.DB_PASSWORD,
    encrypt: process.env.DB_ENCRYPT === "true",
    auth: process.env.DB_AUTH, // "sql" | "managed_identity"
  },

  // Legacy Azure Cognitive Search — not used by the active chat route (Supabase/Ollama).
  // Values are optional; keeping the shape so dead code that still references config.search doesn't throw.
  search: {
    endpoint: process.env.SEARCH_ENDPOINT || "",
    index: process.env.SEARCH_INDEX || "",
    key: process.env.SEARCH_API_KEY || "",
  },

  // Legacy Azure OpenAI — not used by the active chat route (Ollama/Gemini).
  openai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
    key: process.env.AZURE_OPENAI_KEY || "",
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "",
  },

  storage: {
    useMI: process.env.AZURE_STORAGE_USE_MI === "true",
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    account: required("AZURE_STORAGE_ACCOUNT"),
    container: required("AZURE_STORAGE_CONTAINER"),
  },
};

console.log("✅ Environment variables loaded successfully");
