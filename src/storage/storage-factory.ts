/**
 * Storage Factory — Creates a FormBridgeStorage from environment variables.
 *
 * FORMBRIDGE_STORAGE=memory|sqlite|postgres (default: memory)
 * DATABASE_URL=postgresql://... (required for postgres)
 * SQLITE_PATH=./data/formbridge.db (optional for sqlite, default: :memory:)
 */

import type { FormBridgeStorage } from "./storage-interface.js";

export type StorageType = "memory" | "sqlite" | "postgres";

export interface StorageFactoryOptions {
  /** Override the storage type (defaults to FORMBRIDGE_STORAGE env var or 'memory') */
  type?: StorageType;
  /** Override DATABASE_URL for postgres */
  databaseUrl?: string;
  /** Override SQLITE_PATH for sqlite */
  sqlitePath?: string;
}

/**
 * Create and initialize a FormBridgeStorage based on environment variables.
 */
export async function createStorageFromEnv(
  options?: StorageFactoryOptions
): Promise<FormBridgeStorage> {
  const type = options?.type ?? (process.env.FORMBRIDGE_STORAGE as StorageType) ?? "memory";

  switch (type) {
    case "memory": {
      const { MemoryStorage } = await import("./memory-storage.js");
      const storage = new MemoryStorage();
      await storage.initialize();
      return storage;
    }

    case "sqlite": {
      const { SqliteStorage } = await import("./sqlite-storage.js");
      const dbPath = options?.sqlitePath ?? process.env.SQLITE_PATH ?? ":memory:";
      const storage = new SqliteStorage({ dbPath });
      await storage.initialize();
      return storage;
    }

    case "postgres": {
      const connectionString = options?.databaseUrl ?? process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error(
          "DATABASE_URL environment variable is required when FORMBRIDGE_STORAGE=postgres"
        );
      }
      const { PostgresStorage } = await import("./postgres-storage.js");
      const storage = new PostgresStorage({ connectionString });
      await storage.initialize();
      return storage;
    }

    default:
      throw new Error(
        `Unknown storage type: ${type}. Valid values: memory, sqlite, postgres`
      );
  }
}
