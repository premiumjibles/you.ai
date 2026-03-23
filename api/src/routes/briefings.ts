import { Router } from "express";
import type { DB } from "../db/client.js";
import { consolidateBriefing } from "../services/claude.js";

export function briefingsRouter(db: DB): Router {
  const router = Router();

  router.get("/history", async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || "sean";
      const limit = parseInt((req.query.limit as string) || "5");
      const { rows } = await db.query(
        "SELECT id, date, content, sub_agent_outputs, created_at FROM briefings WHERE user_id = $1 ORDER BY date DESC LIMIT $2",
        [userId, limit]
      );
      res.json({ briefings: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/assemble", async (req, res) => {
    try {
      const { user_id = "sean", sub_agent_outputs } = req.body;
      const historyLimit = parseInt(process.env.BRIEFING_HISTORY_COUNT || "5");
      const { rows: history } = await db.query(
        "SELECT date::text, content FROM briefings WHERE user_id = $1 ORDER BY date DESC LIMIT $2",
        [user_id, historyLimit]
      );
      const content = await consolidateBriefing(sub_agent_outputs, history);
      const { rows } = await db.query(
        "INSERT INTO briefings (user_id, content, sub_agent_outputs) VALUES ($1, $2, $3) RETURNING *",
        [user_id, content, JSON.stringify(sub_agent_outputs)]
      );
      res.json({ briefing: rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/store", async (req, res) => {
    try {
      const { user_id = "sean", content, sub_agent_outputs } = req.body;
      const { rows } = await db.query(
        "INSERT INTO briefings (user_id, content, sub_agent_outputs) VALUES ($1, $2, $3) RETURNING *",
        [user_id, content, JSON.stringify(sub_agent_outputs)]
      );
      res.json({ briefing: rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/matchmaking", async (req, res) => {
    try {
      const { attendees } = req.body;
      res.json({ suggestions: [], message: "Matchmaking requires populated embeddings" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
