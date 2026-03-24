// api/src/services/llm/index.ts

import type { LLMProvider } from "./provider.js";
import type {
  ChatParams,
  ChatWithToolsParams,
  ChatResponse,
} from "./types.js";
import { AnthropicProvider } from "./anthropic.js";

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

// Stub providers — replaced in Tasks 3 & 4
class StubVeniceProvider implements LLMProvider {
  name = "venice" as const;
  async chat(_p: ChatParams): Promise<ChatResponse> { throw new Error("Not implemented"); }
  async chatWithTools(_p: ChatWithToolsParams): Promise<ChatResponse> { throw new Error("Not implemented"); }
  async embed(_t: string): Promise<number[] | null> { return null; }
}

export function getProvider(): LLMProvider {
  const name = process.env.LLM_PROVIDER || "anthropic";
  switch (name) {
    case "anthropic":
      return new AnthropicProvider();
    case "venice":
      return new StubVeniceProvider();
    default:
      throw new Error(`Unknown LLM provider: ${name}. Use 'anthropic' or 'venice'.`);
  }
}
