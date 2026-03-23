import { describe, it, expect } from "vitest";

// Test the splitMbox helper by testing parseMbox with a simple mbox
// Since parseMbox needs a DB connection, test what we can without one

describe("mbox-parser", () => {
  it("module exports parseMbox function", async () => {
    const { parseMbox } = await import("../mbox-parser.js");
    expect(typeof parseMbox).toBe("function");
  });
});
