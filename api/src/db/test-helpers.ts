import pg from "pg";
import { readFileSync } from "fs";
import { join } from "path";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://youai:changeme@localhost:5432/youai_test";

let pool: pg.Pool | null = null;

export async function getTestDb(): Promise<pg.Pool> {
  if (pool) return pool;

  // Connect to default db to create test db
  const adminPool = new pg.Pool({
    connectionString: TEST_DB_URL.replace(/\/[^/]+$/, "/postgres"),
  });
  const dbName = new URL(TEST_DB_URL).pathname.slice(1);

  try {
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await adminPool.end();
  }

  pool = new pg.Pool({ connectionString: TEST_DB_URL });

  // Apply schema
  const schema = readFileSync(
    join(__dirname, "../../../postgres/init.sql"),
    "utf-8"
  );
  await pool.query(schema);

  return pool;
}

export async function cleanTestDb(db: pg.Pool): Promise<void> {
  await db.query("TRUNCATE contacts, interactions, sub_agents, briefings, chat_messages CASCADE");
}

export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
