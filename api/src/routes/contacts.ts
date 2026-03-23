import { Router } from "express";
import { searchContacts } from "../services/search.js";
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

  return router;
}
