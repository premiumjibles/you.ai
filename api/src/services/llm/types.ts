// api/src/services/llm/types.ts

export type ModelTier = "fast" | "quality";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ChatParams {
  model: ModelTier;
  maxTokens: number;
  messages: ChatMessage[];
  system?: string;
}

export interface ChatWithToolsParams extends ChatParams {
  tools: ToolDefinition[];
}

export interface ChatResponse {
  content: ContentBlock[];
  stopReason: "end" | "tool_use";
}
