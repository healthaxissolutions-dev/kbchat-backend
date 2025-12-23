// src/utils/blobClient.js
import {
  BlobServiceClient
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config.js";

const useMI = config.storage.useMI;
const accountName = config.storage.account;
const containerName = config.storage.container;

let blobServiceClient;

if (useMI) {
  console.log("[Blob] Using Managed Identity for authentication");

  const credential = new DefaultAzureCredential();

  blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

} else {
  console.log("[Blob] Using Connection String (local dev)");

  const connectionString = config.storage.connectionString;

  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is missing in .env");
  }

  blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
}

export const getContainer = () => {
  return blobServiceClient.getContainerClient(containerName);
};

export const getBlob = (blobName) => {
  return getContainer().getBlobClient(blobName);
};
