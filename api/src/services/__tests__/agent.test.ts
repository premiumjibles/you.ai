import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn().mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text: "mock response" }],
  });
  return {
    default: class {
      messages = { create };
    },
  };
});

describe("agent", () => {
  it("exports handleChatMessage function", async () => {
    const { handleChatMessage } = await import("../agent.js");
    expect(typeof handleChatMessage).toBe("function");
  });
});

describe("handleChatMessage history retrieval", () => {
  let handleChatMessage: typeof import("../agent.js")["handleChatMessage"];
  let querySpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    vi.mock("@anthropic-ai/sdk", () => {
      const create = vi.fn().mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "mock response" }],
      });
      return {
        default: class {
          messages = { create };
        },
      };
    });

    const mod = await import("../agent.js");
    handleChatMessage = mod.handleChatMessage;

    querySpy = vi.fn().mockResolvedValue({ rows: [] });
  });

  it("retrieves most recent messages using DESC subquery then ASC outer sort", async () => {
    const db = { query: querySpy } as any;

    await handleChatMessage(db, "session-1", "hello");

    const selectCall = querySpy.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("SELECT")
    );
    expect(selectCall).toBeDefined();
    const sql: string = selectCall![0];

    // Must use DESC in subquery to get most recent messages
    expect(sql).toMatch(/ORDER BY created_at DESC LIMIT/);
    // Must use ASC in outer query for chronological order
    expect(sql).toMatch(/ORDER BY created_at ASC/);
  });

  it("passes recent history to Claude, not oldest messages", async () => {
    // Simulate 25 messages — the query should return only the 20 most recent
    const recentMessages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message-${i + 5}`,
    }));

    const db = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) return { rows: recentMessages };
        return { rows: [] };
      }),
    } as any;

    await handleChatMessage(db, "session-1", "what was my last message?");

    // Verify the INSERT calls contain the new user message
    const insertCalls = db.query.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT")
    );
    expect(insertCalls.length).toBe(2);
    expect(insertCalls[0][1]).toContain("what was my last message?");
  });
});
