import sql from "mssql";
import { config } from "./config.js"; // <-- now using centralized config

let pool;

// Build config based on environment
function getDbConfig() {
  if (config.sql.connectionString) {
    // Azure App Service + mssql + tedious compatibility
    console.log("🟦 Using connection string mode");

    return config.sql.connectionString;
  }
  // PRIORITY 2 — local config with username/password
  return {
    user: config.sql.user,
    password: config.sql.pass,
    server: config.sql.server,
    database: config.sql.name,
    options: {
      encrypt: config.sql.encrypt,
      trustServerCertificate: config.server.env === "development"
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

// Main query function
export async function queryDb(query, params = []) {
  try {
    if (!pool) {
      const dbConfig = getDbConfig();
      pool = await sql.connect(dbConfig);
      console.log("✔ Connected to SQL database");
    }

    const request = pool.request();

    // Prepare SQL parameters @p0, @p1, ...
    params.forEach((value, index) => {
      request.input(`p${index}`, value);
    });

    let paramIndex = 0;
    const sqlQuery = query.replace(/\?/g, () => `@p${paramIndex++}`);

    return await request.query(sqlQuery);

  } catch (err) {
    console.error("❌ Database query error:", err);
    throw err;
  }
}
