import { Router } from "express";
import multer from "multer";
import { readFileSync } from "fs";
import { unlink } from "fs/promises";
import type { DB } from "../db/client.js";
import { parseMbox } from "../services/mbox-parser.js";
import { parseIcs } from "../services/ics-parser.js";
import { parseContactsCsv } from "../services/csv-parser.js";
import { parseLinkedInMessages } from "../services/linkedin-messages-parser.js";
import { upsertContact } from "../services/ingestion.js";

const upload = multer({ dest: "/tmp/uploads", limits: { fileSize: 500 * 1024 * 1024 } });

async function recordImport(db: DB, filename: string, fileType: string, recordsImported: number, duplicatesMerged: number) {
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
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const result = await parseMbox(req.file.path, db);
      await recordImport(db, req.file.originalname, "mbox", result.contacts, 0);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  router.post("/ics", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const result = await parseIcs(req.file.path, db);
      await recordImport(db, req.file.originalname, "ics", result.contacts, 0);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  router.post("/csv", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const csvText = readFileSync(req.file.path, "utf-8");
      const contacts = parseContactsCsv(csvText);
      const source = req.body.source || "csv";
      const results = [];
      for (const c of contacts) {
        const result = await upsertContact(db, { ...c, source });
        results.push(result);

        if (c.connected_on) {
          const lookupField = c.email ? "email" : c.linkedin_url ? "linkedin_url" : null;
          const lookupValue = c.email || c.linkedin_url;
          if (lookupField && lookupValue) {
            await db.query(
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
      await recordImport(db, req.file.originalname, "csv", created + merged, merged);
      res.json({
        total: results.length,
        created,
        merged,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  router.post("/linkedin-messages", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const result = await parseLinkedInMessages(req.file.path, db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  return router;
}
