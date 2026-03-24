// api/src/services/llm/venice.ts

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

export function toOpenAIMessages(
  messages: ChatMessage[],
  system?: string
): any[] {
  const result: any[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    // System messages in the array are passed through (OpenAI accepts them inline)
    if (msg.role === "system") {
      const text = typeof msg.content === "string"
        ? msg.content
        : msg.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
      result.push({ role: "system", content: text });
      continue;
    }

    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    // Array content — needs translation
    if (msg.role === "user") {
      // Check if these are tool_result blocks
      const toolResults = msg.content.filter((b) => b.type === "tool_result");
      if (toolResults.length > 0) {
        for (const block of toolResults) {
          if (block.type !== "tool_result") continue;
          result.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: block.content,
          });
        }
        continue;
      }
      // Other user content — join text blocks
      const text = msg.content
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      result.push({ role: "user", content: text });
      continue;
    }

    if (msg.role === "assistant") {
      const toolUseBlocks = msg.content.filter((b) => b.type === "tool_use");
      const textContent = msg.content
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n") || null;

      if (toolUseBlocks.length > 0) {
        result.push({
          role: "assistant",
          content: textContent,
          tool_calls: toolUseBlocks.map((block) => {
            if (block.type !== "tool_use") throw new Error("unreachable");
            return {
              id: block.id,
              type: "function" as const,
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            };
          }),
        });
        continue;
      }
      result.push({ role: "assistant", content: textContent || "" });
    }
  }

  return result;
}

export function toOpenAITools(
  tools: ToolDefinition[]
): any[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function fromOpenAIResponse(choice: {
  message: { role: string; content: string | null; tool_calls?: any[] };
  finish_reason: string;
}): ChatResponse {
  const content: ContentBlock[] = [];

  // Include text content if present (even alongside tool_calls)
  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      });
    }
  }

  return {
    content,
    stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end",
  };
}

// --- Provider ---

export class VeniceProvider implements LLMProvider {
  name = "venice" as const;

  private getClient(): OpenAI {
    return new OpenAI({
      apiKey: process.env.VENICE_API_KEY,
      baseURL: "https://api.venice.ai/api/v1",
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: resolveModel("venice", params.model),
      max_tokens: params.maxTokens,
      messages: toOpenAIMessages(params.messages, params.system),
    });
    return fromOpenAIResponse(response.choices[0]);
  }

  async chatWithTools(params: ChatWithToolsParams): Promise<ChatResponse> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: resolveModel("venice", params.model),
      max_tokens: params.maxTokens,
      messages: toOpenAIMessages(params.messages, params.system),
      tools: toOpenAITools(params.tools),
    });
    return fromOpenAIResponse(response.choices[0]);
  }

  async embed(text: string): Promise<number[] | null> {
    if (!process.env.VENICE_API_KEY) return null;
    const client = this.getClient();
    const { model, dimensions } = embeddingConfig();
    const response = await client.embeddings.create({ model, input: text, dimensions });
    return response.data[0].embedding;
  }
}
