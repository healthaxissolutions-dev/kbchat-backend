// src/services/documentResolver.js

import { queryDb } from "../db.js";

/**
 * Resolve documents for a service + submodule
 * Implements fallback logic:
 *  1) submodule-specific documents
 *  2) shared documents (service-level)
 */
export async function resolveDocuments(serviceId, submodule) {
  // 1️⃣ Try submodule-specific documents
  let result = await queryDb(
    `
    SELECT
      document_id,
      blob_directory,
      page_from_inclusive,
      page_to_inclusive,
      page_to_skip
    FROM knowledge.documents
    WHERE service_id = ?
      AND service_submodule = ?
      AND deleted_date IS NULL
    ORDER BY document_id
    `,
    [serviceId, submodule]
  );

  if (result.recordset.length > 0) {
    return result.recordset;
  }

  // 2️⃣ Fallback to shared documents
  result = await queryDb(
    `
    SELECT
      document_id,
      blob_directory,
      page_from_inclusive,
      page_to_inclusive,
      page_to_skip
    FROM knowledge.documents
    WHERE service_id = ?
      AND service_submodule = 'shared'
      AND deleted_date IS NULL
    ORDER BY document_id
    `,
    [serviceId]
  );

  return result.recordset;
}
