// src/services/systemPrompt.ts
// Reads and writes the system prompt from SQL (knowledge.system_prompts).
// Falls back to the bundled file if the table is missing or empty so the
// server stays operational before the migration has been run.
//
// Required migration:
//   CREATE TABLE knowledge.system_prompts (
//     name         VARCHAR(100)   NOT NULL PRIMARY KEY,
//     prompt       NVARCHAR(MAX)  NOT NULL,
//     updated_date DATETIME2      NOT NULL DEFAULT SYSDATETIME()
//   );

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { queryDb } from "../db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE = join(__dirname, "../prompts/systemPrompt.txt");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PROMPT_NAME = "default";

let cachedPrompt: string | null = null;
let cacheExpiry = 0;

async function readFromFile(): Promise<string> {
    const raw = await readFile(PROMPT_FILE, "utf-8");
    return raw.trim();
}

async function queryPrompt(): Promise<string | null> {
    const result = await queryDb(
        "SELECT prompt FROM knowledge.system_prompts WHERE name = ?",
        [PROMPT_NAME]
    );
    return result.recordset.length > 0 ? (result.recordset[0].prompt as string) : null;
}

/**
 * Returns the current system prompt, cached for 5 minutes.
 * On first call after a cold start or cache expiry, reads from SQL.
 * If the DB row is missing, seeds it from the bundled .txt file.
 * If the DB is unreachable, falls back to the file and logs a warning.
 */
export async function getSystemPrompt(force = false): Promise<string> {
    const now = Date.now();
    if (!force && cachedPrompt !== null && now < cacheExpiry) {
        return cachedPrompt;
    }

    try {
        let prompt = await queryPrompt();

        if (prompt === null) {
            // Table exists but is empty — seed from the bundled file
            const seed = await readFromFile();
            try {
                await queryDb(
                    "INSERT INTO knowledge.system_prompts (name, prompt, updated_date) VALUES (?, ?, SYSDATETIME())",
                    [PROMPT_NAME, seed]
                );
                console.log("[SystemPrompt] Seeded DB from bundled file.");
            } catch (seedErr) {
                console.warn("[SystemPrompt] Could not seed DB:", (seedErr as Error).message);
            }
            prompt = seed;
        }

        cachedPrompt = prompt;
        cacheExpiry = now + CACHE_TTL_MS;
        console.log("[SystemPrompt] Loaded from DB (cache refreshed).");
        return cachedPrompt;
    } catch (err) {
        // Table likely not created yet — fall back to file so server keeps running
        console.warn(
            "[SystemPrompt] DB unavailable, falling back to bundled file:",
            (err as Error).message
        );
        const fallback = await readFromFile();
        cachedPrompt = fallback;
        cacheExpiry = now + CACHE_TTL_MS;
        return fallback;
    }
}

/**
 * Persists a new system prompt to SQL and refreshes the in-memory cache.
 * Uses UPDATE then INSERT to avoid a MERGE dependency.
 */
export async function updateSystemPrompt(newPrompt: string): Promise<void> {
    const prompt = newPrompt.trim();

    const updated = await queryDb(
        "UPDATE knowledge.system_prompts SET prompt = ?, updated_date = SYSDATETIME() WHERE name = ?",
        [prompt, PROMPT_NAME]
    );

    if (updated.rowsAffected[0] === 0) {
        await queryDb(
            "INSERT INTO knowledge.system_prompts (name, prompt, updated_date) VALUES (?, ?, SYSDATETIME())",
            [PROMPT_NAME, prompt]
        );
    }

    cachedPrompt = prompt;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    console.log("[SystemPrompt] Updated in DB.");
}
