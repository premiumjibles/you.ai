import { Router } from "express";
import multer from "multer";
import { readFileSync } from "fs";
import { unlink } from "fs/promises";
import type { DB } from "../db/client.js";
import { parseMbox } from "../services/mbox-parser.js";
import { parseIcs } from "../services/ics-parser.js";
import { parseContactsCsv } from "../services/csv-parser.js";
import { upsertContact } from "../services/ingestion.js";

const upload = multer({ dest: "/tmp/uploads", limits: { fileSize: 500 * 1024 * 1024 } });

export function importRouter(db: DB): Router {
  const router = Router();

  router.post("/mbox", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const result = await parseMbox(req.file.path, db);
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

        if (c.connected_on && c.email) {
          await db.query(
            `INSERT INTO interactions (contact_id, type, date, raw_content, summary, group_id)
             SELECT c.id, 'linkedin', $1, $2, $3, $4
             FROM contacts c WHERE c.email = $5
             LIMIT 1
             ON CONFLICT (contact_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`,
            [c.connected_on, "LinkedIn connection", "LinkedIn connection", `linkedin-connect-${c.email}`, c.email]
          );
        }
      }
      res.json({
        total: results.length,
        created: results.filter((r) => r.action === "created").length,
        merged: results.filter((r) => r.action === "merged").length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (req.file) unlink(req.file.path).catch(() => {});
    }
  });

  return router;
}
