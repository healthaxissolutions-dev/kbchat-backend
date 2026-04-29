// src/utils/error.js

/**
 * Send a consistent JSON error response.
 * `detail` (the raw error message) is included only in non-production environments
 * to avoid leaking implementation details in production logs visible to clients.
 */
export function sendError(res, status, message, detail = null) {
  const body = { error: message };
  if (detail && process.env.NODE_ENV !== "production") {
    body.detail = detail;
  }
  return res.status(status).json(body);
}
