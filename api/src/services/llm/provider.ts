// api/src/services/llm/provider.ts

import type { ChatParams, ChatWithToolsParams, ChatResponse } from "./types.js";

export interface LLMProvider {
  name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  chatWithTools(params: ChatWithToolsParams): Promise<ChatResponse>;
  embed(text: string): Promise<number[] | null>;
}
