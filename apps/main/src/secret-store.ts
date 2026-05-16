import electron from "electron";
const { safeStorage } = electron;
import type { CokiDatabase } from "@coki/engine";

export class SecretStore {
  constructor(private db: CokiDatabase) {}

  async load(): Promise<{ llmApiKey: string; tavilyApiKey: string }> {
    const llmKey = await this.getDecrypted("llm_api_key");
    const tavilyKey = await this.getDecrypted("tavily_api_key");
    return { llmApiKey: llmKey ?? "", tavilyApiKey: tavilyKey ?? "" };
  }

  async save(key: string, value: string): Promise<void> {
    if (await safeStorage.isEncryptionAvailable()) {
      const encrypted = await safeStorage.encryptString(value);
      // Store as base64-encoded BLOB
      // Access private db field via bracket notation — intentional for MVP
      (this.db as any)["db"]
        .prepare(
          `INSERT OR REPLACE INTO config (key, encrypted_value, updated_at) VALUES (?, ?, ?)`
        )
        .run(key, encrypted.toString("base64"), new Date().toISOString());
    } else {
      (this.db as any)["db"]
        .prepare(
          `INSERT OR REPLACE INTO config (key, plain_value, updated_at) VALUES (?, ?, ?)`
        )
        .run(key, value, new Date().toISOString());
    }
  }

  private async getDecrypted(key: string): Promise<string | null> {
    const row = (this.db as any)["db"]
      .prepare("SELECT encrypted_value, plain_value FROM config WHERE key = ?")
      .get(key) as { encrypted_value: string | null; plain_value: string | null } | undefined;

    if (!row) return null;

    if (row.encrypted_value) {
      const buffer = Buffer.from(row.encrypted_value, "base64");
      if (await safeStorage.isEncryptionAvailable()) {
        return await safeStorage.decryptString(buffer);
      }
    }

    return row.plain_value ?? null;
  }

  isConfigured(): { llm: boolean; tavily: boolean } {
    const llm = (this.db as any)["db"]
      .prepare("SELECT 1 FROM config WHERE key = ?")
      .get("llm_api_key") as unknown;
    const tavily = (this.db as any)["db"]
      .prepare("SELECT 1 FROM config WHERE key = ?")
      .get("tavily_api_key") as unknown;
    return { llm: !!llm, tavily: !!tavily };
  }
}
