import { describe, it, expect } from "vitest";

describe("ics-parser", () => {
  it("module exports parseIcs function", async () => {
    const { parseIcs } = await import("../ics-parser.js");
    expect(typeof parseIcs).toBe("function");
  });
});
