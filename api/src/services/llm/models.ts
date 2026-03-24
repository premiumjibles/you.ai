// api/src/services/llm/models.ts

import type { ModelTier } from "./types.js";

type ProviderName = "anthropic" | "venice";

const MODEL_CONFIG: Record<ProviderName, Record<ModelTier, string>> = {
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    quality: "claude-sonnet-4-6",
  },
  venice: {
    fast: "grok-4-20-beta",
    quality: "claude-sonnet-4-6",
  },
};

export function resolveModel(provider: ProviderName, tier: ModelTier): string {
  return MODEL_CONFIG[provider][tier];
}

export function embeddingConfig(): { model: string; dimensions: number } {
  return {
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1536"),
  };
}
