import { describe, it, expect } from "vitest";
import { buildBriefingPrompt, buildOutreachPrompt, classifySearchIntent } from "../claude";

describe("claude prompt builders", () => {
  it("builds briefing consolidation prompt with history", () => {
    const prompt = buildBriefingPrompt(
      [{ name: "Markets", output: "BTC up 5%" }],
      [{ date: "2026-03-22", content: "BTC was stable..." }]
    );
    expect(prompt).toContain("BTC up 5%");
    expect(prompt).toContain("BTC was stable");
  });

  it("builds outreach prompt with contact context", () => {
    const prompt = buildOutreachPrompt(
      "intro to Melbourne real estate contacts",
      { name: "Janet Fring", company: "Meridian", notes: "RE investor" },
      [{ summary: "Met at conference 2025" }]
    );
    expect(prompt).toContain("Janet Fring");
    expect(prompt).toContain("conference");
  });
});

describe("classifySearchIntent", () => {
  it("exports classifySearchIntent function", () => {
    expect(typeof classifySearchIntent).toBe("function");
  });
});
