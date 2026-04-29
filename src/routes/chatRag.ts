// src/routes/chatRag.ts
// RAG chat route using Supabase vector search + Ollama or Gemini LLM
// Supports both regular JSON responses and SSE streaming (stream: true in body).

import express, { Request, Response } from "express";
import { generateEmbedding, ollamaChat, ollamaChatStream } from "../services/ollama.js";
import { geminiChat, geminiChatStream } from "../services/gemini.js";
import { searchDocuments, DocumentChunk } from "../services/supabase.js";
import { getSystemPrompt } from "../services/systemPrompt.js";
import { chatRateLimit } from "../middleware/chatRateLimit.js";
import { sendError } from "../utils/error.js";

const router = express.Router();

type AiModel = "ollama" | "gemini";

const isDev = process.env.NODE_ENV !== "production";

/** Append context chunks to the base system prompt. */
function buildSystemPrompt(baseInstruction: string, chunks: DocumentChunk[]): string {
    if (chunks.length === 0) {
        return baseInstruction;
    }

    const context = chunks
        .map((c, i) => `[Source ${i + 1}]:\n${c.content}`)
        .join("\n\n---\n\n");

    return `${baseInstruction}\n\nDOCUMENT EXCERPTS:\n${context}`.trim();
}

/** Send one SSE event to the client. */
function sendEvent(res: Response, payload: object): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/* -----------------------------------------------
   POST /api/chat
   Body: {
     question: string,
     username: string,
     service?: string,        // informational only — not used for filtering yet
     aimodel?: "ollama" | "gemini",   // default: "ollama"
     model?: "ollama" | "gemini",     // alias for aimodel
     stream?: boolean                 // default: false
   }
----------------------------------------------- */
router.post("/", chatRateLimit, async (req: Request, res: Response) => {
    try {
        const { question, service, aimodel, model, stream } = req.body;
        const username = req.user!.email;

        if (!question || typeof question !== "string" || question.trim() === "") {
            return sendError(res, 400, "'question' is required.");
        }

        const selectedModel: AiModel =
            aimodel === "gemini" || model === "gemini" ? "gemini" : "ollama";

        const useStream = stream === true;

        console.log(
            `💬 [${username}] "${question.slice(0, 80)}..." | Model: ${selectedModel} | Service: ${service || "none"} | Stream: ${useStream}`
        );

        /* -- SSE setup -- */
        if (useStream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.flushHeaders();
        }

        /* 1. Embed the question */
        if (useStream) sendEvent(res, { type: "status", message: "Generating embedding…" });
        console.log("🔍 Generating embedding via Ollama...");
        const embedding = await generateEmbedding(question);

        /* 2. Retrieve relevant chunks from Supabase */
        if (useStream) sendEvent(res, { type: "status", message: "Searching knowledge base…" });
        console.log("📚 Searching Supabase vector store...");
        const chunks = await searchDocuments(embedding, 5, 0.3);

        console.log(`✅ Retrieved ${chunks.length} relevant chunk(s).`);
        if (chunks.length === 0) {
            console.warn("⚠️ No relevant chunks found. Answering with no context.");
        }

        /* 3. Build system prompt */
        if (useStream) sendEvent(res, { type: "status", message: "Generating answer…" });
        const baseInstruction = await getSystemPrompt();
        const systemPrompt = buildSystemPrompt(baseInstruction, chunks);

        const sources = chunks.map((c) => ({
            id: c.id,
            similarity: c.similarity,
            metadata: c.metadata,
        }));

        /* 4. Generate answer */
        if (useStream) {
            if (selectedModel === "gemini") {
                console.log("🤖 Streaming answer via Gemini...");
                await geminiChatStream(systemPrompt, question, (token) => {
                    sendEvent(res, { type: "token", token });
                });
            } else {
                console.log("🤖 Streaming answer via Ollama...");
                await ollamaChatStream(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: question },
                    ],
                    (token) => {
                        sendEvent(res, { type: "token", token });
                    }
                );
            }

            sendEvent(res, { type: "done", model: selectedModel, sources });
            res.end();
        } else {
            let answer: string;

            if (selectedModel === "gemini") {
                console.log("🤖 Generating answer via Gemini...");
                answer = await geminiChat(systemPrompt, question);
            } else {
                console.log("🤖 Generating answer via Ollama...");
                answer = await ollamaChat([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: question },
                ]);
            }

            console.log(`✅ Answer generated (${answer.length} chars).`);
            return res.json({ answer, model: selectedModel, sources });
        }
    } catch (err) {
        const error = err as Error;
        console.error("❌ RAG chat error:", error.message);

        if (res.headersSent) {
            // SSE stream already open — send error event before closing
            sendEvent(res, {
                type: "error",
                message: isDev ? error.message : "Internal server error",
            });
            res.end();
        } else {
            return sendError(res, 500, "Internal server error", error.message);
        }
    }
});

export default router;
