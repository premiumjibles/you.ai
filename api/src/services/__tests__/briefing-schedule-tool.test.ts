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

describe("briefing_schedule tool", () => {
  let executeTool: typeof import("../agent.js")["executeTool"];
  let db: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();

    // Clear env vars that getConfig might fall back to
    delete process.env.briefing_time;
    delete process.env.timezone;

    const mod = await import("../agent.js");
    executeTool = mod.executeTool;

    db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  });

  it("get returns 'not set' when no settings exist", async () => {
    const result = await executeTool(db as any, "briefing_schedule", { action: "get" });
    const parsed = JSON.parse(result);
    expect(parsed.briefing_time).toBe("not set");
    expect(parsed.timezone).toBe("not set");
  });

  it("set upserts both briefing_time and timezone", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const result = await executeTool(db as any, "briefing_schedule", {
      action: "set",
      time: "07:00",
      timezone: "Asia/Singapore",
    });

    expect(result).toContain("07:00");
    expect(result).toContain("Asia/Singapore");

    // Verify INSERT INTO app_settings calls for both keys
    const upsertCalls = db.query.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO app_settings")
    );
    expect(upsertCalls.length).toBe(2);
    const keys = upsertCalls.map((call: any[]) => call[1][0]);
    expect(keys).toContain("briefing_time");
    expect(keys).toContain("timezone");
  });

  it("get returns stored values", async () => {
    db.query.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes("SELECT") && params?.[0] === "briefing_time") {
        return { rows: [{ value: "08:30" }] };
      }
      if (sql.includes("SELECT") && params?.[0] === "timezone") {
        return { rows: [{ value: "Europe/London" }] };
      }
      return { rows: [] };
    });

    const result = await executeTool(db as any, "briefing_schedule", { action: "get" });
    const parsed = JSON.parse(result);
    expect(parsed.briefing_time).toBe("08:30");
    expect(parsed.timezone).toBe("Europe/London");
  });

  it("set with time-only reuses existing timezone", async () => {
    db.query.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes("SELECT") && params?.[0] === "timezone") {
        return { rows: [{ value: "Asia/Singapore" }] };
      }
      return { rows: [] };
    });

    const result = await executeTool(db as any, "briefing_schedule", {
      action: "set",
      time: "09:00",
    });

    expect(result).toContain("09:00");
    expect(result).toContain("Asia/Singapore");

    // Should only upsert briefing_time, not timezone (since no new timezone provided)
    const upsertCalls = db.query.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO app_settings")
    );
    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0][1][0]).toBe("briefing_time");
  });

  it("set fails gracefully when no timezone provided and none stored", async () => {
    const result = await executeTool(db as any, "briefing_schedule", {
      action: "set",
      time: "07:00",
    });

    expect(result).toContain("timezone");
    // Should not have upserted anything
    const upsertCalls = db.query.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO app_settings")
    );
    expect(upsertCalls.length).toBe(0);
  });
});
