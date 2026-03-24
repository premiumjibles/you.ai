import { describe, it, expect, vi, beforeEach } from "vitest";

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
