import type pg from "pg";

interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  [key: string]: any;
}

export async function findDuplicate(
  db: pg.Pool,
  input: ContactInput
): Promise<any | null> {
  // 1. Email match (highest confidence)
  if (input.email) {
    const { rows } = await db.query(
      "SELECT * FROM contacts WHERE email = $1 LIMIT 1",
      [input.email]
    );
    if (rows[0]) return rows[0];
  }

  // 2. Phone match
  if (input.phone) {
    const { rows } = await db.query(
      "SELECT * FROM contacts WHERE phone = $1 LIMIT 1",
      [input.phone]
    );
    if (rows[0]) return rows[0];
  }

  // 3. Fuzzy name + company match
  if (input.name && input.company) {
    const { rows } = await db.query(
      `SELECT *, similarity(name, $1) AS name_sim
       FROM contacts
       WHERE similarity(name, $1) > 0.8
         AND company IS NOT NULL
         AND lower(company) = lower($2)
       ORDER BY name_sim DESC
       LIMIT 1`,
      [input.name, input.company]
    );
    if (rows[0]) return rows[0];
  }

  return null;
}

export function mergeContacts(existing: any, incoming: any): any {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null) continue;
    if (key === "source_databases") {
      // Append sources
      merged.source_databases = [
        ...new Set([...(existing.source_databases || []), ...(Array.isArray(value) ? value : [value])]),
      ];
      continue;
    }
    // Fill empty fields, or prefer longer/newer string values
    if (existing[key] == null) {
      merged[key] = value;
    } else if (typeof value === "string" && typeof existing[key] === "string" && value.length > existing[key].length) {
      merged[key] = value;
    }
  }
  return merged;
}
