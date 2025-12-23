import express from "express";
import { queryDb } from "../db.js";

const router = express.Router();

// GET /api/services
router.get("/", async (req, res) => {
  try {
    const result = await queryDb("SELECT * FROM services");
    res.json({ services: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
