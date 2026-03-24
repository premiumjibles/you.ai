// api/src/services/llm/__tests__/factory.test.ts

import { describe, it, expect, afterEach } from "vitest";
import { getProvider } from "../index.js";
import { resolveModel } from "../models.js";

describe("getProvider factory", () => {
  const originalEnv = process.env.LLM_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = originalEnv;
    }
  });

  it("defaults to anthropic when LLM_PROVIDER is unset", () => {
    delete process.env.LLM_PROVIDER;
    const provider = getProvider();
    expect(provider.name).toBe("anthropic");
  });

  it("returns venice provider when LLM_PROVIDER=venice", () => {
    process.env.LLM_PROVIDER = "venice";
    const provider = getProvider();
    expect(provider.name).toBe("venice");
  });

  it("throws on unknown provider", () => {
    process.env.LLM_PROVIDER = "unknown";
    expect(() => getProvider()).toThrow("Unknown LLM provider: unknown");
  });
});

describe("resolveModel", () => {
  it("returns correct anthropic models", () => {
    expect(resolveModel("anthropic", "fast")).toBe("claude-haiku-4-5-20251001");
    expect(resolveModel("anthropic", "quality")).toBe("claude-sonnet-4-6");
  });

  it("returns correct venice models", () => {
    expect(resolveModel("venice", "fast")).toBe("grok-4-20-beta");
    expect(resolveModel("venice", "quality")).toBe("claude-sonnet-4-6");
  });
});
