import { BlobServiceClient, ContainerClient, BlobClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config.js";

let blobServiceClient: BlobServiceClient;

if (config.storage.useMI) {
  console.log("[Blob] Using Managed Identity for authentication");
  blobServiceClient = new BlobServiceClient(
    `https://${config.storage.account}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );
} else {
  console.log("[Blob] Using Connection String (local dev)");
  if (!config.storage.connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is missing in .env");
  }
  blobServiceClient = BlobServiceClient.fromConnectionString(config.storage.connectionString);
}

export const getContainer = (): ContainerClient =>
  blobServiceClient.getContainerClient(config.storage.container);

export const getBlob = (blobName: string): BlobClient =>
  getContainer().getBlobClient(blobName);

export const getBlobByUrl = (blobUrl: string): BlobClient => {
  const withoutScheme = blobUrl.replace("https://", "");
  const parts = withoutScheme.split("/");
  const container = parts[1];
  const blobName = parts.slice(2).join("/");
  return blobServiceClient.getContainerClient(container).getBlobClient(blobName);
};
