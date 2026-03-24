import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MessagingProvider } from "../messaging/index.js";

vi.mock("../config.js", () => ({
  getConfig: vi.fn(),
}));

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

function makeStubProvider(ownerAddress = "owner123"): MessagingProvider {
  return {
    name: "stub",
    init: vi.fn(),
    send: vi.fn(),
    parseIncoming: vi.fn(),
    getOwnerAddress: () => ownerAddress,
  };
}

function makeStubDb(queryResults: Record<string, any> = {}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("app_settings")) {
        return queryResults.app_settings || { rows: [] };
      }
      if (sql.includes("briefings")) {
        return queryResults.briefings || { rows: [{ count: "0" }] };
      }
      if (sql.includes("sub_agents")) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  } as any;
}

describe("getUserLocalTime", () => {
  it("converts UTC to Asia/Singapore (UTC+8)", async () => {
    const { getUserLocalTime } = await import("../scheduler.js");
    // 2026-03-24 00:00 UTC = 2026-03-24 08:00 SGT
    const now = new Date("2026-03-24T00:00:00Z");
    expect(getUserLocalTime(now, "Asia/Singapore")).toBe("08:00");
  });

  it("converts UTC to America/Los_Angeles (UTC-7 during PDT)", async () => {
    const { getUserLocalTime } = await import("../scheduler.js");
    // 2026-03-24 14:00 UTC = 2026-03-24 07:00 PDT
    const now = new Date("2026-03-24T14:00:00Z");
    expect(getUserLocalTime(now, "America/Los_Angeles")).toBe("07:00");
  });
});

describe("isWithinBriefingWindow", () => {
  it("returns true for exact match", async () => {
    const { isWithinBriefingWindow } = await import("../scheduler.js");
    expect(isWithinBriefingWindow("07:00", "07:00")).toBe(true);
  });

  it("returns true for 1 minute after", async () => {
    const { isWithinBriefingWindow } = await import("../scheduler.js");
    expect(isWithinBriefingWindow("07:00", "07:01")).toBe(true);
  });

  it("returns true for 4 minutes after", async () => {
    const { isWithinBriefingWindow } = await import("../scheduler.js");
    expect(isWithinBriefingWindow("07:00", "07:04")).toBe(true);
  });

  it("returns false for 5 minutes after", async () => {
    const { isWithinBriefingWindow } = await import("../scheduler.js");
    expect(isWithinBriefingWindow("07:00", "07:05")).toBe(false);
  });

  it("returns false for time before briefing", async () => {
    const { isWithinBriefingWindow } = await import("../scheduler.js");
    expect(isWithinBriefingWindow("07:00", "06:59")).toBe(false);
  });

  it("handles midnight rollover - briefing at 23:58, current 00:01", async () => {
    const { isWithinBriefingWindow } = await import("../scheduler.js");
    expect(isWithinBriefingWindow("23:58", "00:01")).toBe(true);
  });

  it("handles midnight rollover - briefing at 23:58, current 00:03 (5+ min)", async () => {
    const { isWithinBriefingWindow } = await import("../scheduler.js");
    expect(isWithinBriefingWindow("23:58", "00:03")).toBe(false);
  });
});

describe("heartbeat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not trigger briefing when briefing_time is not set", async () => {
    const { getConfig } = await import("../config.js");
    const { heartbeat } = await import("../scheduler.js");
    const db = makeStubDb();
    const provider = makeStubProvider();

    vi.mocked(getConfig).mockResolvedValue(undefined);

    await heartbeat(db, provider, "owner123");

    // Should not call runMorningBriefing (no send call)
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("queries app_settings for briefing_time and timezone", async () => {
    const { getConfig } = await import("../config.js");
    const { heartbeat } = await import("../scheduler.js");
    const db = makeStubDb();
    const provider = makeStubProvider();

    vi.mocked(getConfig).mockResolvedValue(undefined);

    await heartbeat(db, provider, "owner123");

    expect(getConfig).toHaveBeenCalledWith(db, "briefing_time");
    expect(getConfig).toHaveBeenCalledWith(db, "timezone");
  });

  it("always runs urgent alerts even when no briefing_time set", async () => {
    const { getConfig } = await import("../config.js");
    const { heartbeat } = await import("../scheduler.js");
    const db = makeStubDb();
    const provider = makeStubProvider();

    vi.mocked(getConfig).mockResolvedValue(undefined);

    await heartbeat(db, provider, "owner123");

    // runUrgentAlerts queries sub_agents
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("sub_agents"),
      expect.any(Array)
    );
  });

  it("triggers briefing when within window and no briefing exists today", async () => {
    // 2026-03-24T14:00Z = 07:00 PDT in America/Los_Angeles
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T14:00:00Z"));

    const { getConfig } = await import("../config.js");
    const { heartbeat } = await import("../scheduler.js");
    const db = makeStubDb({ briefings: { rows: [{ count: "0" }] } });
    const provider = makeStubProvider();

    vi.mocked(getConfig).mockImplementation(async (_db, key) => {
      if (key === "briefing_time") return "07:00";
      if (key === "timezone") return "America/Los_Angeles";
    });

    await heartbeat(db, provider, "owner123");

    // runMorningBriefing calls provider.send with the briefing content
    expect(provider.send).toHaveBeenCalledWith("owner123", expect.any(String));

    vi.useRealTimers();
  });

  it("skips briefing when one already exists today (dedup guard)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T14:00:00Z"));

    const { getConfig } = await import("../config.js");
    const { heartbeat } = await import("../scheduler.js");
    const db = makeStubDb({ briefings: { rows: [{ count: "1" }] } });
    const provider = makeStubProvider();

    vi.mocked(getConfig).mockImplementation(async (_db, key) => {
      if (key === "briefing_time") return "07:00";
      if (key === "timezone") return "America/Los_Angeles";
    });

    await heartbeat(db, provider, "owner123");

    // provider.send should not be called — no briefing, no urgent alerts (no sub_agents)
    expect(provider.send).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("always runs urgent alerts even when briefing is triggered", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T14:00:00Z"));

    const { getConfig } = await import("../config.js");
    const { heartbeat } = await import("../scheduler.js");
    const db = makeStubDb({ briefings: { rows: [{ count: "0" }] } });
    const provider = makeStubProvider();

    vi.mocked(getConfig).mockImplementation(async (_db, key) => {
      if (key === "briefing_time") return "07:00";
      if (key === "timezone") return "America/Los_Angeles";
    });

    await heartbeat(db, provider, "owner123");

    // runUrgentAlerts always queries sub_agents
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("sub_agents"),
      expect.any(Array)
    );

    vi.useRealTimers();
  });
});
