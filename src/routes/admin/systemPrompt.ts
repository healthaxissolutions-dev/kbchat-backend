import express, { Request, Response } from "express";
import { z } from "zod";
import { getSystemPrompt, updateSystemPrompt } from "../../services/systemPrompt.js";
import { sendError } from "../../utils/error.js";
import { validateBody } from "../../utils/validate.js";

const router = express.Router();

const UpdateSystemPromptSchema = z.object({
  prompt: z.string().min(1, "'prompt' must be a non-empty string"),
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const prompt = await getSystemPrompt(/* force */ true);
    return res.json({ prompt });
  } catch (err) {
    return sendError(res, 500, "Failed to read system prompt", (err as Error).message);
  }
});

router.put("/", async (req: Request, res: Response) => {
  const data = validateBody(UpdateSystemPromptSchema, req, res);
  if (!data) return;

  try {
    await updateSystemPrompt(data.prompt);
    return res.json({ message: "System prompt updated successfully." });
  } catch (err) {
    return sendError(res, 500, "Failed to update system prompt", (err as Error).message);
  }
});

export default router;
