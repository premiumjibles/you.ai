import { Router } from "express";
import type { DB } from "../db/client.js";
import { summarizeGitHubActivity } from "../services/claude.js";

export function githubRouter(db: DB): Router {
  const router = Router();

  router.post("/summary", async (req, res) => {
    try {
      const { repo, commits, prs } = req.body;
      if (!repo) return res.status(400).json({ error: "repo is required" });

      const { rows: cached } = await db.query(
        "SELECT summary FROM github_summaries WHERE repo = $1 AND date = CURRENT_DATE",
        [repo]
      );
      if (cached.length > 0) return res.json({ summary: cached[0].summary, cached: true });

      const content = [
        commits?.length ? `Recent commits:\n${commits.map((c: any) => `- ${c.message} (${c.author})`).join("\n")}` : "",
        prs?.length ? `Merged PRs:\n${prs.map((p: any) => `- #${p.number}: ${p.title} (${p.author})`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");

      if (!content) return res.json({ summary: "No recent activity.", cached: false });

      const summary = await summarizeGitHubActivity(repo, content);

      await db.query(
        "INSERT INTO github_summaries (repo, summary) VALUES ($1, $2) ON CONFLICT (repo, date) DO UPDATE SET summary = $2",
        [repo, summary]
      );

      res.json({ summary, cached: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch live commit/PR data for a repo
  router.get("/activity/:owner/:repo", async (req, res) => {
    try {
      const repo = `${req.params.owner}/${req.params.repo}`;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
      };
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      // Helper: fetch with token, retry without on 403 (org token policy)
      async function ghFetch(url: string): Promise<Response> {
        let res = await fetch(url, { headers });
        if (res.status === 403 && headers.Authorization) {
          const { Authorization: _, ...noAuth } = headers;
          res = await fetch(url, { headers: noAuth });
        }
        return res;
      }

      const commits: { message: string; author: string }[] = [];
      const prs: { number: number; title: string; author: string }[] = [];

      const commitsRes = await ghFetch(
        `https://api.github.com/repos/${encodeURI(repo)}/commits?since=${since}&per_page=10`
      );
      if (commitsRes.ok) {
        const data = await commitsRes.json();
        for (const c of data.slice(0, 10)) {
          commits.push({
            message: c.commit.message.split("\n")[0],
            author: c.commit.author?.name || c.author?.login || "unknown",
          });
        }
      }

      const prsRes = await ghFetch(
        `https://api.github.com/repos/${encodeURI(repo)}/pulls?state=closed&sort=updated&direction=desc&per_page=10`
      );
      if (prsRes.ok) {
        const data = (await prsRes.json()).filter(
          (pr: any) =>
            pr.merged_at && new Date(pr.merged_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
        );
        for (const pr of data) {
          prs.push({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login || "unknown",
          });
        }
      }

      res.json({ repo, commits, prs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
