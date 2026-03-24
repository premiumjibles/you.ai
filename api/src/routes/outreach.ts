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
          await db.query(
            `INSERT INTO outreach_drafts (contact_id, message, context) VALUES ($1, $2, $3)`,
            [contact.id, scrub(draft), JSON.stringify({ campaign_goal, query, strategy })]
          );
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

  router.get("/drafts", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      let query = `SELECT d.*, c.name as contact_name, c.company as contact_company
        FROM outreach_drafts d
        LEFT JOIN contacts c ON d.contact_id = c.id`;
      const params: any[] = [];

      if (status) {
        query += " WHERE d.status = $1";
        params.push(status);
      }
      query += " ORDER BY d.created_at DESC";

      const { rows } = await db.query(query, params);
      res.json({ drafts: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/drafts/:id", async (req, res) => {
    try {
      const { message, status } = req.body;
      const { rows } = await db.query(
        `UPDATE outreach_drafts SET
          message = COALESCE($1, message),
          status = COALESCE($2, status)
        WHERE id = $3 RETURNING *`,
        [message, status, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ draft: rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
