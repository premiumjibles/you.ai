import { describe, it, expect } from "vitest";

describe("scheduler", () => {
  it("exports startScheduler function", async () => {
    const { startScheduler } = await import("../scheduler.js");
    expect(typeof startScheduler).toBe("function");
  });
});
