interface StorageShape {
  useMI: boolean;
  connectionString: string | null;
}

export function validateStorageConfig(cfg: { storage: StorageShape }): void {
  if (cfg.storage.useMI) {
    if (cfg.storage.connectionString) {
      console.warn("⚠ Ignoring AZURE_STORAGE_CONNECTION_STRING because AZURE_STORAGE_USE_MI=true");
    }
  } else {
    if (!cfg.storage.connectionString) {
      console.error("❌ AZURE_STORAGE_CONNECTION_STRING is required when AZURE_STORAGE_USE_MI=false");
      process.exit(1);
    }
  }
}
