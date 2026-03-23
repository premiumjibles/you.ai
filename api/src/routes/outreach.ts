import { Router } from "express";
import type { DB } from "../db/client.js";
import { searchContacts } from "../services/search.js";
import { draftOutreach } from "../services/claude.js";
import { scrub } from "../services/scrubber.js";

export function outreachRouter(db: DB): Router {
  const router = Router();

  router.post("/draft", async (req, res) => {
    try {
      const { campaign_goal, query, strategy = "combined", limit = 10 } = req.body;
      const contacts = await searchContacts(db, { strategy, query, limit });
      const drafts = await Promise.all(
        contacts.map(async (contact) => {
          const { rows: interactions } = await db.query(
            "SELECT summary FROM interactions WHERE contact_id = $1 ORDER BY date DESC LIMIT 5",
            [contact.id]
          );
          const draft = await draftOutreach(campaign_goal, contact, interactions);
          return {
            contact: { id: contact.id, name: contact.name, company: contact.company, email: contact.email },
            draft: scrub(draft),
            interaction_count: interactions.length,
          };
        })
      );
      res.json({ drafts, count: drafts.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
