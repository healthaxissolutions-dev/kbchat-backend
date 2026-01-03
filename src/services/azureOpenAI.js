// src/services/azureOpenAI.js

import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config.js";

const apiVersion = "2024-12-01-preview";
const endpoint = config.openai.endpoint;
const deployment = config.openai.deployment;

const isProd = config.server.env === "production";

export async function azureChat(messages) {
  let headers = {
    "Content-Type": "application/json",
  };

  // 🔐 PROD → Managed Identity
  if (isProd) {
    console.log("🔐 Azure OpenAI using Managed Identity");

    const credential = new DefaultAzureCredential();
    const token = await credential.getToken(
      "https://cognitiveservices.azure.com/.default"
    );

    headers.Authorization = `Bearer ${token.token}`;
  }
  // 🔑 LOCAL / DEV → API KEY
  else {
    console.log("🔑 Azure OpenAI using API key (local)");

    if (!config.openai.key) {
      throw new Error("AZURE_OPENAI_API_KEY is not set for local development");
    }

    headers["api-key"] = config.openai.key;
  }

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure OpenAI error ${res.status}: ${text}`);
  }

  return res.json();
}
