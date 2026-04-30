import express, { Request, Response } from "express";
import { getBlobByUrl } from "../utils/blobClient.js";
import { resolveServiceId } from "../services/serviceResolver.js";
import { resolveDocuments } from "../services/documentResolver.js";
import { sendError } from "../utils/error.js";
import { config } from "../config.js";

const router = express.Router();

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
    // Move to end of Map (MRU position)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, buf: Buffer, filename: string): void {
    if (buf.length > this.maxBytes) return;
    if (this.map.has(key)) {
      this.evict(key);
    }
    // Evict oldest entries until there is room
    while (this.totalBytes + buf.length > this.maxBytes && this.map.size > 0) {
      const oldestKey = this.map.keys().next().value as string;
      this.evict(oldestKey);
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
        console.log(`[PDF cache SET] ${cacheKey} (${totalBytes} bytes)`);
      } else {
        console.log(`[PDF cache SKIP] ${cacheKey} — ${totalBytes} bytes exceeds max entry size`);
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
    const service = req.query.service as string | undefined;
    const submodule = (req.query.submodule as string | undefined) ?? "shared";

    console.log(`📂 [PDF Request] Service: ${service}, Submodule: ${submodule}`);

    if (!service || service.trim() === "") {
      return sendError(res, 400, "'service' query param is required.");
    }

    const cacheKey = `${service}:${submodule}`;
    const cached = pdfCache.get(cacheKey);

    if (cached) {
      console.log(`[PDF cache HIT] ${cacheKey}`);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${cached.filename}"`);
      res.setHeader("X-Cache", "HIT");
      return res.send(cached.buf);
    }

    console.log(`[PDF cache MISS] ${cacheKey} — fetching from blob...`);

    const serviceId = await resolveServiceId(service);
    const documents = await resolveDocuments(serviceId, submodule);

    if (documents.length === 0) {
      return sendError(res, 404, "No documents found for this service/submodule.");
    }

    const doc = documents[0];
    console.log(`🔗 [PDF Serving] Document ID: ${doc.document_id}, Blob Path: ${doc.blob_directory}`);

    const blobParts = doc.blob_directory.split("/");
    const filename = blobParts[blobParts.length - 1] || `${service}-${submodule}.pdf`;

    await servePdfFromBlob(doc.blob_directory, cacheKey, filename, res);
  } catch (err) {
    const error = err as Error;
    console.error("❌ PDF route error:", error.message);
    if (!res.headersSent) {
      sendError(res, 500, "Internal server error", error.message);
    }
  }
});

export default router;
