// src/routes/chat.js

import express from "express";
import OpenAI from "openai";
import PDFParser from "pdf2json";

import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

import { config } from "../config.js";
import { queryDb } from "../db.js";

import { resolveServiceId } from "../services/serviceResolver.js";
import { resolveDocuments } from "../services/documentResolver.js";
import { buildPageFilter } from "../services/pageFilter.js";

const router = express.Router();

/* ---------------------------------------
   Azure OpenAI Client
---------------------------------------- */
const credential = new DefaultAzureCredential();

const client = new OpenAI({
  baseURL: `${config.openai.endpoint}/openai/deployments/${config.openai.deployment}`,
  defaultQuery: { "api-version": "2024-02-15-preview" },
  apiKey: undefined,
  fetch: async (url, options = {}) => {
    const token = await credential.getToken(
      "https://cognitiveservices.azure.com/.default"
    );

    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json"
    };

    return fetch(url, options);
  }
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

/* ---------------------------------------
   Blob helpers
---------------------------------------- */
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", d => chunks.push(d));
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}

async function downloadPdfFromBlob(blobUrl) {
  const cleanUrl = blobUrl.replace("https://", "");
  const parts = cleanUrl.split("/");
  const containerName = parts[1];
  const blobName = parts.slice(2).join("/");

  const container = blobService.getContainerClient(containerName);
  const blob = container.getBlobClient(blobName);

  const response = await blob.download();
  return streamToBuffer(response.readableStreamBody);
}

/* ---------------------------------------
   PDF helpers
---------------------------------------- */
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

async function extractPages(buffer, fromPage, toPage, skipPages) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", err =>
      reject(err.parserError)
    );

    pdfParser.on("pdfParser_dataReady", pdfData => {
      let text = "";

      const totalPages = pdfData.Pages.length;
      const start = Math.max(fromPage - 1, 0);
      const end = toPage ? Math.min(toPage - 1, totalPages - 1) : totalPages - 1;

      pdfData.Pages.forEach((page, index) => {
        const pageNum = index + 1;

        if (index < start || index > end) return;
        if (skipPages.includes(pageNum)) return;

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
      return res.status(400).json({
        error: "service and question are required"
      });
    }

    /* -----------------------------------
       1️⃣ Resolve service
    ----------------------------------- */
    const serviceId = await resolveServiceId(service);

    /* -----------------------------------
       2️⃣ Resolve documents
    ----------------------------------- */
    const documents = await resolveDocuments(serviceId, submodule);

    if (documents.length === 0) {
      return res.status(404).json({
        error: "No documents found for this service/submodule"
      });
    }

    /* -----------------------------------
       3️⃣ Extract content from ALL documents
    ----------------------------------- */
    let combinedText = "";

    for (const doc of documents) {
      const buffer = await downloadPdfFromBlob(doc.blob_directory);
      const pageConfig = buildPageFilter(doc);

      const extracted = await extractPages(
        buffer,
        pageConfig.fromPage,
        pageConfig.toPage,
        pageConfig.skipPages
      );

      combinedText += `
===== DOCUMENT ${doc.document_id} =====
${extracted}

`;
    }

    /* -----------------------------------
       4️⃣ AI Prompt
    ----------------------------------- */
    const systemPrompt = `
You are a medical knowledge assistant.

Answer the user's question using ONLY the provided document content.
If the answer cannot be found, respond exactly:
"The document does not contain this information."

DOCUMENT CONTENT:
${combinedText}
    `.trim();

    const completion = await client.chat.completions.create({
      model: config.openai.deployment,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question }
      ]
    });

    const answer = completion.choices[0].message.content;

    /* -----------------------------------
       5️⃣ Log chat
    ----------------------------------- */
    await queryDb(
      `
      INSERT INTO chat.logs
        (username, service_id, submodule, question, answer, created_date)
      VALUES (?, ?, ?, ?, ?, SYSDATETIME())
      `,
      [
        username || null,
        serviceId,
        submodule || null,
        question,
        answer
      ]
    );

    res.json({ answer });

  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).json({
      error: "Internal server error",
      detail: err.message
    });
  }
});

export default router;
