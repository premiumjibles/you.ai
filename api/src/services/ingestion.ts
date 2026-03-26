import type pg from "pg";
import { scrub } from "./scrubber.js";

type Queryable = pg.Pool | pg.PoolClient;

interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
  source: string;
}

interface UpsertResult {
  action: "created" | "merged";
  contact: any;
}

export async function upsertContact(
  db: Queryable,
  input: ContactInput
): Promise<UpsertResult> {
  const scrubbed = {
    ...input,
    notes: input.notes ? scrub(input.notes) : null,
  };

  const values = [
    scrubbed.name, scrubbed.company, scrubbed.role, scrubbed.location,
    scrubbed.email, scrubbed.phone, scrubbed.linkedin_url, scrubbed.notes,
    [scrubbed.source],
  ];

  // Pick conflict target based on available unique keys (priority: email > linkedin > phone)
  let conflictClause: string;
  if (scrubbed.email) {
    conflictClause = "(lower(email)) WHERE email IS NOT NULL";
  } else if (scrubbed.linkedin_url) {
    conflictClause = "(lower(linkedin_url)) WHERE linkedin_url IS NOT NULL";
  } else if (scrubbed.phone) {
    conflictClause = "(phone) WHERE phone IS NOT NULL";
  } else {
    // No unique key — just insert, no dedup possible
    const { rows } = await db.query(
      `INSERT INTO contacts (name, company, role, location, email, phone, linkedin_url, notes, source_databases)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      values
    );
    return { action: "created", contact: rows[0] };
  }

  const { rows } = await db.query(
    `INSERT INTO contacts (name, company, role, location, email, phone, linkedin_url, notes, source_databases)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT ${conflictClause}
     DO UPDATE SET
       name = CASE WHEN length(EXCLUDED.name) > length(COALESCE(contacts.name, '')) THEN EXCLUDED.name ELSE contacts.name END,
       company = COALESCE(contacts.company, EXCLUDED.company),
       role = COALESCE(contacts.role, EXCLUDED.role),
       location = COALESCE(contacts.location, EXCLUDED.location),
       email = COALESCE(contacts.email, EXCLUDED.email),
       phone = COALESCE(contacts.phone, EXCLUDED.phone),
       linkedin_url = COALESCE(contacts.linkedin_url, EXCLUDED.linkedin_url),
       notes = COALESCE(contacts.notes, EXCLUDED.notes),
       source_databases = (SELECT array_agg(DISTINCT s) FROM unnest(contacts.source_databases || EXCLUDED.source_databases) s)
     RETURNING *, (xmax = 0) AS was_inserted`,
    values
  );

  return {
    action: rows[0].was_inserted ? "created" : "merged",
    contact: rows[0],
  };
}
