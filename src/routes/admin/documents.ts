import express, { Request, Response } from "express";
import { z } from "zod";
import { queryDb } from "../../db.js";
import { sendError } from "../../utils/error.js";
import { validateBody } from "../../utils/validate.js";

const router = express.Router();

const pageRange = ({
  page_from_inclusive,
  page_to_inclusive,
}: {
  page_from_inclusive?: number | null;
  page_to_inclusive?: number | null;
}) =>
  page_from_inclusive == null ||
  page_to_inclusive == null ||
  page_from_inclusive <= page_to_inclusive;

const pageRangeMsg = { message: "page_from_inclusive cannot be greater than page_to_inclusive" };

const DocumentFields = {
  page_from_inclusive: z.number().int().positive().nullable().optional(),
  page_to_inclusive: z.number().int().positive().nullable().optional(),
  page_to_skip: z.array(z.number().int().positive()).nullable().optional(),
};

const CreateDocumentSchema = z
  .object({
    service_id: z.number().int().positive(),
    service_submodule: z.string().min(1, "service_submodule is required"),
    blob_directory: z.string().min(1, "blob_directory is required"),
    ...DocumentFields,
  })
  .refine(pageRange, pageRangeMsg);

const UpdateDocumentSchema = z.object({
  service_id: z.number().int().positive().optional(),
  service_submodule: z.string().min(1).optional(),
  blob_directory: z.string().min(1).optional(),
  ...DocumentFields,
});

function toPageSkipJson(pages: number[] | null | undefined): string | null {
  return pages != null ? JSON.stringify(pages) : null;
}

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
  const data = validateBody(CreateDocumentSchema, req, res);
  if (!data) return;

  try {
    const svc = await queryDb(
      `SELECT 1 FROM knowledge.services WHERE service_id = ? AND deleted_date IS NULL`,
      [data.service_id]
    );
    if (svc.recordset.length === 0) {
      return sendError(res, 400, "Invalid or inactive service_id");
    }

    const exists = await queryDb(
      `SELECT 1 FROM knowledge.documents
       WHERE service_id = ? AND service_submodule = ? AND blob_directory = ?
         AND ISNULL(page_from_inclusive, -1) = ISNULL(?, -1)
         AND ISNULL(page_to_inclusive, -1) = ISNULL(?, -1)
         AND deleted_date IS NULL`,
      [
        data.service_id,
        data.service_submodule,
        data.blob_directory,
        data.page_from_inclusive ?? null,
        data.page_to_inclusive ?? null,
      ]
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
        data.service_id,
        data.service_submodule,
        data.blob_directory,
        data.page_from_inclusive ?? null,
        data.page_to_inclusive ?? null,
        toPageSkipJson(data.page_to_skip),
      ]
    );
    res.status(201).json({ document_id: result.recordset[0].document_id });
  } catch (err) {
    sendError(res, 500, "Failed to create document", (err as Error).message);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = validateBody(UpdateDocumentSchema, req, res);
  if (!data) return;

  try {
    const existing = await queryDb(
      `SELECT * FROM knowledge.documents WHERE document_id = ? AND deleted_date IS NULL`,
      [id]
    );
    if (existing.recordset.length === 0) {
      return sendError(res, 404, "Document not found");
    }

    const cur = existing.recordset[0];
    const finalServiceId = data.service_id ?? cur.service_id;
    const finalSubmodule = data.service_submodule ?? cur.service_submodule;
    const finalBlobDir = data.blob_directory ?? cur.blob_directory;
    const finalPageFrom = data.page_from_inclusive !== undefined ? data.page_from_inclusive : cur.page_from_inclusive;
    const finalPageTo = data.page_to_inclusive !== undefined ? data.page_to_inclusive : cur.page_to_inclusive;
    const finalPageSkip =
      data.page_to_skip !== undefined ? toPageSkipJson(data.page_to_skip) : cur.page_to_skip;

    if (finalPageFrom != null && finalPageTo != null && finalPageFrom > finalPageTo) {
      return sendError(res, 400, "page_from_inclusive cannot be greater than page_to_inclusive");
    }

    if (data.service_id !== undefined && data.service_id !== cur.service_id) {
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
      [finalServiceId, finalSubmodule, finalBlobDir, finalPageFrom, finalPageTo, id]
    );
    if (dup.recordset.length > 0) {
      return sendError(res, 409, "Duplicate document mapping exists");
    }

    await queryDb(
      `UPDATE knowledge.documents
       SET service_id = ?, service_submodule = ?, blob_directory = ?,
           page_from_inclusive = ?, page_to_inclusive = ?, page_to_skip = ?
       WHERE document_id = ?`,
      [finalServiceId, finalSubmodule, finalBlobDir, finalPageFrom, finalPageTo, finalPageSkip, id]
    );
    res.json({ success: true });
  } catch (err) {
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
