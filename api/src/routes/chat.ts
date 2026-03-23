import { Router } from "express";
import type { DB } from "../db/client.js";
import type { MessagingProvider } from "../services/messaging/index.js";
import { processIncomingMessage } from "../services/messaging/handler.js";

export function chatRouter(db: DB, provider: MessagingProvider): Router {
  const router = Router();

  router.post("/webhook", (req, res) => {
    const msg = provider.parseIncoming(req.body);

    // Return 200 immediately to avoid webhook timeout
    res.json({ ok: true });

    if (!msg) return;

    processIncomingMessage(db, provider, msg);
  });

  // Chat history for debugging
  router.get("/history/:session_id", async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "50");
      const { rows } = await db.query(
        "SELECT role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2",
        [req.params.session_id, limit]
      );
      res.json({ messages: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
