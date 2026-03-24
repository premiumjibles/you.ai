import ical from "node-ical";
import type pg from "pg";
import { upsertContact } from "./ingestion.js";

interface ImportResult {
  contacts: number;
  interactions: number;
}

export async function parseIcs(buffer: Buffer, db: pg.Pool): Promise<ImportResult> {
  const text = buffer.toString("utf-8");
  const events = ical.sync.parseICS(text);

  const seen = new Set<string>();
  let contacts = 0;
  let interactions = 0;

  for (const [, event] of Object.entries(events)) {
    if (event.type !== "VEVENT") continue;

    const attendees = Array.isArray(event.attendee) ? event.attendee : event.attendee ? [event.attendee] : [];

    for (const attendee of attendees) {
      const email = typeof attendee === "string"
        ? attendee.replace("mailto:", "")
        : attendee?.val?.replace("mailto:", "") || null;
      if (!email) continue;

      const name = (typeof attendee === "object" && attendee?.params?.CN) || email.split("@")[0];

      if (!seen.has(email)) {
        seen.add(email);
        await upsertContact(db, {
          name: typeof name === "string" ? name : email.split("@")[0],
          email,
          source: "calendar",
        });
        contacts++;
      }

      const eventDate = event.start instanceof Date ? event.start.toISOString() : new Date().toISOString();
      const summary = String(event.summary || "(no title)");
      const groupId = (event as any).uid || null;

      await db.query(
        `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id)
         SELECT c.id, 'meeting', $1, $2, $3, $4
         FROM contacts c WHERE c.email = $5
         LIMIT 1`,
        [eventDate, summary, summary, groupId, email]
      );
      interactions++;
    }
  }

  return { contacts, interactions };
}
