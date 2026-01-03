// src/services/serviceResolver.js

import { queryDb } from "../db.js";

/**
 * Resolve service_name → service_id
 * Throws if not found or soft-deleted
 */
export async function resolveServiceId(serviceName) {
  const result = await queryDb(
    `
    SELECT service_id
    FROM knowledge.services
    WHERE service_name = ?
      AND deleted_date IS NULL
    `,
    [serviceName]
  );

  if (result.recordset.length === 0) {
    throw new Error(`Service '${serviceName}' not found`);
  }

  return result.recordset[0].service_id;
}
