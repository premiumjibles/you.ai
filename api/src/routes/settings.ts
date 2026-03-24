import { Router } from "express";
import type { DB } from "../db/client.js";
import { getAllSettings, upsertSetting } from "../services/config.js";

export function settingsRouter(db: DB): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const settings = await getAllSettings(db);
      res.json({ settings });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/", async (req, res) => {
    try {
      const updates = req.body as Record<string, string>;
      for (const [key, value] of Object.entries(updates)) {
        await upsertSetting(db, key, value);
      }
      const settings = await getAllSettings(db);
      res.json({ settings });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
