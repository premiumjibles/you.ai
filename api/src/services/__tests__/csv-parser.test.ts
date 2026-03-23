import { describe, it, expect } from "vitest";
import { parseContactsCsv } from "../csv-parser.js";

describe("parseContactsCsv", () => {
  it("parses LinkedIn export format", () => {
    const csv = `First Name,Last Name,Email Address,Company,Position,Connected On
Janet,Fring,janet@meridian.com,Meridian Capital,Managing Director,22 Mar 2025`;
    const contacts = parseContactsCsv(csv);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Janet Fring");
    expect(contacts[0].email).toBe("janet@meridian.com");
    expect(contacts[0].company).toBe("Meridian Capital");
    expect(contacts[0].role).toBe("Managing Director");
  });

  it("handles missing fields gracefully", () => {
    const csv = `First Name,Last Name,Email Address
Bob,,bob@example.com`;
    const contacts = parseContactsCsv(csv);
    expect(contacts[0].name).toBe("Bob");
  });
});
