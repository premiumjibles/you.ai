import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers.js";
import { findDuplicate, mergeContacts } from "../dedup.js";
import type pg from "pg";

describe("dedup", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
  });
  afterAll(() => closeTestDb());
  beforeEach(() => cleanTestDb(db));

  describe("findDuplicate", () => {
    it("matches on email", async () => {
      await db.query(
        "INSERT INTO contacts (name, email) VALUES ('Janet Fring', 'janet@meridian.com')"
      );
      const match = await findDuplicate(db, { email: "janet@meridian.com", name: "J. Fring" });
      expect(match).not.toBeNull();
      expect(match!.name).toBe("Janet Fring");
    });

    it("matches on phone", async () => {
      await db.query(
        "INSERT INTO contacts (name, phone) VALUES ('Janet Fring', '+61412345678')"
      );
      const match = await findDuplicate(db, { phone: "+61412345678", name: "Janet" });
      expect(match).not.toBeNull();
    });

    it("matches on fuzzy name + company", async () => {
      await db.query(
        "INSERT INTO contacts (name, company) VALUES ('Janet Fring', 'Meridian Capital')"
      );
      const match = await findDuplicate(db, { name: "Janet Fring", company: "Meridian Capital" });
      expect(match).not.toBeNull();
    });

    it("returns null when no match", async () => {
      const match = await findDuplicate(db, { name: "Unknown Person", email: "nobody@example.com" });
      expect(match).toBeNull();
    });
  });

  describe("mergeContacts", () => {
    it("fills empty fields from new data", () => {
      const existing = { name: "Janet", company: "Meridian", role: null, location: null };
      const incoming = { name: "Janet Fring", company: null, role: "MD", location: "Melbourne" };
      const merged = mergeContacts(existing, incoming);
      expect(merged.name).toBe("Janet Fring"); // longer/newer wins
      expect(merged.company).toBe("Meridian"); // keep existing
      expect(merged.role).toBe("MD"); // fill blank
      expect(merged.location).toBe("Melbourne"); // fill blank
    });
  });
});
