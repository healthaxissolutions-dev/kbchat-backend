// src/services/serviceResolver.js

import { queryDb } from "../db.js";

/**
 * Resolve service_id
 * Throws if not found or soft-deleted
 */
export async function resolveServiceId(serviceId) {
  const result = await queryDb(
    `
    SELECT service_id
    FROM knowledge.services
    WHERE service_id = ?
      AND deleted_date IS NULL
    `,
    [serviceId]
  );

  if (result.recordset.length === 0) {
    throw new Error(`Service '${serviceId}' not found`);
  }

  return result.recordset[0].service_id;
}
