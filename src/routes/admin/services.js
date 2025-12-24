// src/routes/admin/services.js
 
import express from "express";
import { queryDb } from "../../db.js";

const router = express.Router();

/**
 * GET /api/admin/services
 * List all services (excluding soft-deleted)
 */
router.get("/", async (req, res) => {
  try {
    const result = await queryDb(`
      SELECT
        service_id,
        service_name,
        submodules,
        created_date,
        updated_date,
        deleted_date
      FROM knowledge.services
      WHERE deleted_date IS NULL
      ORDER BY service_name
    `);

    const services = result.recordset.map(s => ({
      service_id: s.service_id,
      service_name: s.service_name,
      submodules: JSON.parse(s.submodules || "[]")
    }));

    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});


/**
 * POST /api/admin/services
 * Create a new service
 */
router.post("/", async (req, res) => {
  const { service_name, submodules } = req.body;
  const normalizedName = service_name.trim().toLowerCase();

  if (!normalizedName) {
    return res.status(400).json({ error: "service_name is required" });
  }

  if (submodules && !Array.isArray(submodules)) {
    return res.status(400).json({ error: "submodules must be an array" });
  }

  const exists = await queryDb(
    `
    SELECT 1
    FROM knowledge.services
    WHERE service_name = ?
      AND deleted_date IS NULL
    `,
    [normalizedName]
  );

  if (exists.recordset.length > 0) {
    return res.status(409).json({ error: "Service already exists" });
  }

  try {
    const result = await queryDb(
      `
      INSERT INTO knowledge.services
        (service_name, submodules, created_date)
      OUTPUT inserted.service_id, inserted.service_name, inserted.submodules
      VALUES
        (?, ?, GETDATE())
      `,
      [
        normalizedName,
        submodules ? JSON.stringify(submodules) : JSON.stringify([])
      ]
    );

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create service" });
  }
});


/**
 * PUT /api/admin/services/:id
 * Update submodules
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { submodules } = req.body;

  if (!Array.isArray(submodules)) {
    return res.status(400).json({ error: "submodules must be an array" });
  }

  try {
    const result = await queryDb(
      `
      UPDATE knowledge.services
      SET
        submodules = ?,
        updated_date = GETDATE()
      WHERE service_id = ?
        AND deleted_date IS NULL
      `,
      [JSON.stringify(submodules), id]
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update service" });
  }
});


/**
 * DELETE /api/admin/services/:id
 * Soft delete service
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryDb(
      `
      UPDATE knowledge.services
      SET deleted_date = GETDATE()
      WHERE service_id = ?
        AND deleted_date IS NULL
      `,
      [id]
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

export default router;