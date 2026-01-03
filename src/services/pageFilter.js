// src/services/pageFilter.js

/**
 * Normalize page_to_skip from DB into an array of page numbers
 */
export function parsePageToSkip(raw) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(n => Number(n))
      .filter(n => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/**
 * Build page filter config for a document row
 */
export function buildPageFilter(doc) {
  return {
    fromPage: doc.page_from_inclusive ?? 1,
    toPage: doc.page_to_inclusive ?? null,
    skipPages: parsePageToSkip(doc.page_to_skip)
  };
}
