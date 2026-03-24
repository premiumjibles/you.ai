import type { DB } from "../db/client.js";

const SENSITIVE_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GITHUB_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "EVOLUTION_API_KEY",
  "SETTINGS_ENCRYPTION_KEY",
  "VENICE_API_KEY",
]);

export async function getConfig(db: DB, key: string): Promise<string | undefined> {
  try {
    const { rows } = await db.query(
      "SELECT value FROM app_settings WHERE key = $1",
      [key]
    );
    if (rows.length > 0) return rows[0].value;
  } catch {
    // Table may not exist yet — fall through to env
  }
  return process.env[key];
}

export async function getAllSettings(db: DB): Promise<Record<string, string>> {
  const settings: Record<string, string> = {};
  try {
    const { rows } = await db.query("SELECT key, value FROM app_settings ORDER BY key");
    for (const row of rows) {
      settings[row.key] = SENSITIVE_KEYS.has(row.key) ? maskValue(row.value) : row.value;
    }
  } catch {
    // Table may not exist
  }
  return settings;
}

export async function upsertSetting(db: DB, key: string, value: string): Promise<void> {
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value]
  );
}

function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}
