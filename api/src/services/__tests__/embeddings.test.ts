import { describe, it, expect } from "vitest";
import { buildEmbeddingText } from "../embeddings";

describe("buildEmbeddingText", () => {
  it("concatenates non-null contact fields", () => {
    const text = buildEmbeddingText({
      name: "Janet Fring",
      role: "Managing Director",
      company: "Meridian Capital",
      location: "Melbourne",
      notes: "Real estate investor",
    });
    expect(text).toBe("Janet Fring Managing Director Meridian Capital Melbourne Real estate investor");
  });

  it("skips null fields", () => {
    const text = buildEmbeddingText({
      name: "Bob",
      role: null,
      company: null,
      location: null,
      notes: null,
    });
    expect(text).toBe("Bob");
  });
});
