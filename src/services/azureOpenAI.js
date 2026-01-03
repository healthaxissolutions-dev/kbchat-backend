// src/services/azureOpenAI.js

import { DefaultAzureCredential } from "@azure/identity";

const apiVersion = "2024-02-15-preview";
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

export async function azureChat(messages) {
  const credential = new DefaultAzureCredential();

  const token = await credential.getToken(
    "https://cognitiveservices.azure.com/.default"
  );

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
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
