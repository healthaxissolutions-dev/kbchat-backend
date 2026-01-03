// src/routes/admin/documents.js

import express from "express";
import { queryDb } from "../../db.js";

function normalizePageToSkip(input) {
  if (input === undefined || input === null) {
    return null;
  }

  if (!Array.isArray(input)) {
    throw new Error("page_to_skip must be an array of integers");
  }

  const normalized = input
    .map(n => Number(n))
    .filter(n => Number.isInteger(n) && n > 0);

  if (normalized.length !== input.length) {
    throw new Error("page_to_skip must contain only positive integers");
  }

  return JSON.stringify(normalized);
}

const router = express.Router();

/**
 * GET /api/admin/documents
 * List all active documents
 */
router.get("/", async (req, res) => {
  try {
    const result = await queryDb(`
      SELECT
        d.document_id,
        d.service_id,
        s.service_name,
        d.service_submodule,
        d.blob_directory,
        d.page_from_inclusive,
        d.page_to_inclusive,
        d.page_to_skip,
        d.created_date
      FROM knowledge.documents d
      INNER JOIN knowledge.services s
        ON d.service_id = s.service_id
      WHERE d.deleted_date IS NULL
        AND s.deleted_date IS NULL
      ORDER BY s.service_name, d.service_submodule, d.document_id
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});


/**
 * POST /api/admin/documents
 * Create a new document mapping
 */
router.post("/", async (req, res) => {
  try {
    const {
      service_id,
      service_submodule,
      blob_directory,
      page_from_inclusive,
      page_to_inclusive,
      page_to_skip
    } = req.body;

    if (!service_id || !service_submodule || !blob_directory) {
      return res.status(400).json({
        error: "service_id, service_submodule, and blob_directory are required"
      });
    }

    if (
      page_from_inclusive != null &&
      page_to_inclusive != null &&
      page_from_inclusive > page_to_inclusive
    ) {
      return res.status(400).json({
        error: "page_from_inclusive cannot be greater than page_to_inclusive"
      });
    }

    // 🔎 Validate service_id is active
    const svc = await queryDb(
      `
      SELECT 1
      FROM knowledge.services
      WHERE service_id = ?
        AND deleted_date IS NULL
      `,
      [service_id]
    );

    if (svc.recordset.length === 0) {
      return res.status(400).json({
        error: "Invalid or inactive service_id"
      });
    }

    const normalizedPageToSkip = normalizePageToSkip(page_to_skip);

    // 🔐 Exact-duplicate safeguard
    const exists = await queryDb(
      `
      SELECT 1
      FROM knowledge.documents
      WHERE service_id = ?
        AND service_submodule = ?
        AND blob_directory = ?
        AND ISNULL(page_from_inclusive, -1) = ISNULL(?, -1)
        AND ISNULL(page_to_inclusive, -1) = ISNULL(?, -1)
        AND deleted_date IS NULL
      `,
      [
        service_id,
        service_submodule,
        blob_directory,
        page_from_inclusive,
        page_to_inclusive
      ]
    );

    if (exists.recordset.length > 0) {
      return res.status(409).json({
        error: "Exact document mapping already exists"
      });
    }

    const result = await queryDb(
      `
      INSERT INTO knowledge.documents (
        service_id,
        service_submodule,
        blob_directory,
        page_from_inclusive,
        page_to_inclusive,
        page_to_skip,
        created_date
      )
      OUTPUT inserted.document_id
      VALUES (?, ?, ?, ?, ?, ?, SYSDATETIME())
      `,
      [
        service_id,
        service_submodule,
        blob_directory,
        page_from_inclusive ?? null,
        page_to_inclusive ?? null,
        normalizedPageToSkip
      ]
    );

    res.status(201).json({
      document_id: result.recordset[0].document_id
    });
  } catch (err) {
    if (err.message.includes("page_to_skip")) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create document" });
  }
});


/**
 * PUT /api/admin/documents/:id
 * Update document metadata
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    service_id,
    service_submodule,
    blob_directory,
    page_from_inclusive,
    page_to_inclusive,
    page_to_skip
  } = req.body;

  if (
    page_from_inclusive != null &&
    page_to_inclusive != null &&
    page_from_inclusive > page_to_inclusive
  ) {
    return res.status(400).json({
      error: "page_from_inclusive cannot be greater than page_to_inclusive"
    });
  }

  const existing = await queryDb(
    `
    SELECT *
    FROM knowledge.documents
    WHERE document_id = ?
      AND deleted_date IS NULL
    `,
    [id]
  );

  if (existing.recordset.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  const current = existing.recordset[0];

  const finalServiceId =
    service_id !== undefined ? service_id : current.service_id;

  const finalSubmodule =
    service_submodule !== undefined
      ? service_submodule
      : current.service_submodule;

  const finalBlobDirectory =
    blob_directory !== undefined
      ? blob_directory
      : current.blob_directory;

  const finalPageFrom =
    page_from_inclusive !== undefined
      ? page_from_inclusive
      : current.page_from_inclusive;

  const finalPageTo =
    page_to_inclusive !== undefined
      ? page_to_inclusive
      : current.page_to_inclusive;

  let finalPageSkip = current.page_to_skip;

  if (page_to_skip !== undefined) {
    finalPageSkip = normalizePageToSkip(page_to_skip);
  }
  
  if (service_id !== undefined && service_id !== current.service_id) {
    const svc = await queryDb(
      `
      SELECT 1
      FROM knowledge.services
      WHERE service_id = ?
        AND deleted_date IS NULL
      `,
      [finalServiceId]
    );

    if (svc.recordset.length === 0) {
      return res.status(400).json({ error: "Invalid service_id" });
    }
  }

  try {

    // 🔐 Duplicate safeguard (exclude self)
    const dup = await queryDb(
      `
      SELECT 1
      FROM knowledge.documents
      WHERE service_id = ?
        AND service_submodule = ?
        AND blob_directory = ?
        AND ISNULL(page_from_inclusive, -1) = ISNULL(?, -1)
        AND ISNULL(page_to_inclusive, -1) = ISNULL(?, -1)
        AND deleted_date IS NULL
        AND document_id <> ?
      `,
      [
        finalServiceId,
        finalSubmodule,
        finalBlobDirectory,
        finalPageFrom,
        finalPageTo,
        id
      ]
    );

    if (dup.recordset.length > 0) {
      return res.status(409).json({ error: "Duplicate document mapping exists" });
    }

    await queryDb(
      `
      UPDATE knowledge.documents
      SET
        service_id = ?,
        service_submodule = ?,
        blob_directory = ?,
        page_from_inclusive = ?,
        page_to_inclusive = ?,
        page_to_skip = ?
      WHERE document_id = ?
      `,
      [
        finalServiceId,
        finalSubmodule,
        finalBlobDirectory,
        finalPageFrom,
        finalPageTo,
        finalPageSkip,
        id
      ]
    );

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes("page_to_skip")) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to update document" });
  }
});


/**
 * DELETE /api/admin/documents/:id
 * Soft delete document
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryDb(
      `
      UPDATE knowledge.documents
      SET deleted_date = SYSDATETIME()
      WHERE document_id = ?
        AND deleted_date IS NULL
      `,
      [id]
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;