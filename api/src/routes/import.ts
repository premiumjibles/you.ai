import { Router } from "express";
import multer from "multer";
import type { DB } from "../db/client.js";
import { parseMbox } from "../services/mbox-parser.js";
import { parseIcs } from "../services/ics-parser.js";
import { parseContactsCsv } from "../services/csv-parser.js";
import { upsertContact } from "../services/ingestion.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

export function importRouter(db: DB): Router {
  const router = Router();

  router.post("/mbox", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const result = await parseMbox(req.file.buffer, db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/ics", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const result = await parseIcs(req.file.buffer, db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/csv", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const csvText = req.file.buffer.toString("utf-8");
      const contacts = parseContactsCsv(csvText);
      const results = [];
      for (const c of contacts) {
        const result = await upsertContact(db, { ...c, source: req.body.source || "csv" });
        results.push(result);
      }
      res.json({
        total: results.length,
        created: results.filter((r) => r.action === "created").length,
        merged: results.filter((r) => r.action === "merged").length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
