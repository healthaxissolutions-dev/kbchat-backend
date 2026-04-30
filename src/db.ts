import sql from "mssql";
import { config } from "./config.js";

function getDbConfig(): string | sql.config {
  if (config.sql.auth === "managed_identity") {
    console.log("🟩 Using Azure Managed Identity for SQL");
    return {
      server: config.sql.server!,
      database: config.sql.name,
      options: { encrypt: true },
      authentication: { type: "azure-active-directory-default" } as any,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    };
  }

  if (config.sql.connectionString) {
    console.log("🟦 Using SQL connection string mode");
    return config.sql.connectionString;
  }

  console.log("🟨 Using SQL username/password mode");
  return {
    user: config.sql.user,
    password: config.sql.pass,
    server: config.sql.server!,
    database: config.sql.name,
    options: {
      encrypt: config.sql.encrypt,
      trustServerCertificate: config.server.env === "development",
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

let pool: sql.ConnectionPool | null = null;
let connectPromise: Promise<sql.ConnectionPool> | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const newPool = await sql.connect(getDbConfig());
    newPool.on("error", (err: Error) => {
      if (err instanceof sql.ConnectionError) {
        console.error("❌ SQL pool fatal error — resetting:", err.message);
        pool = null;
        connectPromise = null;
      } else {
        console.warn("⚠️ SQL pool transient error (pool stays up):", err.message);
      }
    });
    pool = newPool;
    connectPromise = null;
    console.log("✔ Connected to SQL database");
    return pool;
  })();

  return connectPromise;
}

export async function queryDb(
  query: string,
  params: unknown[] = []
): Promise<sql.IResult<Record<string, any>>> {
  const placeholders = (query.match(/\?/g) || []).length;
  if (placeholders !== params.length) {
    throw new Error(
      `SQL query has ${placeholders} placeholder(s) but ${params.length} param(s) were provided`
    );
  }

  let i = 0;
  const sqlQuery = query.replace(/\?/g, () => `@p${i++}`);

  const p = await getPool();
  const request = p.request();
  params.forEach((value, index) => request.input(`p${index}`, value as any));

  try {
    return await request.query(sqlQuery);
  } catch (err) {
    console.error("❌ Database query error:", err);
    throw err;
  }
}
