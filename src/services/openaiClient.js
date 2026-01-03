// src/services/openaiClient.js

import OpenAI from "openai";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config.js";

function createOpenAIClient() {
  const baseURL = `${config.openai.endpoint}/openai/deployments/${config.openai.deployment}`;
  const apiVersion = "2024-07-18-preview";

  // 🔐 PROD → Managed Identity
  if (config.server.env === "production") {
    console.log("🔐 Using Managed Identity for Azure OpenAI");

    const credential = new DefaultAzureCredential();

    return new OpenAI({
      // ❗ REQUIRED to bypass SDK constructor check
      apiKey: "DUMMY_KEY_NOT_USED",

      baseURL,
      defaultQuery: { "api-version": apiVersion },

      // ✅ ACTUAL auth used
      azureADTokenProvider: async () => {
        const token = await credential.getToken(
          "https://cognitiveservices.azure.com/.default"
        );
        return token.token;
      }
    });
  }

  // 🔑 DEV / LOCAL → API Key
  console.log("🔑 Using API key for Azure OpenAI (dev)");

  return new OpenAI({
    apiKey: config.openai.key,
    baseURL,
    defaultQuery: { "api-version": apiVersion }
  });
}

export const openaiClient = createOpenAIClient();
