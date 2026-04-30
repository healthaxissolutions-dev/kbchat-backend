import type { Response } from "express";
import { config } from "../config.js";

export function sendError(
  res: Response,
  status: number,
  message: string,
  detail?: string | null
): void {
  const body: Record<string, string> = { error: message };
  if (detail && config.server.env !== "production") {
    body.detail = detail;
  }
  res.status(status).json(body);
}
