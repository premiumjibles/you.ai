import type { DB } from "../db/client.js";

type ValidationOk = { ok: true };
type ValidationFail = {
  ok: false;
  existingAgent: { id: string; name: string };
  overlappingItems: string[];
  suggestion: "merge";
};
export type ValidationResult = ValidationOk | ValidationFail;

const CONFIG_KEYS: Record<string, string> = {
  github_activity: "repos",
  market_tracker: "assets",
  financial_tracker: "symbols",
  rss_feed: "urls",
};

function getItems(config: any, type: string): string[] {
  const key = CONFIG_KEYS[type];
  if (key) return Array.isArray(config[key]) ? config[key] : [];

  if (type === "web_search") {
    if (Array.isArray(config.queries)) return config.queries;
    if (config.query) return [config.query];
    return [];
  }
  if (type === "custom") {
    return config.prompt ? [config.prompt] : [];
  }
  return [];
}

export async function validateSubAgent(
  db: DB,
  type: string,
  config: any,
  userId: string
): Promise<ValidationResult> {
  const { rows: existing } = await db.query(
    "SELECT id, name, config FROM sub_agents WHERE user_id = $1 AND type = $2 AND active = true",
    [userId, type]
  );

  if (existing.length === 0) return { ok: true };

  if (type === "network_activity") {
    return {
      ok: false,
      existingAgent: { id: existing[0].id, name: existing[0].name },
      overlappingItems: [],
      suggestion: "merge",
    };
  }

  const newItems = getItems(config, type);
  if (newItems.length === 0) return { ok: true };

  for (const agent of existing) {
    const existingItems = getItems(agent.config, type);
    const overlap = newItems.filter((item) => existingItems.includes(item));
    if (overlap.length > 0) {
      return {
        ok: false,
        existingAgent: { id: agent.id, name: agent.name },
        overlappingItems: overlap,
        suggestion: "merge",
      };
    }
  }

  return { ok: true };
}

export async function mergeSubAgentConfig(
  db: DB,
  existingId: string,
  newConfig: any,
  type: string
): Promise<void> {
  const { rows } = await db.query(
    "SELECT config FROM sub_agents WHERE id = $1",
    [existingId]
  );
  if (rows.length === 0) return;

  const existing = rows[0].config;
  const key = CONFIG_KEYS[type];

  if (key) {
    const existingItems: string[] = Array.isArray(existing[key]) ? existing[key] : [];
    const newItems: string[] = Array.isArray(newConfig[key]) ? newConfig[key] : [];
    existing[key] = [...new Set([...existingItems, ...newItems])];
  } else if (type === "web_search") {
    const existingQueries = Array.isArray(existing.queries)
      ? existing.queries
      : existing.query ? [existing.query] : [];
    const newQueries = Array.isArray(newConfig.queries)
      ? newConfig.queries
      : newConfig.query ? [newConfig.query] : [];
    existing.queries = [...new Set([...existingQueries, ...newQueries])];
    delete existing.query;
  }

  await db.query(
    "UPDATE sub_agents SET config = $1 WHERE id = $2",
    [JSON.stringify(existing), existingId]
  );
}
