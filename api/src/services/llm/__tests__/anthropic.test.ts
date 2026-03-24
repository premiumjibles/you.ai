// api/src/services/llm/__tests__/anthropic.test.ts

import { describe, it, expect } from "vitest";
import {
  toAnthropicMessages,
  toAnthropicTools,
  fromAnthropicResponse,
} from "../anthropic.js";
import type { ChatMessage, ToolDefinition } from "../types.js";

describe("AnthropicProvider type mapping", () => {
  describe("toAnthropicMessages", () => {
    it("maps string content messages", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "hello" },
      ];
      const result = toAnthropicMessages(messages);
      expect(result).toEqual([{ role: "user", content: "hello" }]);
    });

    it("maps tool_result content blocks", () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "result text" },
          ],
        },
      ];
      const result = toAnthropicMessages(messages);
      expect(result).toEqual([
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "result text" },
          ],
        },
      ]);
    });

    it("maps assistant messages with tool_use blocks", () => {
      const messages: ChatMessage[] = [
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "search", input: { q: "hi" } },
          ],
        },
      ];
      const result = toAnthropicMessages(messages);
      expect(result).toEqual([
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "search", input: { q: "hi" } },
          ],
        },
      ]);
    });
  });

  describe("toAnthropicTools", () => {
    it("maps parameters to input_schema", () => {
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
      const result = toAnthropicTools(tools);
      expect(result[0].name).toBe("search");
      expect(result[0].description).toBe("Search contacts");
      expect(result[0].input_schema).toEqual({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      });
    });
  });

  describe("fromAnthropicResponse", () => {
    it("maps text blocks", () => {
      const response = {
        content: [{ type: "text" as const, text: "Hello", citations: null }],
        stop_reason: "end_turn" as const,
      };
      const result = fromAnthropicResponse(response);
      expect(result.content).toEqual([{ type: "text", text: "Hello" }]);
      expect(result.stopReason).toBe("end");
    });

    it("maps tool_use blocks", () => {
      const response = {
        content: [
          { type: "tool_use" as const, id: "t1", name: "search", input: { q: "hi" } },
        ],
        stop_reason: "tool_use" as const,
      };
      const result = fromAnthropicResponse(response);
      expect(result.content).toEqual([
        { type: "tool_use", id: "t1", name: "search", input: { q: "hi" } },
      ]);
      expect(result.stopReason).toBe("tool_use");
    });
  });
});
