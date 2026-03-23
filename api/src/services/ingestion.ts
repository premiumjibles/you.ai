import type pg from "pg";
import { findDuplicate, mergeContacts } from "./dedup.js";
import { scrub } from "./scrubber.js";

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
  db: pg.Pool,
  input: ContactInput
): Promise<UpsertResult> {
  // Scrub PII from notes
  const scrubbed = {
    ...input,
    notes: input.notes ? scrub(input.notes) : null,
  };

  const existing = await findDuplicate(db, scrubbed);

  if (existing) {
    const merged = mergeContacts(existing, {
      ...scrubbed,
      source_databases: [scrubbed.source],
    });
    const { rows } = await db.query(
      `UPDATE contacts SET
        name = $1, company = $2, role = $3, location = $4,
        email = $5, phone = $6, linkedin_url = $7, notes = $8,
        source_databases = $9
      WHERE id = $10 RETURNING *`,
      [
        merged.name, merged.company, merged.role, merged.location,
        merged.email, merged.phone, merged.linkedin_url, merged.notes,
        merged.source_databases, existing.id,
      ]
    );
    return { action: "merged", contact: rows[0] };
  }

  const { rows } = await db.query(
    `INSERT INTO contacts (name, company, role, location, email, phone, linkedin_url, notes, source_databases)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      scrubbed.name, scrubbed.company, scrubbed.role, scrubbed.location,
      scrubbed.email, scrubbed.phone, scrubbed.linkedin_url, scrubbed.notes,
      [scrubbed.source],
    ]
  );
  return { action: "created", contact: rows[0] };
}
