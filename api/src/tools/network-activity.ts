import type Anthropic from "@anthropic-ai/sdk";
import type pg from "pg";

export const toolDef: Anthropic.Tool = {
  name: "network_activity",
  description:
    "Fetches recent interactions from the contact network — emails, meetings, and messages. Use when the user asks about recent activity or who they've been in touch with.",
  input_schema: {
    type: "object" as const,
    properties: {
      since_hours: {
        type: "number",
        description: "Look back this many hours (default 24)",
      },
      limit: {
        type: "number",
        description: "Maximum interactions to return (default 10)",
      },
    },
  },
};

export async function fetchNetworkActivity(
  db: pg.Pool,
  params: { since_hours?: number; limit?: number }
): Promise<string> {
  const { since_hours = 24, limit = 10 } = params;
  const { rows } = await db.query(
    "SELECT c.name, i.summary, i.created_at FROM interactions i JOIN contacts c ON c.id = i.contact_id WHERE i.created_at > NOW() - make_interval(hours => $1) ORDER BY i.created_at DESC LIMIT $2",
    [since_hours, limit]
  );
  if (rows.length === 0) return `No network activity in the last ${since_hours} hours.`;
  const lines = rows.map(
    (r: any) =>
      `- ${r.name}: ${r.summary || "interaction recorded"} (${new Date(r.created_at).toLocaleTimeString()})`
  );
  return lines.join("\n");
}
