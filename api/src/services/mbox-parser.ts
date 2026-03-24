import { createReadStream } from "fs";
import { createInterface } from "readline";
import { simpleParser } from "mailparser";
import type pg from "pg";
import { upsertContact } from "./ingestion.js";
import { scrub } from "./scrubber.js";
import { nameOrHumanize } from "./name-utils.js";

const BATCH_SIZE = 200;

interface ImportResult {
  contacts: number;
  interactions: number;
}

interface PendingInteraction {
  date: string;
  rawContent: string;
  summary: string | null;
  groupId: string | null;
  email: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function unescapeMboxrd(lines: string[]): string {
  return lines.map((l) => (l.startsWith(">From ") ? l.slice(1) : l)).join("\n");
}

async function* splitMboxStream(filePath: string): AsyncGenerator<string> {
  const rl = createInterface({ input: createReadStream(filePath, "utf-8"), crlfDelay: Infinity });
  let current: string[] = [];

  for await (const line of rl) {
    if (line.startsWith("From ") && current.length > 0) {
      yield unescapeMboxrd(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    yield unescapeMboxrd(current);
  }
}

async function flushInteractions(db: pg.Pool | pg.PoolClient, batch: PendingInteraction[]): Promise<void> {
  if (batch.length === 0) return;
  const values: any[] = [];
  const placeholders: string[] = [];
  for (let i = 0; i < batch.length; i++) {
    const off = i * 5;
    placeholders.push(`(SELECT c.id FROM contacts c WHERE c.email = $${off + 5} LIMIT 1), 'email', $${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}`);
    values.push(batch[i].date, batch[i].rawContent, batch[i].summary, batch[i].groupId, batch[i].email);
  }
  const sql = `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id) VALUES ${placeholders.map((p) => `(${p})`).join(", ")} ON CONFLICT (contact_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`;
  await db.query(sql, values);
}

export async function parseMbox(filePath: string, db: pg.Pool | pg.PoolClient): Promise<ImportResult> {
  const seen = new Set<string>();
  let contacts = 0;
  let interactions = 0;
  let batch: PendingInteraction[] = [];

  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();

  for await (const raw of splitMboxStream(filePath)) {
    try {
      const parsed = await simpleParser(raw);

      const gmailLabels = parsed.headers?.get("x-gmail-labels");
      if (typeof gmailLabels === "string" && gmailLabels.includes("Spam")) continue;

      const from = parsed.from?.value?.[0];
      if (!from?.address) continue;

      const groupId = parsed.messageId || null;
      const bodyText = parsed.text || stripHtml(parsed.html || "");
      const rawContent = scrub(
        `Subject: ${parsed.subject || "(no subject)"}\n\n${bodyText.slice(0, 2000)}`
      );
      const emailDate = parsed.date?.toISOString() || new Date().toISOString();
      const subject = parsed.subject || null;

      const participants: { name: string; address: string }[] = [];

      if (from.address) {
        participants.push({ name: nameOrHumanize(from.name, from.address), address: from.address });
      }

      const toAddrs = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];
      const ccAddrs = Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : [];
      for (const group of [...toAddrs, ...ccAddrs]) {
        for (const addr of group.value || []) {
          if (addr.address) {
            participants.push({ name: nameOrHumanize(addr.name, addr.address), address: addr.address });
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

        batch.push({
          date: emailDate,
          rawContent,
          summary: subject,
          groupId,
          email: participant.address,
        });
        interactions++;

        if (batch.length >= BATCH_SIZE) {
          await flushInteractions(db, batch);
          batch = [];
        }
      }
    } catch {
      // Skip malformed messages
    }
  }

  await flushInteractions(db, batch);

  return { contacts, interactions };
}
