import { Router } from "express";
import multer from "multer";
import { readFile, unlink } from "fs/promises";
import type pg from "pg";
import type { DB } from "../db/client.js";
import { parseMbox } from "../services/mbox-parser.js";
import { parseIcs } from "../services/ics-parser.js";
import { parseContactsCsv } from "../services/csv-parser.js";
import { parseLinkedInMessages } from "../services/linkedin-messages-parser.js";
import { upsertContact } from "../services/ingestion.js";

const upload = multer({ dest: "/tmp/uploads", limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

async function recordImport(db: pg.PoolClient, filename: string, fileType: string, recordsImported: number, duplicatesMerged: number) {
  await db.query(
    "INSERT INTO import_history (filename, file_type, records_imported, duplicates_merged) VALUES ($1, $2, $3, $4)",
    [filename, fileType, recordsImported, duplicatesMerged]
  );
}

export function importRouter(db: DB): Router {
  const router = Router();

  router.get("/history", async (_req, res) => {
    try {
      const { rows } = await db.query(
        "SELECT * FROM import_history ORDER BY created_at DESC LIMIT 50"
      );
      res.json({ imports: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/mbox", upload.single("file"), async (req, res) => {
    const client = await db.connect();
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      await client.query("BEGIN");
      const result = await parseMbox(req.file.path, client);
      await recordImport(client, req.file.originalname, "mbox", result.contacts, 0);
      await client.query("COMMIT");
      res.json(result);
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  router.post("/ics", upload.single("file"), async (req, res) => {
    const client = await db.connect();
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      await client.query("BEGIN");
      const result = await parseIcs(req.file.path, client);
      await recordImport(client, req.file.originalname, "ics", result.contacts, 0);
      await client.query("COMMIT");
      res.json(result);
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  router.post("/csv", upload.single("file"), async (req, res) => {
    const client = await db.connect();
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      await client.query("BEGIN");
      const csvText = await readFile(req.file.path, "utf-8");
      const contacts = parseContactsCsv(csvText);
      const source = req.body.source || "csv";
      const results = [];
      for (const c of contacts) {
        const result = await upsertContact(client, { ...c, source });
        results.push(result);

        if (c.connected_on) {
          const lookupField = c.email ? "email" : c.linkedin_url ? "linkedin_url" : null;
          const lookupValue = c.email || c.linkedin_url;
          if (lookupField && lookupValue) {
            await client.query(
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
      const created = results.filter((r) => r.action === "created").length;
      const merged = results.filter((r) => r.action === "merged").length;
      await recordImport(client, req.file.originalname, "csv", created + merged, merged);
      await client.query("COMMIT");
      res.json({
        total: results.length,
        created,
        merged,
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  router.post("/linkedin-messages", upload.single("file"), async (req, res) => {
    const client = await db.connect();
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      await client.query("BEGIN");
      const result = await parseLinkedInMessages(req.file.path, client);
      await client.query("COMMIT");
      res.json(result);
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  return router;
}
