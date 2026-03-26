import { createReadStream } from "fs";
import { parse } from "csv-parse";
import type pg from "pg";
import { upsertContact } from "./ingestion.js";
import { scrub } from "./scrubber.js";
import { stripHtml } from "./html-utils.js";

const BATCH_SIZE = 200;

interface ImportResult {
  contacts: number;
  interactions: number;
}

interface PendingInteraction {
  linkedinUrl: string;
  date: string;
  rawContent: string;
  summary: string;
  groupId: string;
}

async function detectOwnerUrl(filePath: string): Promise<string | null> {
  const urlCounts = new Map<string, number>();
  const parser = createReadStream(filePath, "utf-8").pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true })
  );

  for await (const row of parser) {
    const recipientUrls = (row["RECIPIENT PROFILE URLS"] || "").trim();
    if (recipientUrls) {
      for (const url of recipientUrls.split(",")) {
        const trimmed = url.trim();
        if (trimmed) urlCounts.set(trimmed, (urlCounts.get(trimmed) || 0) + 1);
      }
    }
  }

  let maxUrl: string | null = null;
  let maxCount = 0;
  for (const [url, count] of urlCounts) {
    if (count > maxCount) { maxUrl = url; maxCount = count; }
  }
  return maxUrl;
}

async function flushInteractions(db: pg.Pool | pg.PoolClient, batch: PendingInteraction[]): Promise<void> {
  if (batch.length === 0) return;
  for (const item of batch) {
    await db.query(
      `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id)
       SELECT c.id, 'linkedin', $1, $2, $3, $4
       FROM contacts c WHERE lower(c.linkedin_url) = lower($5) LIMIT 1
       ON CONFLICT (contact_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`,
      [item.date, item.rawContent, item.summary, item.groupId, item.linkedinUrl]
    );
  }
}

export async function parseLinkedInMessages(
  filePath: string,
  db: pg.Pool | pg.PoolClient,
  onProgress?: (contacts: number, interactions: number) => void
): Promise<ImportResult> {
  const ownerUrl = process.env.OWNER_LINKEDIN_URL?.toLowerCase()
    || (await detectOwnerUrl(filePath))?.toLowerCase();

  const parser = createReadStream(filePath, "utf-8").pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true })
  );

  const seen = new Set<string>();
  let contacts = 0;
  let interactions = 0;
  let batch: PendingInteraction[] = [];

  for await (const row of parser) {
    const from = row["FROM"] || "";
    const senderUrl = (row["SENDER PROFILE URL"] || "").trim();
    const date = row["DATE"] || "";
    const content = row["CONTENT"] || "";
    const conversationId = row["CONVERSATION ID"] || "";
    const subject = row["SUBJECT"] || "";

    if (!from || !content) continue;
    if (ownerUrl && senderUrl.toLowerCase() === ownerUrl) continue;
    if (!senderUrl) continue;
    if (from === "LinkedIn" || from === "LinkedIn Learning" || from === "LinkedIn Member") continue;

    const messageDate = date ? new Date(date) : null;
    if (!messageDate || isNaN(messageDate.getTime())) continue;

    const plainContent = stripHtml(content);
    if (!plainContent) continue;

    const groupId = `linkedin-msg-${conversationId}-${messageDate.toISOString()}`;
    const rawContent = scrub(
      `${subject ? `Subject: ${subject}\n\n` : ""}${plainContent.slice(0, 2000)}`
    );
    const summary = subject || plainContent.slice(0, 100);

    if (!seen.has(senderUrl)) {
      seen.add(senderUrl);
      await upsertContact(db, { name: from, linkedin_url: senderUrl, source: "linkedin" });
      contacts++;
    }

    batch.push({ linkedinUrl: senderUrl, date: messageDate.toISOString(), rawContent, summary, groupId });
    interactions++;

    if (batch.length >= BATCH_SIZE) {
      await flushInteractions(db, batch);
      batch = [];
      if (onProgress) onProgress(contacts, interactions);
    }
  }

  await flushInteractions(db, batch);
  if (onProgress) onProgress(contacts, interactions);

  return { contacts, interactions };
}
