import express, { Request, Response } from "express";
import { queryDb } from "../../db.js";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await queryDb("SELECT 1 AS test");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
