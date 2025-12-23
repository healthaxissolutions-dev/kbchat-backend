import sql from "mssql";
import { config } from "./config.js";

let pool;

// Build config based on environment
function getDbConfig() {
  // ✅ PRIORITY 1 — Azure Managed Identity (App Service)
  if (config.sql.auth === "managed_identity") {
    console.log("🟩 Using Azure Managed Identity for SQL");

    return {
      server: config.sql.server,
      database: config.sql.name,
      options: {
        encrypt: true
      },
      authentication: {
        type: "azure-active-directory-managed-identity"
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
  }

  // ✅ PRIORITY 2 — Full connection string
  if (config.sql.connectionString) {
    console.log("🟦 Using SQL connection string mode");
    return config.sql.connectionString;
  }

  // ✅ PRIORITY 3 — Local SQL username/password
  console.log("🟨 Using SQL username/password mode");

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
