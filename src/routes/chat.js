import express from "express";
import OpenAI from "openai";
import axios from "axios";
import { queryDb } from "../db.js";
import PDFParser from "pdf2json";

import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

import { config } from "../config.js";   // ✅ FIXED IMPORT (named export)

const router = express.Router();

/* ---------------------------------------
   Azure OpenAI Client
---------------------------------------- */
const client = new OpenAI({
  apiKey: config.openai.key,
  baseURL: `${config.openai.endpoint}/openai/deployments/${config.openai.deployment}`,
  defaultQuery: { "api-version": "2024-02-15-preview" }
});

/* ---------------------------------------
   Blob Client — environment-aware
---------------------------------------- */
let blobService;

if (config.server.env === "production" && config.storage.useMI) {
  console.log("🔐 Using Managed Identity for Blob access");
  blobService = new BlobServiceClient(
    `https://${config.storage.account}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );
} else {
  console.log("🔑 Using connection string for Blob access");
  blobService = BlobServiceClient.fromConnectionString(
    config.storage.connectionString
  );
}

/* Convert readable stream → Buffer */
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", data => chunks.push(data));
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}

/* Download PDF */
async function downloadPdfFromBlob(blobUrl) {
  const cleanUrl = blobUrl.replace("https://", "");
  const parts = cleanUrl.split("/");
  const containerName = parts[1];
  const blobName = parts.slice(2).join("/");

  const container = blobService.getContainerClient(containerName);
  const blob = container.getBlobClient(blobName);

  const response = await blob.download();
  const buffer = await streamToBuffer(response.readableStreamBody);

  console.log("Downloaded PDF size:", buffer.length);
  console.log("PDF header:", buffer.slice(0, 20).toString());

  return buffer;
}

/* Helpers */
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/* Extract pages with skipping */
async function extractPages(buffer, fromPage = 1, toPage = null, skipPages = []) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", err => reject(err.parserError));

    pdfParser.on("pdfParser_dataReady", pdfData => {
      let text = "";

      const totalPages = pdfData.Pages.length;
      if (!toPage || toPage > totalPages) toPage = totalPages;

      const startIndex = fromPage - 1;
      const endIndex = toPage - 1;

      console.log("⏭️ Pages to skip:", skipPages);

      pdfData.Pages.forEach((page, index) => {
        const pageNum = index + 1;

        if (index < startIndex || index > endIndex) return;
        if (skipPages.includes(pageNum)) {
          console.log(`⏭️ Skipping page ${pageNum}`);
          return;
        }

        page.Texts.forEach(t => {
          t.R.forEach(run => {
            text += safeDecode(run.T) + " ";
          });
        });

        text += `\n\n--- END OF PAGE ${pageNum} ---\n\n`;
      });

      resolve(text.trim());
    });

    pdfParser.parseBuffer(buffer);
  });
}

/* ---------------------------------------
   CHAT ROUTE
---------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const { service, submodule, question, username } = req.body;

    if (!service || !question) {
      return res.status(400).json({ error: "service and question are required" });
    }

    /* Get service_id */
    const svc = await queryDb(
      "SELECT service_id FROM services WHERE service_name = ?",
      [service]
    );

    if (svc.recordset.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    const service_id = svc.recordset[0].service_id;

    /* Get document info including page_to_skip */
    const docs = await queryDb(
      `SELECT blob_directory, page_from_inclusive, page_to_inclusive, page_to_skip
       FROM service_documents
       WHERE service_id = ?
         AND service_submodule = ?
         AND deleted_date IS NULL`,
      [service_id, submodule]
    );

    if (docs.recordset.length === 0) {
      return res.status(404).json({ error: "No documents found for submodule" });
    }

    const doc = docs.recordset[0];

    /* Parse page_to_skip as array */
    let skipArray = [];
    try {
      if (doc.page_to_skip) {
        skipArray = JSON.parse(doc.page_to_skip);
        if (!Array.isArray(skipArray)) skipArray = [];
        skipArray = skipArray.map(n => Number(n)).filter(n => !isNaN(n));
      }
    } catch (e) {
      console.log("⚠ Could not parse page_to_skip, ignoring.", doc.page_to_skip);
    }

    console.log("Parsed skip pages:", skipArray);

    /* Download PDF */
    const pdfBuffer = await downloadPdfFromBlob(doc.blob_directory);

    /* Extract pages */
    const extractedText = await extractPages(
      pdfBuffer,
      Number(doc.page_from_inclusive),
      Number(doc.page_to_inclusive),
      skipArray
    );

    /* AI Prompt */
    const systemPrompt = `
You are a medical knowledge assistant.
Answer the user's question using ONLY the provided document pages.
If the answer is not found in the extracted content, respond:
"The document does not contain this information."

Extracted PDF pages:
${extractedText}
    `;

    /* Azure OpenAI call */
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question }
      ],
      model: config.openai.deployment   // ✅ updated to match config.js
    });

    const answer = completion.choices[0].message.content;

    /* Log chat */
    await queryDb(
      `INSERT INTO chat_logs (username, service_id, submodule, question, answer)
       VALUES (?, ?, ?, ?, ?)`,
      [username || null, service_id, submodule || null, question, answer]
    );

    res.json({ answer });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({
      error: "Internal server error",
      detail: err.message
    });
  }
});

export default router;
