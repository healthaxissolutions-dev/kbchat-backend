// src/routes/documents.ts
// GET /api/documents/pdf?service=X&submodule=Y
// Downloads and serves a PDF from Azure Blob Storage.
// Results are cached in memory (default TTL: 10 minutes).

import express, { Request, Response } from "express";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
// @ts-ignore
import { config } from "../config.js";
// @ts-ignore
import { resolveServiceId } from "../services/serviceResolver.js";
// @ts-ignore
import { resolveDocuments } from "../services/documentResolver.js";

const router = express.Router();

/* -----------------------------------------------
   Blob client (mirrors setup in chat.js)
----------------------------------------------- */
const blobService =
    config.server.env === "production" && config.storage.useMI
        ? new BlobServiceClient(
            `https://${config.storage.account}.blob.core.windows.net`,
            new DefaultAzureCredential()
        )
        : BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING!);

async function downloadPdf(blobUrl: string): Promise<Buffer> {
    // blobUrl format: https://<account>.blob.core.windows.net/<container>/<path>
    const cleanUrl = blobUrl.replace("https://", "");
    const parts = cleanUrl.split("/");
    const containerName = parts[1];
    const blobName = parts.slice(2).join("/");

    const container = blobService.getContainerClient(containerName);
    const blob = container.getBlobClient(blobName);
    const download = await blob.download();

    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = download.readableStreamBody!;
        stream.on("data", (d: Buffer) => chunks.push(d));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

/* -----------------------------------------------
   In-memory PDF cache
----------------------------------------------- */
const CACHE_TTL_MS = parseInt(process.env.PDF_CACHE_TTL_MS ?? "600000", 10); // 10 min default

interface CacheEntry {
    buf: Buffer;
    filename: string;
    expiresAt: number;
}

const pdfCache = new Map<string, CacheEntry>();

function getCached(key: string): CacheEntry | null {
    const entry = pdfCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        pdfCache.delete(key);
        return null;
    }
    return entry;
}

function setCache(key: string, buf: Buffer, filename: string): void {
    pdfCache.set(key, { buf, filename, expiresAt: Date.now() + CACHE_TTL_MS });
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
            return res.status(400).json({ error: "'service' query param is required." });
        }

        const cacheKey = `${service}:${submodule}`;
        const cached = getCached(cacheKey);

        if (cached) {
            console.log(`[PDF cache HIT] ${cacheKey}`);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${cached.filename}"`);
            res.setHeader("X-Cache", "HIT");
            return res.send(cached.buf);
        }

        console.log(`[PDF cache MISS] ${cacheKey} — fetching from blob...`);

        /* -- Resolve service + documents -- */
        const serviceId = await resolveServiceId(service);
        const documents = await resolveDocuments(serviceId, submodule);

        if (documents.length === 0) {
            return res.status(404).json({
                error: "No documents found for this service/submodule.",
            });
        }

        /* -- Download the first document -- */
        const doc = documents[0];
        console.log(`🔗 [PDF Serving] Document ID: ${doc.document_id}, Blob Path: ${doc.blob_directory}`);
        const buf = await downloadPdf(doc.blob_directory);

        // Derive a clean filename from the blob path
        const blobParts = doc.blob_directory.split("/");
        const filename = blobParts[blobParts.length - 1] || `${service}-${submodule}.pdf`;

        setCache(cacheKey, buf, filename);
        console.log(`[PDF cache SET] ${cacheKey} (${buf.length} bytes, TTL ${CACHE_TTL_MS}ms)`);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("X-Cache", "MISS");
        return res.send(buf);
    } catch (err) {
        const error = err as Error;
        console.error("❌ PDF route error:", error.message);
        return res.status(500).json({ error: "Internal server error", detail: error.message });
    }
});

export default router;
