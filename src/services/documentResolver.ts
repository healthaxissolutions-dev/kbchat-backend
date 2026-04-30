import { queryDb } from "../db.js";

export interface DocumentRow {
  document_id: number;
  blob_directory: string;
  page_from_inclusive: number | null;
  page_to_inclusive: number | null;
  page_to_skip: string | null;
}

export async function resolveDocuments(serviceId: string, submodule: string): Promise<DocumentRow[]> {
  const result = await queryDb(
    `WITH ranked AS (
      SELECT document_id, blob_directory, page_from_inclusive, page_to_inclusive, page_to_skip,
             CASE WHEN service_submodule = ? THEN 1 ELSE 2 END AS priority
      FROM knowledge.documents
      WHERE service_id = ? AND service_submodule IN (?, 'shared') AND deleted_date IS NULL
    )
    SELECT document_id, blob_directory, page_from_inclusive, page_to_inclusive, page_to_skip
    FROM ranked
    WHERE priority = (SELECT MIN(priority) FROM ranked)
    ORDER BY document_id`,
    [submodule, serviceId, submodule]
  );
  return result.recordset as unknown as DocumentRow[];
}
