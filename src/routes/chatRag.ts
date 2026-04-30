import express, { Request, Response } from "express";
import { z } from "zod";
import { generateEmbedding, ollamaChat, ollamaChatStream } from "../services/ollama.js";
import { geminiChat, geminiChatStream } from "../services/gemini.js";
import { searchDocuments, DocumentChunk } from "../services/supabase.js";
import { getSystemPrompt } from "../services/systemPrompt.js";
import { chatRateLimit } from "../middleware/chatRateLimit.js";
import { sendError } from "../utils/error.js";
import { validateBody } from "../utils/validate.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

const router = express.Router();

type AiModel = "ollama" | "gemini";

const ChatRequestSchema = z.object({
  question: z.string().min(1, "'question' is required"),
  service: z.string().optional(),
  aimodel: z.enum(["ollama", "gemini"]).optional(),
  model: z.enum(["ollama", "gemini"]).optional(),
  stream: z.boolean().optional().default(false),
});

function buildSystemPrompt(baseInstruction: string, chunks: DocumentChunk[]): string {
  if (chunks.length === 0) return baseInstruction;
  const context = chunks.map((c, i) => `[Source ${i + 1}]:\n${c.content}`).join("\n\n---\n\n");
  return `${baseInstruction}\n\nDOCUMENT EXCERPTS:\n${context}`.trim();
}

function sendEvent(res: Response, payload: object): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.post("/", chatRateLimit, async (req: Request, res: Response) => {
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  try {
    const data = validateBody(ChatRequestSchema, req, res);
    if (!data) return;

    const { question, service, aimodel, model } = data;
    const username = req.user!.email;
    const selectedModel: AiModel = aimodel === "gemini" || model === "gemini" ? "gemini" : "ollama";
    const useStream = data.stream;

    logger.info(
      { username, model: selectedModel, service: service ?? null, stream: useStream },
      `Chat request: "${question.slice(0, 80)}"`
    );

    if (useStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      keepAlive = setInterval(() => res.write(":\n\n"), 15000);
      res.on("close", () => { if (keepAlive) clearInterval(keepAlive); });
    }

    if (useStream) sendEvent(res, { type: "status", message: "Generating embedding…" });
    logger.debug("Generating embedding via Ollama");
    const embedding = await generateEmbedding(question);

    if (useStream) sendEvent(res, { type: "status", message: "Searching knowledge base…" });
    logger.debug("Searching Supabase vector store");
    const chunks = await searchDocuments(embedding, config.rag.matchCount, config.rag.matchThreshold);

    logger.info({ chunks: chunks.length }, "Vector search complete");
    if (chunks.length === 0) logger.warn("No relevant chunks found — answering with no context");

    if (useStream) sendEvent(res, { type: "status", message: "Generating answer…" });
    const systemPrompt = buildSystemPrompt(await getSystemPrompt(), chunks);

    const sources = chunks.map((c) => ({ id: c.id, similarity: c.similarity, metadata: c.metadata }));

    if (useStream) {
      if (selectedModel === "gemini") {
        logger.debug("Streaming via Gemini");
        await geminiChatStream(systemPrompt, question, (token) => sendEvent(res, { type: "token", token }));
      } else {
        logger.debug("Streaming via Ollama");
        await ollamaChatStream(
          [{ role: "system", content: systemPrompt }, { role: "user", content: question }],
          (token) => sendEvent(res, { type: "token", token })
        );
      }
      if (keepAlive) clearInterval(keepAlive);
      sendEvent(res, { type: "done", model: selectedModel, sources });
      res.end();
    } else {
      let answer: string;
      if (selectedModel === "gemini") {
        logger.debug("Generating via Gemini");
        answer = await geminiChat(systemPrompt, question);
      } else {
        logger.debug("Generating via Ollama");
        answer = await ollamaChat([
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ]);
      }
      logger.info({ chars: answer.length }, "Answer generated");
      return res.json({ answer, model: selectedModel, sources });
    }
  } catch (err) {
    const error = err as Error;
    logger.error({ err: error }, "RAG chat error");

    if (res.headersSent) {
      if (keepAlive) clearInterval(keepAlive);
      sendEvent(res, {
        type: "error",
        message: config.server.env !== "production" ? error.message : "Internal server error",
      });
      res.end();
    } else {
      return sendError(res, 500, "Internal server error", error.message);
    }
  }
});

export default router;
