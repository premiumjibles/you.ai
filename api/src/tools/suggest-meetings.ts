import type Anthropic from "@anthropic-ai/sdk";
import type pg from "pg";

export const toolDef: Anthropic.Tool = {
  name: "suggest_meetings",
  description:
    "Find contacts to meet in a destination city, ranked by relationship strength (interaction frequency, recency, priority ring). Use when the user mentions traveling somewhere or asks who to meet in a specific location.",
  input_schema: {
    type: "object" as const,
    properties: {
      destination: {
        type: "string",
        description:
          "City or region the user is traveling to (e.g. 'Singapore', 'London', 'New York')",
      },
    },
    required: ["destination"],
  },
};

export async function fetchSuggestMeetings(
  db: pg.Pool,
  params: { destination: string }
): Promise<string> {
  const { destination } = params;

  const { rows } = await db.query(
    `SELECT
       c.id, c.name, c.company, c.role, c.location, c.email,
       c.priority_ring,
       COUNT(i.id)::int AS interaction_count,
       MAX(i.date) AS latest_interaction,
       (SELECT i2.summary FROM interactions i2 WHERE i2.contact_id = c.id ORDER BY i2.date DESC LIMIT 1) AS last_summary
     FROM contacts c
     LEFT JOIN interactions i ON i.contact_id = c.id
     WHERE c.location ILIKE '%' || $1 || '%'
        OR similarity(c.location, $1) > 0.3
     GROUP BY c.id
     ORDER BY
       c.priority_ring ASC,
       COUNT(i.id) DESC,
       MAX(i.date) DESC NULLS LAST
     LIMIT 15`,
    [destination]
  );

  if (rows.length === 0) return `No contacts found in or near "${destination}".`;

  const lines = rows.map((r: any, idx: number) => {
    const lastDate = r.latest_interaction
      ? new Date(r.latest_interaction).toLocaleDateString("en-AU")
      : "no interactions yet";
    const context = r.last_summary || "no recent interactions";
    return [
      `${idx + 1}. ${r.name} — ${r.role || "unknown role"} at ${r.company || "unknown"}`,
      `   ${r.location} | ${r.interaction_count} interactions | Last: ${lastDate} | Ring: ${r.priority_ring}`,
      `   Context: ${context}`,
    ].join("\n");
  });

  return `${rows.length} contacts in ${destination}:\n\n${lines.join("\n\n")}`;
}
