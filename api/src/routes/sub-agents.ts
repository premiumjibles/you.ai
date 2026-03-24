import { Router } from "express";
import type { DB } from "../db/client.js";

export function subAgentsRouter(db: DB): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || process.env.USER_ID || "default";
      const { rows } = await db.query(
        "SELECT * FROM sub_agents WHERE user_id = $1 AND active = true ORDER BY name",
        [userId]
      );
      res.json({ sub_agents: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const { user_id = process.env.USER_ID || "default", type, name, config = {}, workflow_id, schedule } = req.body;
      const { rows } = await db.query(
        `INSERT INTO sub_agents (user_id, type, name, config, workflow_id, schedule)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user_id, type, name, JSON.stringify(config), workflow_id, schedule]
      );
      res.json({ sub_agent: rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const { name, config, schedule, active } = req.body;
      const { rows } = await db.query(
        `UPDATE sub_agents SET
          name = COALESCE($1, name),
          config = COALESCE($2, config),
          schedule = COALESCE($3, schedule),
          active = COALESCE($4, active)
        WHERE id = $5 RETURNING *`,
        [name, config ? JSON.stringify(config) : null, schedule, active, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ sub_agent: rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await db.query("UPDATE sub_agents SET active = false WHERE id = $1", [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
