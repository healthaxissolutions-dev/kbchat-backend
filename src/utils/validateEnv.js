export function validateStorageConfig(config) {
  if (config.storage.useMI) {
    if (config.storage.connectionString) {
      console.warn("⚠ Ignoring AZURE_STORAGE_CONNECTION_STRING because AZURE_STORAGE_USE_MI=true");
    }
  } else {
    if (!config.storage.connectionString) {
      console.error("❌ AZURE_STORAGE_CONNECTION_STRING is required when AZURE_STORAGE_USE_MI=false");
      process.exit(1);
    }
  }
}
