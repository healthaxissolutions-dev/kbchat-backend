// src/services/openaiClient.js

import OpenAI from "openai";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config.js";

function createOpenAIClient() {
  const baseURL = `${config.openai.endpoint}/openai/deployments`;
  const apiVersion = "2024-02-15-preview";

  // 🔐 PROD → Managed Identity
  if (config.server.env === "production") {
    console.log("🔐 Using Managed Identity for Azure OpenAI");

    const credential = new DefaultAzureCredential();

    return new OpenAI({
      baseURL,
      defaultQuery: { "api-version": apiVersion },

      // Required by SDK constructor
      apiKey: "managed-identity",

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
  }

  // 🔑 DEV → API Key
  console.log("🔑 Using API key for Azure OpenAI (dev)");

  return new OpenAI({
    apiKey: config.openai.key,
    baseURL,
    defaultQuery: { "api-version": apiVersion }
  });
}

export const openaiClient = createOpenAIClient();
