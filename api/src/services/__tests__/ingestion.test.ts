import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers.js";
import { upsertContact } from "../ingestion.js";
import type pg from "pg";

describe("upsertContact", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
  });
  afterAll(() => closeTestDb());
  beforeEach(() => cleanTestDb(db));

  it("creates a new contact when no duplicate exists", async () => {
    const result = await upsertContact(db, {
      name: "Janet Fring",
      email: "janet@meridian.com",
      company: "Meridian Capital",
      source: "gmail",
    });
    expect(result.action).toBe("created");
    expect(result.contact.name).toBe("Janet Fring");
  });

  it("merges with existing contact on email match", async () => {
    await upsertContact(db, {
      name: "Janet",
      email: "janet@meridian.com",
      source: "gmail",
    });
    const result = await upsertContact(db, {
      name: "Janet Fring",
      email: "janet@meridian.com",
      company: "Meridian Capital",
      role: "MD",
      source: "linkedin",
    });
    expect(result.action).toBe("merged");
    expect(result.contact.name).toBe("Janet Fring");
    expect(result.contact.company).toBe("Meridian Capital");
  });
});
