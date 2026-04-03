// src/services/ollama.ts
// Handles calls to the local Ollama API for embeddings and chat.

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const OLLAMA_EMBEDDING_MODEL =
    process.env.OLLAMA_EMBEDDING_MODEL || "mxbai-embed-large";

export interface OllamaChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Generate an embedding vector for the given text using Ollama.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const url = `${OLLAMA_BASE_URL}/api/embeddings`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_EMBEDDING_MODEL, prompt: text }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `Ollama embedding error [${response.status}]: ${body}`
        );
    }

    const data = (await response.json()) as { embedding: number[] };

    if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error("Ollama returned an invalid embedding response.");
    }

    console.log(
        `✅ Embedding generated (${data.embedding.length} dims) using ${OLLAMA_EMBEDDING_MODEL}`
    );

    return data.embedding;
}

/**
 * Send a chat request to the local Ollama model and return the response content.
 */
export async function ollamaChat(
    messages: OllamaChatMessage[]
): Promise<string> {
    const url = `${OLLAMA_BASE_URL}/api/chat`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            stream: false,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama chat error [${response.status}]: ${body}`);
    }

    const data = (await response.json()) as {
        message: { role: string; content: string };
    };

    if (!data.message?.content) {
        throw new Error("Ollama returned an empty chat response.");
    }

    console.log(`✅ Ollama model used: ${OLLAMA_MODEL}`);
    return data.message.content;
}

/**
 * Stream a chat response from Ollama token-by-token.
 * Calls `onToken` for each chunk of text as it arrives.
 */
export async function ollamaChatStream(
    messages: OllamaChatMessage[],
    onToken: (token: string) => void
): Promise<void> {
    const url = `${OLLAMA_BASE_URL}/api/chat`;

    console.log(`🚀 [OllamaStream] Starting request to ${url} with model ${OLLAMA_MODEL}`);

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            stream: true,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama chat stream error [${response.status}]: ${body}`);
    }

    if (!response.body) {
        throw new Error("Ollama stream response has no body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    /**
     * Helper to process accumulated buffer lines.
     * Ollama returns responses as NDJSON (newline-delimited JSON).
     */
    const processBuffer = (text: string, isFinal = false): string => {
        const lines = text.split("\n");
        // If not final, the last element is likely an incomplete JSON fragment.
        // We keep it in the buffer for the next iteration.
        const remaining = isFinal ? "" : (lines.pop() ?? "");

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const chunk = JSON.parse(trimmed) as {
                    message?: { content?: string };
                    done?: boolean;
                };

                if (chunk.message?.content) {
                    onToken(chunk.message.content);
                }

                if (chunk.done) {
                    reader.cancel();
                    return "";
                }
            } catch {
                // Ignore malformed JSON lines safely.
            }
        }
        return remaining;
    };

    try {
        while (true) {
            const { done, value } = await reader.read();

            // TextDecoder.decode(..., { stream: true }) maintains internal state for partial UTF-8 sequences.
            buffer += decoder.decode(value, { stream: !done });

            buffer = processBuffer(buffer);

            if (done) break;
        }
    } finally {
        // 3. Flush the decoder at the end.
        // After the stream ends, we process any remaining bytes in the buffer.
        const finalChunk = decoder.decode();
        if (finalChunk || buffer) {
            processBuffer(buffer + finalChunk, true);
        }
    }

    console.log(`✅ Ollama stream finished (model: ${OLLAMA_MODEL})`);
}
