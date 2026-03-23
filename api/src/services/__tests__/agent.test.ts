import { describe, it, expect } from "vitest";

describe("agent", () => {
  it("exports handleChatMessage function", async () => {
    const { handleChatMessage } = await import("../agent.js");
    expect(typeof handleChatMessage).toBe("function");
  });
});
