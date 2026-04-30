import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { queryDb } from "../db.js";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE = join(__dirname, "../prompts/systemPrompt.txt");
const CACHE_TTL_MS = 5 * 60 * 1000;
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
 * Seeds the DB from the bundled file if the row is missing.
 * Falls back to the bundled file if the DB is unreachable.
 */
export async function getSystemPrompt(force = false): Promise<string> {
  const now = Date.now();
  if (!force && cachedPrompt !== null && now < cacheExpiry) {
    return cachedPrompt;
  }

  try {
    let prompt = await queryPrompt();

    if (prompt === null) {
      const seed = await readFromFile();
      try {
        await queryDb(
          "INSERT INTO knowledge.system_prompts (name, prompt, updated_date) VALUES (?, ?, SYSDATETIME())",
          [PROMPT_NAME, seed]
        );
        logger.info("System prompt seeded from bundled file");
      } catch (seedErr) {
        logger.warn({ err: seedErr }, "Could not seed system prompt to DB");
      }
      prompt = seed;
    }

    cachedPrompt = prompt;
    cacheExpiry = now + CACHE_TTL_MS;
    logger.debug("System prompt loaded from DB (cache refreshed)");
    return cachedPrompt;
  } catch (err) {
    logger.warn({ err }, "DB unavailable — falling back to bundled system prompt file");
    const fallback = await readFromFile();
    cachedPrompt = fallback;
    cacheExpiry = now + CACHE_TTL_MS;
    return fallback;
  }
}

/**
 * Persists a new system prompt to SQL and refreshes the in-memory cache.
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
  logger.info("System prompt updated in DB");
}
