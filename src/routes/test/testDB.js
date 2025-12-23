import express from "express";
import { queryDb } from "../../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await queryDb("SELECT 1 AS test");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
