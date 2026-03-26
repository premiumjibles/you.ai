/**
 * CLI import script — reads files directly from disk, bypasses HTTP/multer.
 *
 * Usage: DATABASE_URL=postgresql://... npx tsx api/scripts/import.ts <command> <file-path>
 *
 * Commands:
 *   gmail                 Import Gmail mbox (Google Takeout)
 *   calendar              Import calendar ics (Google Takeout)
 *   linkedin-connections  Import LinkedIn Connections.csv
 *   linkedin-messages     Import LinkedIn messages.csv
 *   csv                   Import generic contacts CSV
 */

import { existsSync } from "fs";
import pg from "pg";
import { parseMbox } from "../src/services/mbox-parser.js";
import { parseIcs } from "../src/services/ics-parser.js";
import { streamContactsCsv } from "../src/services/csv-parser.js";
import { parseLinkedInMessages } from "../src/services/linkedin-messages-parser.js";
import { upsertContact } from "../src/services/ingestion.js";

const COMMANDS = ["gmail", "calendar", "linkedin-connections", "linkedin-messages", "csv"] as const;
type Command = (typeof COMMANDS)[number];

function usage(): never {
  console.error("Usage: npx tsx api/scripts/import.ts <command> <file-path>");
  console.error(`Commands: ${COMMANDS.join(", ")}`);
  process.exit(1);
}

function progress(startTime: number) {
  return (contacts: number, interactions: number) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r  Contacts: ${contacts} | Interactions: ${interactions} | ${elapsed}s elapsed`);
  };
}

async function recordImport(pool: pg.Pool, filename: string, fileType: string, recordsImported: number, duplicatesMerged: number) {
  await pool.query(
    "INSERT INTO import_history (filename, file_type, records_imported, duplicates_merged) VALUES ($1, $2, $3, $4)",
    [filename, fileType, recordsImported, duplicatesMerged]
  );
}

async function importGmail(pool: pg.Pool, filePath: string) {
  console.log("  Importing Gmail mbox...");
  const startTime = Date.now();
  const result = await parseMbox(filePath, pool, progress(startTime));
  console.log("");
  await recordImport(pool, filePath.split("/").pop()!, "mbox", result.contacts, 0);
  return result;
}

async function importCalendar(pool: pg.Pool, filePath: string) {
  console.log("  Importing calendar...");
  const startTime = Date.now();
  const result = await parseIcs(filePath, pool, progress(startTime));
  console.log("");
  await recordImport(pool, filePath.split("/").pop()!, "ics", result.contacts, 0);
  return result;
}

async function importCsvContacts(pool: pg.Pool, filePath: string, source: string, fileType: string) {
  console.log(`  Importing ${source} contacts...`);
  const startTime = Date.now();
  let created = 0, merged = 0;

  for await (const c of streamContactsCsv(filePath)) {
    const result = await upsertContact(pool, { ...c, source });
    if (result.action === "created") created++;
    else merged++;

    if ((created + merged) % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r  Created: ${created} | Merged: ${merged} | ${elapsed}s elapsed`);
    }

    // Insert LinkedIn connection interaction if connected_on is present
    if (c.connected_on) {
      const lookupField = c.email ? "email" : c.linkedin_url ? "linkedin_url" : null;
      const lookupValue = c.email || c.linkedin_url;
      if (lookupField && lookupValue) {
        await pool.query(
          `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id)
           SELECT c.id, 'linkedin', $1, $2, $3, $4
           FROM contacts c WHERE c.${lookupField} = $5
           LIMIT 1
           ON CONFLICT (contact_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`,
          [c.connected_on, "LinkedIn connection", "LinkedIn connection", `linkedin-connect-${lookupValue}`, lookupValue]
        );
      }
    }
  }

  console.log(`\r  Created: ${created} | Merged: ${merged}                    `);
  await recordImport(pool, filePath.split("/").pop()!, fileType, created + merged, merged);
  return { created, merged };
}

async function importLinkedInMessages(pool: pg.Pool, filePath: string) {
  console.log("  Importing LinkedIn messages...");
  const startTime = Date.now();
  const result = await parseLinkedInMessages(filePath, pool, progress(startTime));
  console.log("");
  await recordImport(pool, filePath.split("/").pop()!, "linkedin-messages", result.contacts, 0);
  return result;
}

async function main() {
  const [, , command, filePath] = process.argv;

  if (!command || !filePath) usage();
  if (!COMMANDS.includes(command as Command)) {
    console.error(`Unknown command: ${command}`);
    usage();
  }
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log(`\n  File: ${filePath}`);

    switch (command as Command) {
      case "gmail": {
        const r = await importGmail(pool, filePath);
        console.log(`  Done: ${r.contacts} contacts, ${r.interactions} interactions`);
        break;
      }
      case "calendar": {
        const r = await importCalendar(pool, filePath);
        console.log(`  Done: ${r.contacts} contacts, ${r.interactions} interactions`);
        break;
      }
      case "linkedin-connections": {
        const r = await importCsvContacts(pool, filePath, "linkedin", "csv");
        console.log(`  Done: ${r.created} created, ${r.merged} merged`);
        break;
      }
      case "linkedin-messages": {
        const r = await importLinkedInMessages(pool, filePath);
        console.log(`  Done: ${r.contacts} contacts, ${r.interactions} interactions`);
        break;
      }
      case "csv": {
        const r = await importCsvContacts(pool, filePath, "csv", "csv");
        console.log(`  Done: ${r.created} created, ${r.merged} merged`);
        break;
      }
    }

    console.log("");
  } catch (err: any) {
    console.error(`\n  Import failed: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
