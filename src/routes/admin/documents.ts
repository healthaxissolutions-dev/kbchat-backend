import express, { Request, Response } from "express";
import { queryDb } from "../../db.js";
import { sendError } from "../../utils/error.js";

function normalizePageToSkip(input: unknown): string | null {
  if (input === undefined || input === null) return null;

  if (!Array.isArray(input)) {
    throw new Error("page_to_skip must be an array of integers");
  }

  const normalized = (input as unknown[])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (normalized.length !== input.length) {
    throw new Error("page_to_skip must contain only positive integers");
  }

  return JSON.stringify(normalized);
}

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await queryDb(`
      SELECT d.document_id, d.service_id, s.service_name, d.service_submodule,
             d.blob_directory, d.page_from_inclusive, d.page_to_inclusive,
             d.page_to_skip, d.created_date
      FROM knowledge.documents d
      INNER JOIN knowledge.services s ON d.service_id = s.service_id
      WHERE d.deleted_date IS NULL AND s.deleted_date IS NULL
      ORDER BY s.service_name, d.service_submodule, d.document_id
    `);
    res.json(result.recordset);
  } catch (err) {
    sendError(res, 500, "Failed to fetch documents", (err as Error).message);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      service_id,
      service_submodule,
      blob_directory,
      page_from_inclusive,
      page_to_inclusive,
      page_to_skip,
    } = req.body;

    if (!service_id || !service_submodule || !blob_directory) {
      return sendError(res, 400, "service_id, service_submodule, and blob_directory are required");
    }

    if (page_from_inclusive != null && page_to_inclusive != null && page_from_inclusive > page_to_inclusive) {
      return sendError(res, 400, "page_from_inclusive cannot be greater than page_to_inclusive");
    }

    const svc = await queryDb(
      `SELECT 1 FROM knowledge.services WHERE service_id = ? AND deleted_date IS NULL`,
      [service_id]
    );
    if (svc.recordset.length === 0) {
      return sendError(res, 400, "Invalid or inactive service_id");
    }

    const normalizedPageToSkip = normalizePageToSkip(page_to_skip);

    const exists = await queryDb(
      `SELECT 1 FROM knowledge.documents
       WHERE service_id = ? AND service_submodule = ? AND blob_directory = ?
         AND ISNULL(page_from_inclusive, -1) = ISNULL(?, -1)
         AND ISNULL(page_to_inclusive, -1) = ISNULL(?, -1)
         AND deleted_date IS NULL`,
      [service_id, service_submodule, blob_directory, page_from_inclusive, page_to_inclusive]
    );
    if (exists.recordset.length > 0) {
      return sendError(res, 409, "Exact document mapping already exists");
    }

    const result = await queryDb(
      `INSERT INTO knowledge.documents
         (service_id, service_submodule, blob_directory, page_from_inclusive,
          page_to_inclusive, page_to_skip, created_date)
       OUTPUT inserted.document_id
       VALUES (?, ?, ?, ?, ?, ?, SYSDATETIME())`,
      [
        service_id,
        service_submodule,
        blob_directory,
        page_from_inclusive ?? null,
        page_to_inclusive ?? null,
        normalizedPageToSkip,
      ]
    );
    res.status(201).json({ document_id: result.recordset[0].document_id });
  } catch (err) {
    if ((err as Error).message.includes("page_to_skip")) {
      return sendError(res, 400, (err as Error).message);
    }
    sendError(res, 500, "Failed to create document", (err as Error).message);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    service_id,
    service_submodule,
    blob_directory,
    page_from_inclusive,
    page_to_inclusive,
    page_to_skip,
  } = req.body;

  if (page_from_inclusive != null && page_to_inclusive != null && page_from_inclusive > page_to_inclusive) {
    return sendError(res, 400, "page_from_inclusive cannot be greater than page_to_inclusive");
  }

  try {
    const existing = await queryDb(
      `SELECT * FROM knowledge.documents WHERE document_id = ? AND deleted_date IS NULL`,
      [id]
    );
    if (existing.recordset.length === 0) {
      return sendError(res, 404, "Document not found");
    }

    const current = existing.recordset[0];
    const finalServiceId = service_id !== undefined ? service_id : current.service_id;
    const finalSubmodule = service_submodule !== undefined ? service_submodule : current.service_submodule;
    const finalBlobDirectory = blob_directory !== undefined ? blob_directory : current.blob_directory;
    const finalPageFrom = page_from_inclusive !== undefined ? page_from_inclusive : current.page_from_inclusive;
    const finalPageTo = page_to_inclusive !== undefined ? page_to_inclusive : current.page_to_inclusive;
    let finalPageSkip = current.page_to_skip;
    if (page_to_skip !== undefined) finalPageSkip = normalizePageToSkip(page_to_skip);

    if (service_id !== undefined && service_id !== current.service_id) {
      const svc = await queryDb(
        `SELECT 1 FROM knowledge.services WHERE service_id = ? AND deleted_date IS NULL`,
        [finalServiceId]
      );
      if (svc.recordset.length === 0) {
        return sendError(res, 400, "Invalid service_id");
      }
    }

    const dup = await queryDb(
      `SELECT 1 FROM knowledge.documents
       WHERE service_id = ? AND service_submodule = ? AND blob_directory = ?
         AND ISNULL(page_from_inclusive, -1) = ISNULL(?, -1)
         AND ISNULL(page_to_inclusive, -1) = ISNULL(?, -1)
         AND deleted_date IS NULL AND document_id <> ?`,
      [finalServiceId, finalSubmodule, finalBlobDirectory, finalPageFrom, finalPageTo, id]
    );
    if (dup.recordset.length > 0) {
      return sendError(res, 409, "Duplicate document mapping exists");
    }

    await queryDb(
      `UPDATE knowledge.documents
       SET service_id = ?, service_submodule = ?, blob_directory = ?,
           page_from_inclusive = ?, page_to_inclusive = ?, page_to_skip = ?
       WHERE document_id = ?`,
      [finalServiceId, finalSubmodule, finalBlobDirectory, finalPageFrom, finalPageTo, finalPageSkip, id]
    );
    res.json({ success: true });
  } catch (err) {
    if ((err as Error).message.includes("page_to_skip")) {
      return sendError(res, 400, (err as Error).message);
    }
    sendError(res, 500, "Failed to update document", (err as Error).message);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await queryDb(
      `UPDATE knowledge.documents SET deleted_date = SYSDATETIME()
       WHERE document_id = ? AND deleted_date IS NULL`,
      [id]
    );
    if (result.rowsAffected[0] === 0) {
      return sendError(res, 404, "Document not found");
    }
    res.json({ success: true });
  } catch (err) {
    sendError(res, 500, "Failed to delete document", (err as Error).message);
  }
});

export default router;
