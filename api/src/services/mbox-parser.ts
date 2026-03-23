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

  for (const raw of messages) {
    try {
      const parsed = await simpleParser(raw);
      const from = parsed.from?.value?.[0];
      if (!from?.address) continue;

      if (!seen.has(from.address)) {
        seen.add(from.address);
        await upsertContact(db, {
          name: from.name || from.address.split("@")[0],
          email: from.address,
          source: "gmail",
        });
        contacts++;
      }

      const rawContent = scrub(
        `Subject: ${parsed.subject || "(no subject)"}\n\n${(parsed.text || "").slice(0, 2000)}`
      );
      await db.query(
        `INSERT INTO interactions (contact_id, type, date, raw_content, summary)
         SELECT c.id, 'email', $1, $2, $3
         FROM contacts c WHERE c.email = $4
         LIMIT 1`,
        [
          parsed.date?.toISOString() || new Date().toISOString(),
          rawContent,
          parsed.subject || null,
          from.address,
        ]
      );
      interactions++;
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
