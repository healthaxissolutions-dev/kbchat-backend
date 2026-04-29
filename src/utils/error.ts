import type { Response } from "express";

/**
 * Send a consistent JSON error response.
 * `detail` (the raw error message) is included only outside production
 * to avoid leaking implementation details to clients.
 */
export function sendError(
  res: Response,
  status: number,
  message: string,
  detail?: string | null
): void {
  const body: Record<string, string> = { error: message };
  if (detail && process.env.NODE_ENV !== "production") {
    body.detail = detail;
  }
  res.status(status).json(body);
}
