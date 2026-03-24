import { describe, it, expect, vi } from "vitest";
import { validateSubAgent, mergeSubAgentConfig } from "../services/sub-agent-validation.js";

function mockDb(rows: any[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as any;
}

describe("validateSubAgent", () => {
  it("returns ok when no existing agents of same type", async () => {
    const db = mockDb([]);
    const result = await validateSubAgent(db, "github_activity", { repos: ["a/b"] }, "sean");
    expect(result).toEqual({ ok: true });
  });

  it("detects overlapping repos in github_activity", async () => {
    const db = mockDb([{ id: "123", name: "Existing", config: { repos: ["a/b", "c/d"] } }]);
    const result = await validateSubAgent(db, "github_activity", { repos: ["a/b", "e/f"] }, "sean");
    expect(result).toEqual({
      ok: false,
      existingAgent: { id: "123", name: "Existing" },
      overlappingItems: ["a/b"],
      suggestion: "merge",
    });
  });

  it("detects overlapping symbols in financial_tracker", async () => {
    const db = mockDb([{ id: "456", name: "Stocks", config: { symbols: ["AAPL", "MSFT"] } }]);
    const result = await validateSubAgent(db, "financial_tracker", { symbols: ["AAPL"] }, "sean");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.overlappingItems).toEqual(["AAPL"]);
  });

  it("detects duplicate network_activity (no config needed)", async () => {
    const db = mockDb([{ id: "789", name: "Network", config: {} }]);
    const result = await validateSubAgent(db, "network_activity", {}, "sean");
    expect(result.ok).toBe(false);
  });

  it("allows non-overlapping repos", async () => {
    const db = mockDb([{ id: "123", name: "Existing", config: { repos: ["a/b"] } }]);
    const result = await validateSubAgent(db, "github_activity", { repos: ["c/d"] }, "sean");
    expect(result).toEqual({ ok: true });
  });

  it("detects overlapping assets in market_tracker", async () => {
    const db = mockDb([{ id: "111", name: "Crypto", config: { assets: ["bitcoin"] } }]);
    const result = await validateSubAgent(db, "market_tracker", { assets: ["bitcoin", "ethereum"] }, "sean");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.overlappingItems).toEqual(["bitcoin"]);
  });

  it("detects overlapping urls in rss_feed", async () => {
    const db = mockDb([{ id: "222", name: "RSS", config: { urls: ["https://example.com/feed"] } }]);
    const result = await validateSubAgent(db, "rss_feed", { urls: ["https://example.com/feed"] }, "sean");
    expect(result.ok).toBe(false);
  });

  it("detects matching query in web_search", async () => {
    const db = mockDb([{ id: "333", name: "Search", config: { query: "AI news" } }]);
    const result = await validateSubAgent(db, "web_search", { query: "AI news" }, "sean");
    expect(result.ok).toBe(false);
  });

  it("detects matching prompt in custom", async () => {
    const db = mockDb([{ id: "444", name: "Custom", config: { prompt: "Summarize macro" } }]);
    const result = await validateSubAgent(db, "custom", { prompt: "Summarize macro" }, "sean");
    expect(result.ok).toBe(false);
  });
});

describe("mergeSubAgentConfig", () => {
  it("merges new repos into existing config", async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ config: { repos: ["a/b"] } }] })
        .mockResolvedValueOnce({ rows: [{ id: "123", config: { repos: ["a/b", "c/d"] } }] }),
    } as any;
    await mergeSubAgentConfig(db, "123", { repos: ["a/b", "c/d"] }, "github_activity");
    expect(db.query).toHaveBeenCalledTimes(2);
    const updateCall = db.query.mock.calls[1];
    expect(JSON.parse(updateCall[1][0])).toEqual({ repos: ["a/b", "c/d"] });
  });
});
