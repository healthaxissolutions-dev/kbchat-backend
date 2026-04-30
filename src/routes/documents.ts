import express, { Request, Response } from "express";
import { z } from "zod";
import { getBlobByUrl } from "../utils/blobClient.js";
import { resolveServiceId } from "../services/serviceResolver.js";
import { resolveDocuments } from "../services/documentResolver.js";
import { sendError } from "../utils/error.js";
import { validateQuery } from "../utils/validate.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

const router = express.Router();

const PdfQuerySchema = z.object({
  service: z.string().min(1, "'service' query param is required"),
  submodule: z.string().optional().default("shared"),
});

/* -----------------------------------------------
   LRU PDF cache — bounded by total bytes
----------------------------------------------- */
interface CacheEntry {
  buf: Buffer;
  filename: string;
  expiresAt: number;
}

class LruCache {
  private readonly map = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly ttlMs: number
  ) {}

  get(key: string): CacheEntry | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.evict(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, buf: Buffer, filename: string): void {
    if (buf.length > this.maxBytes) return;
    if (this.map.has(key)) this.evict(key);
    while (this.totalBytes + buf.length > this.maxBytes && this.map.size > 0) {
      this.evict(this.map.keys().next().value as string);
    }
    this.map.set(key, { buf, filename, expiresAt: Date.now() + this.ttlMs });
    this.totalBytes += buf.length;
  }

  private evict(key: string): void {
    const entry = this.map.get(key);
    if (entry) {
      this.totalBytes -= entry.buf.length;
      this.map.delete(key);
    }
  }
}

const pdfCache = new LruCache(config.pdf.cacheMaxBytes, config.pdf.cacheTtlMs);

/* -----------------------------------------------
   Stream blob to response; opportunistically cache
   entries that fit within maxEntryBytes.
----------------------------------------------- */
async function servePdfFromBlob(
  blobUrl: string,
  cacheKey: string,
  filename: string,
  res: Response
): Promise<void> {
  const blob = getBlobByUrl(blobUrl);
  const download = await blob.download();
  const stream = download.readableStreamBody!;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("X-Cache", "MISS");
  if (download.contentLength != null) {
    res.setHeader("Content-Length", String(download.contentLength));
  }

  const maxEntry = config.pdf.maxEntryBytes;
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let overflow = false;

  await new Promise<void>((resolve, reject) => {
    res.on("close", () => {
      (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
      reject(new Error("Client disconnected"));
    });

    stream.on("data", (chunk: Buffer) => {
      res.write(chunk);
      if (!overflow) {
        totalBytes += chunk.length;
        if (totalBytes > maxEntry) {
          overflow = true;
          chunks.length = 0;
        } else {
          chunks.push(chunk);
        }
      }
    });

    stream.on("end", () => {
      res.end();
      if (!overflow) {
        pdfCache.set(cacheKey, Buffer.concat(chunks), filename);
        logger.debug({ cacheKey, bytes: totalBytes }, "PDF cache SET");
      } else {
        logger.debug({ cacheKey, bytes: totalBytes }, "PDF cache SKIP — exceeds max entry size");
      }
      resolve();
    });

    stream.on("error", reject);
  });
}

/* -----------------------------------------------
   GET /api/documents/pdf?service=X&submodule=Y
----------------------------------------------- */
router.get("/pdf", async (req: Request, res: Response) => {
  try {
    const query = validateQuery(PdfQuerySchema, req, res);
    if (!query) return;

    const { service, submodule } = query;
    logger.info({ service, submodule }, "PDF request");

    const cacheKey = `${service}:${submodule}`;
    const cached = pdfCache.get(cacheKey);

    if (cached) {
      logger.debug({ cacheKey }, "PDF cache HIT");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${cached.filename}"`);
      res.setHeader("X-Cache", "HIT");
      return res.send(cached.buf);
    }

    logger.debug({ cacheKey }, "PDF cache MISS — fetching from blob");

    const serviceId = await resolveServiceId(service);
    const documents = await resolveDocuments(serviceId, submodule);

    if (documents.length === 0) {
      return sendError(res, 404, "No documents found for this service/submodule.");
    }

    const doc = documents[0];
    logger.info({ documentId: doc.document_id, blobPath: doc.blob_directory }, "Serving PDF");

    const blobParts = doc.blob_directory.split("/");
    const filename = blobParts[blobParts.length - 1] || `${service}-${submodule}.pdf`;

    await servePdfFromBlob(doc.blob_directory, cacheKey, filename, res);
  } catch (err) {
    const error = err as Error;
    logger.error({ err: error }, "PDF route error");
    if (!res.headersSent) {
      sendError(res, 500, "Internal server error", error.message);
    }
  }
});

export default router;
