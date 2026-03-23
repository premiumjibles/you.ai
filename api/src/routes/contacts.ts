import { Router } from "express";
import { searchContacts } from "../services/search.js";
import { upsertContact } from "../services/ingestion.js";
import { parseContactsCsv } from "../services/csv-parser.js";
import { updateContactEmbedding, batchUpdateEmbeddings } from "../services/embeddings.js";
import type { DB } from "../db/client.js";

export function contactsRouter(db: DB): Router {
  const router = Router();

  router.post("/search", async (req, res) => {
    try {
      const { strategy, query, strategies, embedding, limit, threshold } = req.body;
      const results = await searchContacts(db, {
        strategy: strategy || "combined",
        query,
        strategies,
        embedding,
        limit,
        threshold,
      });
      res.json({ results, count: results.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/ingest", async (req, res) => {
    try {
      const result = await upsertContact(db, req.body);
      updateContactEmbedding(db, result.contact.id).catch(console.error);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/ingest/csv", async (req, res) => {
    try {
      const { csv, source } = req.body;
      const contacts = parseContactsCsv(csv);
      const results = [];
      for (const c of contacts) {
        const result = await upsertContact(db, { ...c, source: source || "csv" });
        results.push(result);
      }
      const ids = results.map((r) => r.contact.id);
      batchUpdateEmbeddings(db, ids).catch(console.error);
      res.json({
        total: results.length,
        created: results.filter((r) => r.action === "created").length,
        merged: results.filter((r) => r.action === "merged").length,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
