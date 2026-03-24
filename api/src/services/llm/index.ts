// api/src/services/llm/index.ts

import type { LLMProvider } from "./provider.js";
import type {
  ChatParams,
  ChatWithToolsParams,
  ChatResponse,
} from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { VeniceProvider } from "./venice.js";

export type { LLMProvider } from "./provider.js";
export type {
  ModelTier,
  ContentBlock,
  ChatMessage,
  ToolDefinition,
  ChatParams,
  ChatWithToolsParams,
  ChatResponse,
} from "./types.js";
export { resolveModel } from "./models.js";

export function getProvider(): LLMProvider {
  const name = process.env.LLM_PROVIDER || "anthropic";
  switch (name) {
    case "anthropic":
      return new AnthropicProvider();
    case "venice":
      return new VeniceProvider();
    default:
      throw new Error(`Unknown LLM provider: ${name}. Use 'anthropic' or 'venice'.`);
  }
}
