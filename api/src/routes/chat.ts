import { Router } from "express";
import type { DB } from "../db/client.js";
import { parseIncomingMessage, sendWhatsApp } from "../services/messaging.js";
import { handleChatMessage } from "../services/agent.js";

export function chatRouter(db: DB): Router {
  const router = Router();

  // Evolution API webhook
  router.post("/webhook", (req, res) => {
    const msg = parseIncomingMessage(req.body);

    // Return 200 immediately to avoid webhook timeout
    res.json({ ok: true });

    if (!msg) return;

    // Security: only respond to the owner
    const ownerJid = process.env.WHATSAPP_OWNER_JID;
    if (ownerJid && msg.remoteJid !== ownerJid) return;

    // Process async
    handleChatMessage(db, msg.remoteJid, msg.message)
      .then((response) => sendWhatsApp(msg.remoteJid, response))
      .catch((err) => {
        console.error("Chat agent error:", err);
        sendWhatsApp(msg.remoteJid, "Sorry, something went wrong. Try again.").catch(console.error);
      });
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
