// src/services/systemPrompt.ts
// Loads the system prompt from a file with in-memory caching.
// Designed to be DB-swap-ready: only this module needs to change.

import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE = join(__dirname, "../prompts/systemPrompt.txt");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedPrompt: string | null = null;
let cacheExpiry: number = 0;

/**
 * Returns the base system instruction from file (cached for 5 min).
 * Future: replace the file read with a DB query and nothing else changes.
 */
export async function getSystemPrompt(force = false): Promise<string> {
    const now = Date.now();

    if (!force && cachedPrompt !== null && now < cacheExpiry) {
        return cachedPrompt;
    }

    const raw = await readFile(PROMPT_FILE, "utf-8");
    cachedPrompt = raw.trim();
    cacheExpiry = now + CACHE_TTL_MS;

    console.log("[SystemPrompt] Loaded from file (cache refreshed).");
    return cachedPrompt;
}

/**
 * Overwrite the system prompt file and bust the cache immediately.
 * Called by the admin API.
 */
export async function updateSystemPrompt(newPrompt: string): Promise<void> {
    await writeFile(PROMPT_FILE, newPrompt.trim(), "utf-8");
    cachedPrompt = newPrompt.trim();
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    console.log("[SystemPrompt] Updated via admin API.");
}
