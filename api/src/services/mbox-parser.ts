import { simpleParser } from "mailparser";
import type pg from "pg";
import { upsertContact } from "./ingestion.js";
import { scrub } from "./scrubber.js";

interface ImportResult {
  contacts: number;
  interactions: number;
}

export async function parseMbox(buffer: Buffer, db: pg.Pool): Promise<ImportResult> {
  const text = buffer.toString("utf-8");
  const messages = splitMbox(text);

  const seen = new Set<string>();
  let contacts = 0;
  let interactions = 0;

  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();

  for (const raw of messages) {
    try {
      const parsed = await simpleParser(raw);
      const from = parsed.from?.value?.[0];
      if (!from?.address) continue;

      const groupId = parsed.messageId || null;
      const rawContent = scrub(
        `Subject: ${parsed.subject || "(no subject)"}\n\n${(parsed.text || "").slice(0, 2000)}`
      );
      const emailDate = parsed.date?.toISOString() || new Date().toISOString();
      const subject = parsed.subject || null;

      // Collect all participant addresses from From, To, and CC
      const participants: { name: string; address: string }[] = [];

      if (from.address) {
        participants.push({ name: from.name || from.address.split("@")[0], address: from.address });
      }

      const toAddrs = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];
      const ccAddrs = Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : [];
      for (const group of [...toAddrs, ...ccAddrs]) {
        for (const addr of group.value || []) {
          if (addr.address) {
            participants.push({ name: addr.name || addr.address.split("@")[0], address: addr.address });
          }
        }
      }

      for (const participant of participants) {
        if (ownerEmail && participant.address.toLowerCase() === ownerEmail) continue;

        if (!seen.has(participant.address)) {
          seen.add(participant.address);
          await upsertContact(db, {
            name: participant.name,
            email: participant.address,
            source: "gmail",
          });
          contacts++;
        }

        await db.query(
          `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id)
           SELECT c.id, 'email', $1, $2, $3, $4
           FROM contacts c WHERE c.email = $5
           LIMIT 1`,
          [emailDate, rawContent, subject, groupId, participant.address]
        );
        interactions++;
      }
    } catch {
      // Skip malformed messages
    }
  }

  return { contacts, interactions };
}

function splitMbox(text: string): string[] {
  const messages: string[] = [];
  const lines = text.split("\n");
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("From ") && current.length > 0) {
      messages.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    messages.push(current.join("\n"));
  }

  return messages;
}
