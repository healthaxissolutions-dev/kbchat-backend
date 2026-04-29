import express, { Request, Response } from "express";
import { queryDb } from "../../db.js";
import { sendError } from "../../utils/error.js";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await queryDb(`
      SELECT service_id, service_name, submodules, created_date, updated_date, deleted_date
      FROM knowledge.services
      WHERE deleted_date IS NULL
      ORDER BY service_name
    `);

    const services = result.recordset.map((s: Record<string, any>) => ({
      service_id: s.service_id,
      service_name: s.service_name,
      submodules: JSON.parse(s.submodules || "[]"),
    }));

    res.json(services);
  } catch (err) {
    sendError(res, 500, "Failed to fetch services", (err as Error).message);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const { service_name, submodules } = req.body;
  const normalizedName: string = (service_name || "").trim().toLowerCase();

  if (!normalizedName) {
    return sendError(res, 400, "service_name is required");
  }

  if (submodules && !Array.isArray(submodules)) {
    return sendError(res, 400, "submodules must be an array");
  }

  const exists = await queryDb(
    `SELECT 1 FROM knowledge.services WHERE service_name = ? AND deleted_date IS NULL`,
    [normalizedName]
  );

  if (exists.recordset.length > 0) {
    return sendError(res, 409, "Service already exists");
  }

  try {
    const result = await queryDb(
      `INSERT INTO knowledge.services (service_name, submodules, created_date)
       OUTPUT inserted.service_id, inserted.service_name, inserted.submodules
       VALUES (?, ?, GETDATE())`,
      [normalizedName, JSON.stringify(submodules ?? [])]
    );
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    sendError(res, 500, "Failed to create service", (err as Error).message);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { submodules } = req.body;

  if (!Array.isArray(submodules)) {
    return sendError(res, 400, "submodules must be an array");
  }

  try {
    const result = await queryDb(
      `UPDATE knowledge.services SET submodules = ?, updated_date = GETDATE()
       WHERE service_id = ? AND deleted_date IS NULL`,
      [JSON.stringify(submodules), id]
    );

    if (result.rowsAffected[0] === 0) {
      return sendError(res, 404, "Service not found");
    }

    res.json({ success: true });
  } catch (err) {
    sendError(res, 500, "Failed to update service", (err as Error).message);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await queryDb(
      `UPDATE knowledge.services SET deleted_date = GETDATE()
       WHERE service_id = ? AND deleted_date IS NULL`,
      [id]
    );

    if (result.rowsAffected[0] === 0) {
      return sendError(res, 404, "Service not found");
    }

    res.json({ success: true });
  } catch (err) {
    sendError(res, 500, "Failed to delete service", (err as Error).message);
  }
});

export default router;
