import sql from "mssql";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

function getDbConfig(): string | sql.config {
  if (config.sql.auth === "managed_identity") {
    logger.info("Using Azure Managed Identity for SQL");
    return {
      server: config.sql.server!,
      database: config.sql.name,
      options: { encrypt: true },
      authentication: { type: "azure-active-directory-default" } as any,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    };
  }

  if (config.sql.connectionString) {
    logger.info("Using SQL connection string mode");
    return config.sql.connectionString;
  }

  logger.info("Using SQL username/password mode");
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
        logger.error({ err }, "SQL pool fatal error — resetting");
        pool = null;
        connectPromise = null;
      } else {
        logger.warn({ err }, "SQL pool transient error (pool stays up)");
      }
    });
    pool = newPool;
    connectPromise = null;
    logger.info("Connected to SQL database");
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
    logger.error({ err }, "Database query error");
    throw err;
  }
}
