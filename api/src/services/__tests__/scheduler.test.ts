import { describe, it, expect, vi } from "vitest";
import type { MessagingProvider } from "../messaging/index.js";

function makeStubProvider(ownerAddress = ""): MessagingProvider {
  return {
    name: "stub",
    init: vi.fn(),
    send: vi.fn(),
    parseIncoming: vi.fn(),
    getOwnerAddress: () => ownerAddress,
  };
}

describe("scheduler", () => {
  it("exports startScheduler function", async () => {
    const { startScheduler } = await import("../scheduler.js");
    expect(typeof startScheduler).toBe("function");
  });

  it("startScheduler accepts db and provider parameters", async () => {
    const { startScheduler } = await import("../scheduler.js");
    // Should accept two arguments: db pool and messaging provider
    expect(startScheduler.length).toBe(2);
  });

  it("skips cron jobs when owner address is empty", async () => {
    const { startScheduler } = await import("../scheduler.js");
    const provider = makeStubProvider("");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Should not throw, just log and return
    startScheduler({} as any, provider);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("owner address not set")
    );
    consoleSpy.mockRestore();
  });
});
