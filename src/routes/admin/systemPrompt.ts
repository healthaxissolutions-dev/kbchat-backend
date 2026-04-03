// src/routes/admin/systemPrompt.ts
// Admin endpoint to read and update the system prompt file.

import express, { Request, Response } from "express";
import { getSystemPrompt, updateSystemPrompt } from "../../services/systemPrompt.js";

const router = express.Router();

/**
 * GET /api/admin/system-prompt
 * Returns the current system prompt (bypasses cache to always read latest).
 */
router.get("/", async (_req: Request, res: Response) => {
    try {
        const prompt = await getSystemPrompt(/* force */ true);
        return res.json({ prompt });
    } catch (err) {
        const error = err as Error;
        console.error("❌ Failed to read system prompt:", error.message);
        return res.status(500).json({ error: "Failed to read system prompt.", detail: error.message });
    }
});

/**
 * PUT /api/admin/system-prompt
 * Body: { "prompt": "..." }
 * Overwrites the system prompt file and busts in-memory cache.
 */
router.put("/", async (req: Request, res: Response) => {
    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
            return res.status(400).json({ error: "'prompt' must be a non-empty string." });
        }

        await updateSystemPrompt(prompt);
        return res.json({ message: "System prompt updated successfully." });
    } catch (err) {
        const error = err as Error;
        console.error("❌ Failed to update system prompt:", error.message);
        return res.status(500).json({ error: "Failed to update system prompt.", detail: error.message });
    }
});

export default router;
