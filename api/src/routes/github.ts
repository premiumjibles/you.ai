import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { DB } from "../db/client.js";

export function githubRouter(db: DB): Router {
  const router = Router();

  router.post("/summary", async (req, res) => {
    try {
      const { repo, commits, prs } = req.body;
      if (!repo) return res.status(400).json({ error: "repo is required" });

      // Check cache
      const { rows: cached } = await db.query(
        "SELECT summary FROM github_summaries WHERE repo = $1 AND date = CURRENT_DATE",
        [repo]
      );
      if (cached.length > 0) return res.json({ summary: cached[0].summary, cached: true });

      // Generate summary
      const anthropic = new Anthropic();
      const content = [
        commits?.length ? `Recent commits:\n${commits.map((c: any) => `- ${c.message} (${c.author})`).join("\n")}` : "",
        prs?.length ? `Merged PRs:\n${prs.map((p: any) => `- #${p.number}: ${p.title} (${p.author})`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");

      if (!content) return res.json({ summary: "No recent activity.", cached: false });

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: `Summarize this GitHub activity for ${repo} in 2-3 sentences:\n\n${content}` }],
      });

      const summary = response.content[0].type === "text" ? response.content[0].text : "";

      // Cache
      await db.query(
        "INSERT INTO github_summaries (repo, summary) VALUES ($1, $2) ON CONFLICT (repo, date) DO UPDATE SET summary = $2",
        [repo, summary]
      );

      res.json({ summary, cached: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
