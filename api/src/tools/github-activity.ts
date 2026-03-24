import type Anthropic from "@anthropic-ai/sdk";

export const toolDef: Anthropic.Tool = {
  name: "github_activity",
  description:
    "Fetches recent commits and merged pull requests from GitHub repositories. Use when the user asks about repo activity, recent changes, or development progress for a specific repository.",
  input_schema: {
    type: "object" as const,
    properties: {
      repos: {
        type: "array",
        items: { type: "string" },
        description: 'GitHub repositories in "owner/repo" format',
      },
      include_prs: {
        type: "boolean",
        description: "Include merged pull requests (default true)",
      },
      since_hours: {
        type: "number",
        description: "Look back this many hours (default 24)",
      },
    },
    required: ["repos"],
  },
};

export async function fetchGithubActivity(params: {
  repos: string[];
  include_prs?: boolean;
  since_hours?: number;
}): Promise<string> {
  const { repos, include_prs = true, since_hours = 24 } = params;
  if (repos.length === 0) return "No repos specified.";

  const since = new Date(Date.now() - since_hours * 60 * 60 * 1000).toISOString();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const sections = await Promise.all(
    repos.map(async (repo) => {
      const lines: string[] = [`**${repo}**`];

      const commitsRes = await fetch(
        `https://api.github.com/repos/${encodeURI(repo)}/commits?since=${since}&per_page=10`,
        { headers }
      );
      if (commitsRes.ok) {
        const commits = await commitsRes.json();
        if (commits.length > 0) {
          lines.push(`Commits (${commits.length}):`);
          for (const c of commits.slice(0, 5)) {
            const msg = c.commit.message.split("\n")[0];
            const author = c.commit.author?.name || "unknown";
            lines.push(`- ${msg} (${author})`);
          }
          if (commits.length > 5) lines.push(`  ...and ${commits.length - 5} more`);
        } else {
          lines.push(`No commits in the last ${since_hours}h.`);
        }
      } else {
        lines.push(`Failed to fetch commits (${commitsRes.status}).`);
      }

      if (include_prs) {
        const prsRes = await fetch(
          `https://api.github.com/repos/${encodeURI(repo)}/pulls?state=closed&sort=updated&direction=desc&per_page=5`,
          { headers }
        );
        if (prsRes.ok) {
          const prs = (await prsRes.json()).filter(
            (pr: any) =>
              pr.merged_at && new Date(pr.merged_at).getTime() > Date.now() - since_hours * 60 * 60 * 1000
          );
          if (prs.length > 0) {
            lines.push(`Merged PRs (${prs.length}):`);
            for (const pr of prs) {
              lines.push(`- #${pr.number}: ${pr.title} (by ${pr.user?.login || "unknown"})`);
            }
          }
        }
      }

      return lines.join("\n");
    })
  );

  return sections.join("\n\n");
}
