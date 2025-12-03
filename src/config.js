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
    server: process.env.SQL_CONNECTION_STRING ? null : required("DB_SERVER"),
    name: process.env.SQL_CONNECTION_STRING ? null : required("DB_NAME"),
    user: process.env.SQL_CONNECTION_STRING ? null : required("DB_USER"),
    pass: process.env.SQL_CONNECTION_STRING ? null : required("DB_PASS"),
    encrypt: process.env.DB_ENCRYPT === "true",
  },

  search: {
    endpoint: required("SEARCH_ENDPOINT"),
    index: required("SEARCH_INDEX"),
    key: required("SEARCH_API_KEY"),
  },

  openai: {
    endpoint: required("AZURE_OPENAI_ENDPOINT"),
    key: required("AZURE_OPENAI_KEY"),
    deployment: required("AZURE_OPENAI_DEPLOYMENT"),
  },

  storage: {
    useMI: process.env.AZURE_STORAGE_USE_MI === "true",
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    account: required("AZURE_STORAGE_ACCOUNT"),
    container: required("AZURE_STORAGE_CONTAINER"),
  },
};

console.log("✅ Environment variables loaded successfully");
