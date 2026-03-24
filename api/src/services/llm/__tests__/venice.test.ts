// api/src/services/llm/__tests__/venice.test.ts

import { describe, it, expect } from "vitest";
import {
  toOpenAIMessages,
  toOpenAITools,
  fromOpenAIResponse,
} from "../venice.js";
import type { ChatMessage, ToolDefinition } from "../types.js";

describe("VeniceProvider type mapping", () => {
  describe("toOpenAIMessages", () => {
    it("maps string content messages", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "hello" },
      ];
      const result = toOpenAIMessages(messages);
      expect(result).toEqual([{ role: "user", content: "hello" }]);
    });

    it("prepends system message from system param", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "hello" },
      ];
      const result = toOpenAIMessages(messages, "You are helpful");
      expect(result[0]).toEqual({ role: "system", content: "You are helpful" });
      expect(result[1]).toEqual({ role: "user", content: "hello" });
    });

    it("splits tool_result blocks into role:tool messages", () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "call_1", content: "result data" },
            { type: "tool_result", tool_use_id: "call_2", content: "more data" },
          ],
        },
      ];
      const result = toOpenAIMessages(messages);
      expect(result).toEqual([
        { role: "tool", tool_call_id: "call_1", content: "result data" },
        { role: "tool", tool_call_id: "call_2", content: "more data" },
      ]);
    });

    it("maps assistant tool_use blocks to tool_calls", () => {
      const messages: ChatMessage[] = [
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "call_1", name: "search", input: { q: "hi" } },
          ],
        },
      ];
      const result = toOpenAIMessages(messages);
      expect(result).toEqual([
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "search", arguments: '{"q":"hi"}' },
            },
          ],
        },
      ]);
    });

    it("maps assistant text blocks to content string", () => {
      const messages: ChatMessage[] = [
        {
          role: "assistant",
          content: [{ type: "text", text: "Hello there" }],
        },
      ];
      const result = toOpenAIMessages(messages);
      expect(result).toEqual([
        { role: "assistant", content: "Hello there" },
      ]);
    });
  });

  describe("toOpenAITools", () => {
    it("maps ToolDefinition to OpenAI function tool format", () => {
      const tools: ToolDefinition[] = [
        {
          name: "search",
          description: "Search contacts",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ];
      const result = toOpenAITools(tools);
      expect(result).toEqual([
        {
          type: "function",
          function: {
            name: "search",
            description: "Search contacts",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          },
        },
      ]);
    });
  });

  describe("fromOpenAIResponse", () => {
    it("maps text response", () => {
      const choice = {
        message: { role: "assistant" as const, content: "Hello" },
        finish_reason: "stop" as const,
      };
      const result = fromOpenAIResponse(choice);
      expect(result.content).toEqual([{ type: "text", text: "Hello" }]);
      expect(result.stopReason).toBe("end");
    });

    it("maps tool_calls response", () => {
      const choice = {
        message: {
          role: "assistant" as const,
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function" as const,
              function: { name: "search", arguments: '{"q":"hi"}' },
            },
          ],
        },
        finish_reason: "tool_calls" as const,
      };
      const result = fromOpenAIResponse(choice);
      expect(result.content).toEqual([
        { type: "tool_use", id: "call_1", name: "search", input: { q: "hi" } },
      ]);
      expect(result.stopReason).toBe("tool_use");
    });
  });
});
