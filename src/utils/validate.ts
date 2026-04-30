import { ZodSchema } from "zod";
import { Request, Response } from "express";
import { sendError } from "./error.js";

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((e) => {
      const path = e.path.map(String).join(".");
      return path ? `${path}: ${e.message}` : e.message;
    })
    .join("; ");
}

export function validateBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    sendError(res, 400, formatIssues(result.error.issues as any));
    return null;
  }
  return result.data;
}

export function validateQuery<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    sendError(res, 400, formatIssues(result.error.issues as any));
    return null;
  }
  return result.data;
}
