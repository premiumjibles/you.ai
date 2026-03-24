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

  it("strips LinkedIn preamble rows before header", () => {
    const csv = `"Notes:","This file contains your LinkedIn connections data."
"Exported on:","15 Jan 2025"
""
First Name,Last Name,Email Address,Company,Position,Connected On
Alice,Chen,alice@example.com,Acme Corp,Engineer,10 Jan 2024
Bob,Smith,,Stripe,Designer,05 Mar 2023`;
    const contacts = parseContactsCsv(csv);
    expect(contacts).toHaveLength(2);
    expect(contacts[0].name).toBe("Alice Chen");
    expect(contacts[0].email).toBe("alice@example.com");
    expect(contacts[0].company).toBe("Acme Corp");
    expect(contacts[1].name).toBe("Bob Smith");
    expect(contacts[1].email).toBeNull();
  });

  it("parses Connected On dates", () => {
    const csv = `First Name,Last Name,Email Address,Connected On
Janet,Fring,janet@example.com,22 Mar 2025`;
    const contacts = parseContactsCsv(csv);
    expect(contacts[0].connected_on).toBe(new Date("22 Mar 2025").toISOString());
  });

  it("returns null connected_on for missing dates", () => {
    const csv = `First Name,Last Name,Email Address,Connected On
Janet,Fring,janet@example.com,`;
    const contacts = parseContactsCsv(csv);
    expect(contacts[0].connected_on).toBeNull();
  });

  it("handles unicode names", () => {
    const csv = `First Name,Last Name,Email Address,Company,Position
María,García López,maria@example.com,TechFund,Partner
René,Müller,rene@example.com,Databricks,Scientist`;
    const contacts = parseContactsCsv(csv);
    expect(contacts[0].name).toBe("María García López");
    expect(contacts[1].name).toBe("René Müller");
  });

  it("works with clean CSV (no preamble)", () => {
    const csv = `First Name,Last Name,Email Address
Alice,Chen,alice@example.com`;
    const contacts = parseContactsCsv(csv);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Alice Chen");
  });
});
