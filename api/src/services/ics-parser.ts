import ical from "node-ical";
import type pg from "pg";
import { upsertContact } from "./ingestion.js";

interface ImportResult {
  contacts: number;
  interactions: number;
}

function extractEmail(attendee: any): string | null {
  const raw = typeof attendee === "string" ? attendee : attendee?.val;
  return raw?.replace("mailto:", "") || null;
}

function extractName(attendee: any, email: string): string {
  const cn = typeof attendee === "object" ? attendee?.params?.CN : null;
  return typeof cn === "string" ? cn : email.split("@")[0];
}

function shouldSkipAttendee(attendee: any): boolean {
  if (typeof attendee !== "object" || !attendee?.params) return false;
  const cutype = attendee.params.CUTYPE;
  if (cutype === "ROOM" || cutype === "RESOURCE") return true;
  const partstat = attendee.params.PARTSTAT;
  if (partstat === "DECLINED") return true;
  return false;
}

function buildRawContent(event: any): string {
  const parts = [
    `Summary: ${event.summary || "(no title)"}`,
    event.location ? `Location: ${event.location}` : null,
    event.description ? `Description: ${String(event.description).slice(0, 2000)}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

export async function parseIcs(filePath: string, db: pg.Pool): Promise<ImportResult> {
  const events = await ical.async.parseFile(filePath);

  const seen = new Set<string>();
  let contacts = 0;
  let interactions = 0;

  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();

  for (const [, event] of Object.entries(events)) {
    if (event.type !== "VEVENT") continue;
    if ((event as any).status === "CANCELLED") continue;

    const summary = String((event as any).summary || "(no title)");
    const rawContent = buildRawContent(event);
    const baseUid = (event as any).uid || null;

    // Collect occurrence dates (single or expanded from RRULE)
    const dates: Date[] = [];
    const rrule = (event as any).rrule;
    if (rrule && typeof rrule.between === "function") {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const now = new Date();
      const occurrences = rrule.between(twoYearsAgo, now, true);
      dates.push(...occurrences);
    }
    if (dates.length === 0) {
      const start = (event as any).start;
      dates.push(start instanceof Date ? start : new Date());
    }

    // Collect participants: attendees + organizer
    const participants: { email: string; name: string }[] = [];

    const attendees = Array.isArray((event as any).attendee)
      ? (event as any).attendee
      : (event as any).attendee ? [(event as any).attendee] : [];

    for (const attendee of attendees) {
      if (shouldSkipAttendee(attendee)) continue;
      const email = extractEmail(attendee);
      if (!email) continue;
      if (ownerEmail && email.toLowerCase() === ownerEmail) continue;
      participants.push({ email, name: extractName(attendee, email) });
    }

    // Extract organizer
    const organizer = (event as any).organizer;
    if (organizer) {
      const orgEmail = extractEmail(organizer);
      if (orgEmail && !(ownerEmail && orgEmail.toLowerCase() === ownerEmail)) {
        const orgName = extractName(organizer, orgEmail);
        if (!participants.some((p) => p.email === orgEmail)) {
          participants.push({ email: orgEmail, name: orgName });
        }
      }
    }

    for (const participant of participants) {
      if (!seen.has(participant.email)) {
        seen.add(participant.email);
        await upsertContact(db, {
          name: participant.name,
          email: participant.email,
          source: "calendar",
        });
        contacts++;
      }

      for (const date of dates) {
        const eventDate = date.toISOString();
        const groupId = baseUid ? `${baseUid}-${eventDate}` : null;

        await db.query(
          `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id)
           SELECT c.id, 'meeting', $1, $2, $3, $4
           FROM contacts c WHERE c.email = $5
           LIMIT 1
           ON CONFLICT (contact_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`,
          [eventDate, rawContent, summary, groupId, participant.email]
        );
        interactions++;
      }
    }
  }

  return { contacts, interactions };
}
