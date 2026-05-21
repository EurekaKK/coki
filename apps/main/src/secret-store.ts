import electron from "electron";
const { safeStorage } = electron;
import type { CokiDatabase } from "@coki/engine";

export class SecretStore {
  constructor(private db: CokiDatabase) {}

  async load(): Promise<{ llmApiKey: string; tavilyApiKey: string; zhipuApiKey: string }> {
    const llmKey = await this.getDecrypted("llm_api_key");
    const tavilyKey = await this.getDecrypted("tavily_api_key");
    const zhipuKey = await this.getDecrypted("zhipu_api_key");
    return { llmApiKey: llmKey ?? "", tavilyApiKey: tavilyKey ?? "", zhipuApiKey: zhipuKey ?? "" };
  }

  async save(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();
    if (await safeStorage.isEncryptionAvailable()) {
      const encrypted = await safeStorage.encryptString(value);
      // Store both encrypted (for app) and plain (for test/dev tooling)
      (this.db as any)["db"]
        .prepare(
          `INSERT OR REPLACE INTO config (key, encrypted_value, plain_value, updated_at) VALUES (?, ?, ?, ?)`
        )
        .run(key, encrypted.toString("base64"), value, now);
    } else {
      (this.db as any)["db"]
        .prepare(
          `INSERT OR REPLACE INTO config (key, plain_value, updated_at) VALUES (?, ?, ?)`
        )
        .run(key, value, now);
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

  isConfigured(): { llm: boolean; tavily: boolean; zhipu: boolean } {
    const llm = (this.db as any)["db"]
      .prepare("SELECT 1 FROM config WHERE key = ?")
      .get("llm_api_key") as unknown;
    const tavily = (this.db as any)["db"]
      .prepare("SELECT 1 FROM config WHERE key = ?")
      .get("tavily_api_key") as unknown;
    const zhipu = (this.db as any)["db"]
      .prepare("SELECT 1 FROM config WHERE key = ?")
      .get("zhipu_api_key") as unknown;
    return { llm: !!llm, tavily: !!tavily, zhipu: !!zhipu };
  }

  /** Load non-secret config values (baseUrl, models) from the config table. */
  loadConfig(): Record<string, string> {
    const rows = (this.db as any)["db"]
      .prepare("SELECT key, plain_value FROM config WHERE key NOT LIKE '%api_key%'")
      .all() as { key: string; plain_value: string | null }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.plain_value != null) {
        result[row.key] = row.plain_value;
      }
    }
    return result;
  }

  /** Save a non-secret config value as plain text. */
  saveConfig(key: string, value: string): void {
    (this.db as any)["db"]
      .prepare(
        `INSERT OR REPLACE INTO config (key, plain_value, updated_at) VALUES (?, ?, ?)`
      )
      .run(key, value, new Date().toISOString());
  }

  /** Backfill plain_value for keys that only have encrypted_value. */
  async backfillPlainValues(): Promise<void> {
    const rows = (this.db as any)["db"]
      .prepare("SELECT key, encrypted_value, plain_value FROM config WHERE key LIKE '%api_key%'")
      .all() as { key: string; encrypted_value: string | null; plain_value: string | null }[];

    for (const row of rows) {
      if (row.encrypted_value && !row.plain_value) {
        try {
          if (await safeStorage.isEncryptionAvailable()) {
            const buffer = Buffer.from(row.encrypted_value, "base64");
            const plain = await safeStorage.decryptString(buffer);
            (this.db as any)["db"]
              .prepare("UPDATE config SET plain_value = ? WHERE key = ?")
              .run(plain, row.key);
          }
        } catch {
          // Ignore decryption failures
        }
      }
    }
  }
}
