// src/services/gemini.ts
// Handles chat generation using the new Google Gemini API (@google/genai)

import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
    if (!ai) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
        ai = new GoogleGenAI({ apiKey });
        console.log("✅ Gemini client initialized.");
    }
    return ai;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export interface GeminiMessage {
    role: "user" | "model";
    parts: Array<{ text: string }>;
}

/**
 * Send a chat request to Gemini and return the response text.
 * @param systemInstruction - The system prompt text
 * @param userMessage - The user's question
 */
export async function geminiChat(
    systemInstruction: string,
    userMessage: string
): Promise<string> {
    const client = getClient();

    const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
            {
                role: "user",
                parts: [{ text: userMessage }],
            },
        ],
        config: {
            systemInstruction,
        },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned an empty response.");

    console.log(`✅ Gemini model used: ${GEMINI_MODEL}`);
    return text;
}

/**
 * Stream a Gemini response token-by-token.
 * Calls `onToken` for each text chunk as it arrives.
 */
export async function geminiChatStream(
    systemInstruction: string,
    userMessage: string,
    onToken: (token: string) => void
): Promise<void> {
    const client = getClient();

    const stream = client.models.generateContentStream({
        model: GEMINI_MODEL,
        contents: [
            {
                role: "user",
                parts: [{ text: userMessage }],
            },
        ],
        config: {
            systemInstruction,
        },
    });

    for await (const chunk of await stream) {
        const text = chunk.text;
        if (text) {
            onToken(text);
        }
    }

    console.log(`✅ Gemini stream finished (model: ${GEMINI_MODEL})`);
}
