import { Router } from "express";
import type { DB } from "../db/client.js";
import { searchContacts } from "../services/search.js";
import { draftOutreach, generateMemo } from "../services/claude.js";
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

  router.post("/memo", async (req, res) => {
    try {
      const { company } = req.body;
      if (!company) {
        res.status(400).json({ error: "company is required" });
        return;
      }

      const contacts = await searchContacts(db, { strategy: "keyword", query: company, limit: 10 });

      const contactInteractions = await Promise.all(
        contacts.map(async (contact) => {
          const { rows: interactions } = await db.query(
            "SELECT summary, date::text FROM interactions WHERE contact_id = $1 ORDER BY date DESC LIMIT 5",
            [contact.id]
          );
          return {
            contact: { name: contact.name, company: contact.company, role: contact.role, email: contact.email, notes: contact.notes },
            interactions,
          };
        })
      );

      const memo = await generateMemo(company, contacts, contactInteractions);
      res.json({
        company,
        contact_count: contacts.length,
        memo: scrub(memo),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
