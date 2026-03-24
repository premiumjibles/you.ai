import { readFile } from "fs/promises";
import { parse } from "csv-parse/sync";
import type pg from "pg";
import { upsertContact } from "./ingestion.js";
import { scrub } from "./scrubber.js";
import { stripHtml } from "./html-utils.js";

interface ImportResult {
  contacts: number;
  interactions: number;
}

function detectOwnerUrl(records: any[]): string | null {
  const urlCounts = new Map<string, number>();
  for (const row of records) {
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

export async function parseLinkedInMessages(filePath: string, db: pg.Pool | pg.PoolClient): Promise<ImportResult> {
  const csvText = await readFile(filePath, "utf-8");
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const ownerUrl = process.env.OWNER_LINKEDIN_URL?.toLowerCase() || detectOwnerUrl(records)?.toLowerCase();
  const seen = new Set<string>();
  let contacts = 0;
  let interactions = 0;

  for (const row of records) {
    const from = row["FROM"] || "";
    const senderUrl = (row["SENDER PROFILE URL"] || "").trim();
    const date = row["DATE"] || "";
    const content = row["CONTENT"] || "";
    const conversationId = row["CONVERSATION ID"] || "";
    const subject = row["SUBJECT"] || "";

    if (!from || !content) continue;

    // Skip messages from the owner
    if (ownerUrl && senderUrl.toLowerCase() === ownerUrl) continue;
    // No sender URL = likely spam/system message
    if (!senderUrl) continue;
    // Skip LinkedIn system messages
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
      await upsertContact(db, {
        name: from,
        linkedin_url: senderUrl,
        source: "linkedin",
      });
      contacts++;
    }

    await db.query(
      `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id)
       SELECT c.id, 'linkedin', $1, $2, $3, $4
       FROM contacts c WHERE c.linkedin_url = $5
       LIMIT 1
       ON CONFLICT (contact_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`,
      [messageDate.toISOString(), rawContent, summary, groupId, senderUrl]
    );
    interactions++;
  }

  return { contacts, interactions };
}
