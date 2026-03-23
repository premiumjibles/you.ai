import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers.js";
import type pg from "pg";

describe("briefings storage", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
  });
  afterAll(() => closeTestDb());
  beforeEach(() => cleanTestDb(db));

  it("stores a briefing and retrieves history", async () => {
    await db.query(
      "INSERT INTO briefings (user_id, date, content, sub_agent_outputs) VALUES ($1, $2, $3, $4)",
      ["sean", "2026-03-22", "BTC stable at 65k", JSON.stringify([{ name: "Markets", output: "BTC 65k" }])]
    );
    const { rows } = await db.query(
      "SELECT * FROM briefings WHERE user_id = $1 ORDER BY date DESC LIMIT 5",
      ["sean"]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("BTC stable at 65k");
  });
});
