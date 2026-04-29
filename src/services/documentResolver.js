// src/services/documentResolver.js

import { queryDb } from "../db.js";

/**
 * Resolve documents for a service + submodule.
 * Returns submodule-specific documents when they exist; falls back to
 * service-level 'shared' documents in a single round-trip.
 */
export async function resolveDocuments(serviceId, submodule) {
  const result = await queryDb(
    `
    WITH ranked AS (
      SELECT
        document_id,
        blob_directory,
        page_from_inclusive,
        page_to_inclusive,
        page_to_skip,
        CASE WHEN service_submodule = ? THEN 1 ELSE 2 END AS priority
      FROM knowledge.documents
      WHERE service_id = ?
        AND service_submodule IN (?, 'shared')
        AND deleted_date IS NULL
    )
    SELECT document_id, blob_directory, page_from_inclusive, page_to_inclusive, page_to_skip
    FROM ranked
    WHERE priority = (SELECT MIN(priority) FROM ranked)
    ORDER BY document_id
    `,
    [submodule, serviceId, submodule]
  );

  return result.recordset;
}
