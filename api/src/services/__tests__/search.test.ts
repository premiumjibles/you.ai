import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers";
import { searchContacts, SearchStrategy } from "../search";
import type pg from "pg";

describe("searchContacts", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
    // Seed test contacts
    await db.query(`
      INSERT INTO contacts (name, company, role, location, notes) VALUES
      ('Janet Fring', 'Meridian Capital', 'Managing Director', 'Melbourne', 'Real estate investor, DePIN enthusiast'),
      ('Bob Smith', 'Chainflip Labs', 'CTO', 'Berlin', 'DEX infrastructure, cross-chain bridges'),
      ('Alice Johnson', 'Vultisig', 'CEO', 'Singapore', 'MPC wallets, institutional custody'),
      ('Zhang Wei', 'Cathay Holdings', 'VP Strategy', 'Hong Kong', 'Family office, real estate, PE')
    `);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    // Don't truncate — we need the seeded data
  });

  describe("fuzzy name search (pg_trgm)", () => {
    it("finds exact name match", async () => {
      const results = await searchContacts(db, {
        strategy: "fuzzy_name",
        query: "Janet Fring",
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Janet Fring");
    });

    it("finds typo matches", async () => {
      const results = await searchContacts(db, {
        strategy: "fuzzy_name",
        query: "Jannet Frng",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("Janet Fring");
    });
  });

  describe("keyword search (full-text)", () => {
    it("finds by company name", async () => {
      const results = await searchContacts(db, {
        strategy: "keyword",
        query: "Meridian",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("Janet Fring");
    });

    it("finds by location", async () => {
      const results = await searchContacts(db, {
        strategy: "keyword",
        query: "Melbourne",
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("combined search", () => {
    it("merges results from multiple strategies", async () => {
      const results = await searchContacts(db, {
        strategy: "combined",
        query: "real estate Melbourne",
        strategies: ["keyword"],
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
