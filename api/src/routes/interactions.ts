import { Router } from "express";
import type { DB } from "../db/client.js";
import { scrub } from "../services/scrubber.js";
import { summarizeInteraction } from "../services/claude.js";

export function interactionsRouter(db: DB): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const { contact_id, type, date, raw_content, group_id } = req.body;
      const scrubbed = scrub(raw_content || "");
      const summary = raw_content ? await summarizeInteraction(scrubbed) : null;
      const { rows } = await db.query(
        `INSERT INTO interactions (contact_id, type, date, summary, raw_content, group_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [contact_id, type, date || new Date().toISOString(), summary, scrubbed, group_id || null]
      );
      await db.query(
        "UPDATE contacts SET last_interaction_date = $1 WHERE id = $2",
        [date || new Date().toISOString(), contact_id]
      );
      res.json({ interaction: rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get("/:contact_id", async (req, res) => {
    try {
      const { rows } = await db.query(
        "SELECT * FROM interactions WHERE contact_id = $1 ORDER BY date DESC LIMIT $2",
        [req.params.contact_id, parseInt((req.query.limit as string) || "20")]
      );
      res.json({ interactions: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
