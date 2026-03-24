// api/src/services/llm/anthropic.ts

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { LLMProvider } from "./provider.js";
import type {
  ChatParams,
  ChatWithToolsParams,
  ChatResponse,
  ChatMessage,
  ContentBlock,
  ToolDefinition,
} from "./types.js";
import { resolveModel, embeddingConfig } from "./models.js";

// --- Mapping functions (exported for testing) ---

export function toAnthropicMessages(
  messages: ChatMessage[]
): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as any,
    }));
}

export function toAnthropicTools(
  tools: ToolDefinition[]
): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
}

export function fromAnthropicResponse(response: {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
}): ChatResponse {
  const content: ContentBlock[] = response.content.map((block) => {
    if (block.type === "text") {
      return { type: "text" as const, text: block.text };
    }
    if (block.type === "tool_use") {
      return {
        type: "tool_use" as const,
        id: block.id,
        name: block.name,
        input: block.input,
      };
    }
    return { type: "text" as const, text: "" };
  });

  return {
    content,
    stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end",
  };
}

// --- Provider ---

export class AnthropicProvider implements LLMProvider {
  name = "anthropic" as const;

  private getClient(): Anthropic {
    return new Anthropic();
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const client = this.getClient();
    const response = await client.messages.create({
      model: resolveModel("anthropic", params.model),
      max_tokens: params.maxTokens,
      system: params.system,
      messages: toAnthropicMessages(params.messages),
    });
    return fromAnthropicResponse(response);
  }

  async chatWithTools(params: ChatWithToolsParams): Promise<ChatResponse> {
    const client = this.getClient();
    const response = await client.messages.create({
      model: resolveModel("anthropic", params.model),
      max_tokens: params.maxTokens,
      system: params.system,
      tools: toAnthropicTools(params.tools),
      messages: toAnthropicMessages(params.messages),
    });
    return fromAnthropicResponse(response);
  }

  async embed(text: string): Promise<number[] | null> {
    if (!process.env.OPENAI_API_KEY) return null;
    const client = new OpenAI();
    const { model, dimensions } = embeddingConfig();
    const response = await client.embeddings.create({ model, input: text, dimensions });
    return response.data[0].embedding;
  }
}
