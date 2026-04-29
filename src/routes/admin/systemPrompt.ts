// src/routes/admin/systemPrompt.ts
// Admin endpoint to read and update the system prompt file.

import express, { Request, Response } from "express";
import { getSystemPrompt, updateSystemPrompt } from "../../services/systemPrompt.js";
import { sendError } from "../../utils/error.js";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
    try {
        const prompt = await getSystemPrompt(/* force */ true);
        return res.json({ prompt });
    } catch (err) {
        const error = err as Error;
        console.error("❌ Failed to read system prompt:", error.message);
        return sendError(res, 500, "Failed to read system prompt.", error.message);
    }
});

router.put("/", async (req: Request, res: Response) => {
    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
            return sendError(res, 400, "'prompt' must be a non-empty string.");
        }

        await updateSystemPrompt(prompt);
        return res.json({ message: "System prompt updated successfully." });
    } catch (err) {
        const error = err as Error;
        console.error("❌ Failed to update system prompt:", error.message);
        return sendError(res, 500, "Failed to update system prompt.", error.message);
    }
});

export default router;
