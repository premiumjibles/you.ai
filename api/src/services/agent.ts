import Anthropic from "@anthropic-ai/sdk";
import type pg from "pg";
import { searchContacts } from "./search.js";
import { draftOutreach } from "./claude.js";
import { scrub } from "./scrubber.js";
import { searchWeb } from "./search-web.js";
import { generateBriefing } from "./scheduler.js";
import {
  dataTools,
  fetchGithubActivity,
  fetchMarketData,
  fetchFinancialData,
  fetchRssFeeds,
  fetchNetworkActivity,
} from "../tools/index.js";
import { getConfig, upsertSetting } from "./config.js";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the user's personal network and briefing assistant. You manage their professional contacts, daily briefings, and outreach drafts. You do not provide general advice, scheduling, or task management — redirect those requests politely.

<behavior>
- Write in plain text. Use a single emoji at the start of each section header (e.g., "📊 Market Update"). No markdown, bullet symbols, or other formatting.
- Be conversational and concise — this is a messaging interface.
- When presenting contact search results, show name, role, and company. Include other fields only if relevant to the user's query.
- When delivering briefings, relay every section in full. Do not summarize or omit topics.
- If a search returns no results or you lack information, say so directly rather than guessing.
- You have a maximum of 10 tool calls per conversation turn. If a task requires more, complete what you can and tell the user what remains.
</behavior>

<tool-routing>
- People questions → contact_search
- Message drafting → outreach_draft (searches contacts and drafts in one call — no need to call contact_search first)
- interaction_history or mutual_connections → always call contact_search first; use the exact "id" field from the result. Never fabricate a UUID. For "who knows X" questions, use mutual_connections.
- Recurring briefing topic management → sub_agent_management
- Current events, news, weather → web_search
- Past briefings / "what was in yesterday's briefing" → briefing_history
- On-demand full briefing (all topics) → trigger_briefing. If it returns empty, tell the user to add topics via sub_agent_management first.
- Interaction frequency / "who do I talk to most" / top contacts / most active → top_contacts
- GitHub repo activity → github_activity
- Crypto prices → market_tracker
- Stock/commodity prices → financial_tracker
- Blog/feed updates → rss_feed
- Recent network interactions → network_activity
- Briefing schedule / delivery time / timezone → briefing_schedule
</tool-routing>

<ad-hoc-vs-recurring>
When the user asks about a data source ("check bitcoin price", "what's new in the react repo"), use the tool directly to fetch results now.
When they want ongoing tracking ("track bitcoin daily", "add react repo to my briefing"), use sub_agent_management to create a recurring topic.
If the intent is ambiguous, fetch the data first, then ask if they want it added to their daily briefing.
</ad-hoc-vs-recurring>

<disambiguation>
- When contact_search returns multiple matches, present them to the user and ask which one they meant before calling interaction_history or mutual_connections.
- When outreach_draft returns drafts, present each one and ask if the user wants to edit, approve, or discard.
- When deactivating a sub-agent, list current topics first to find the matching ID unless the user provides it directly.
</disambiguation>

<briefing-setup>
Before answering any briefing or digest question, call briefing_schedule with action "get" to check current state.

If briefing_time is not set, ask the user two things before proceeding:
1. What time they want their daily briefing (store in 24h format, e.g. "07:00")
2. Their city or region (resolve to an IANA timezone, e.g. "Singapore" → "Asia/Singapore", "London" → "Europe/London")

Use IANA identifiers because the scheduler converts UTC to local time with them. If a location maps to multiple timezones (e.g. "Indiana", "Australia"), name the options and ask which one.
</briefing-setup>`;

const tools: Anthropic.Tool[] = [
  {
    name: "contact_search",
    description: "Search the contact database by name, company, role, location, or interests. Returns matching contacts with their details and relevance score.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query — a name, company, location, or interest" },
      },
      required: ["query"],
    },
  },
  {
    name: "top_contacts",
    description: "Rank contacts by interaction frequency. Use when the user asks about most active relationships, who they talk to most, or top contacts.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of contacts to return (default 10)" },
      },
    },
  },
  {
    name: "interaction_history",
    description: "Get recent interactions (emails, meetings, messages) with a specific contact.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string", description: "The contact's UUID from a previous contact_search result (e.g. '3f2504e0-4f89-11d3-9a0c-0305e82c3301'). Must be a real UUID returned by contact_search." },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "sub_agent_management",
    description: "Manage briefing topics (sub-agents). List current topics, add new ones, or deactivate existing ones.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["list", "create", "deactivate"], description: "The action to perform" },
        name: { type: "string", description: "Display name for the topic (required for create)" },
        type: { type: "string", enum: ["market_tracker", "network_activity", "web_search", "github_activity", "rss_feed", "financial_tracker", "custom"], description: "The sub-agent type (required for create)" },
        config: { type: "object", description: "Configuration object (optional — defaults to {}). Shape depends on the type:\n- market_tracker / network_activity: not needed\n- github_activity: {\"repos\": [\"owner/repo\", ...]}\n- rss_feed: {\"urls\": [\"https://...\"], \"max_items\": 5}\n- financial_tracker: {\"symbols\": [\"AAPL\", \"GC=F\"]}\n- web_search: {\"query\": \"search terms\"}\n- custom: {\"prompt\": \"your prompt text\"}" },
        id: { type: "string", description: "ID of topic to deactivate (required for deactivate)" },
      },
      required: ["action"],
    },
  },
  {
    name: "briefing_history",
    description: "Retrieve past daily briefings. Use when the user asks about what was in a previous briefing or wants to compare briefings across days. For generating a new briefing, use trigger_briefing instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of briefings to retrieve (default 5)" },
      },
    },
  },
  {
    name: "outreach_draft",
    description: "Search for contacts matching a query and draft personalized outreach messages for each. Returns an array of {contact, draft} objects. No need to call contact_search first.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_goal: { type: "string", description: "The goal of the outreach campaign (e.g., 'reconnect after conference', 'introduce new product', 'request intro')" },
        query: { type: "string", description: "Search query to find matching contacts" },
      },
      required: ["campaign_goal", "query"],
    },
  },
  {
    name: "mutual_connections",
    description: "Find people who appear in the same meetings or email threads as a given contact. Use this for connective questions like 'who else knows X' or 'do I know anyone who also knows X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string", description: "The contact's UUID from a previous contact_search result. Must be a real UUID returned by contact_search." },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "trigger_briefing",
    description: "Generate and deliver the daily briefing right now, on demand. Use this when the user asks for their briefing, digest, or summary outside the normal schedule.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "web_search",
    description: "Search the web for current information. Use this when the user asks about recent events, news, weather, or anything that requires up-to-date information.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "briefing_schedule",
    description: "Get or set the daily briefing delivery time.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["get", "set"], description: "Whether to read or update the schedule" },
        time: { type: "string", description: "Delivery time in 24h format e.g. '07:00' (required for set)" },
        timezone: { type: "string", description: "IANA timezone e.g. 'Asia/Singapore' (required for first set)" },
      },
      required: ["action"],
    },
  },
  ...dataTools,
];

export async function executeTool(db: pg.Pool, name: string, input: any): Promise<string> {
  switch (name) {
    case "contact_search": {
      const results = await searchContacts(db, {
        strategy: "combined",
        query: input.query,
        strategies: ["fuzzy_name", "keyword"],
        limit: 10,
      });
      if (results.length === 0) return "No contacts found matching that query.";
      return JSON.stringify(results.map(r => ({
        id: r.id, name: r.name, company: r.company, role: r.role,
        location: r.location, email: r.email, notes: r.notes, score: r.score,
      })));
    }

    case "top_contacts": {
      const { rows } = await db.query(
        `SELECT c.id, c.name, c.company, c.role, COUNT(i.id) AS interaction_count,
                MAX(i.date) AS last_interaction
         FROM contacts c
         JOIN interactions i ON c.id = i.contact_id
         GROUP BY c.id, c.name, c.company, c.role
         ORDER BY interaction_count DESC
         LIMIT $1`,
        [input.limit || 10]
      );
      if (rows.length === 0) return "No interaction data available yet.";
      return JSON.stringify(rows);
    }

    case "interaction_history": {
      const { rows } = await db.query(
        "SELECT type, date, summary, raw_content FROM interactions WHERE contact_id = $1 ORDER BY date DESC LIMIT 10",
        [input.contact_id]
      );
      if (rows.length === 0) return "No interactions found for this contact.";
      return JSON.stringify(rows);
    }

    case "sub_agent_management": {
      if (input.action === "list") {
        const { rows } = await db.query(
          "SELECT id, name, type, config, schedule, active FROM sub_agents WHERE user_id = $1 AND active = true ORDER BY name",
          [process.env.USER_ID || "default"]
        );
        return rows.length === 0 ? "No active briefing topics." : JSON.stringify(rows);
      }
      if (input.action === "create") {
        const { rows } = await db.query(
          `INSERT INTO sub_agents (user_id, type, name, config) VALUES ($1, $2, $3, $4) RETURNING id, name, type`,
          [process.env.USER_ID || "default", input.type || "custom", input.name, JSON.stringify(input.config || {})]
        );
        return `Created topic: ${rows[0].name} (${rows[0].type})`;
      }
      if (input.action === "deactivate") {
        await db.query("UPDATE sub_agents SET active = false WHERE id = $1", [input.id]);
        return "Topic deactivated.";
      }
      return "Unknown action.";
    }

    case "briefing_history": {
      const { rows } = await db.query(
        "SELECT date::text, content FROM briefings WHERE user_id = $1 ORDER BY date DESC LIMIT $2",
        [process.env.USER_ID || "default", input.limit || 5]
      );
      if (rows.length === 0) return "No briefings yet.";
      return JSON.stringify(rows);
    }

    case "outreach_draft": {
      const contacts = await searchContacts(db, {
        strategy: "combined",
        query: input.query,
        strategies: ["fuzzy_name", "keyword"],
        limit: 5,
      });
      if (contacts.length === 0) return "No matching contacts found for outreach.";

      const drafts = [];
      for (const contact of contacts) {
        const { rows: interactions } = await db.query(
          "SELECT summary FROM interactions WHERE contact_id = $1 ORDER BY date DESC LIMIT 5",
          [contact.id]
        );
        const draft = await draftOutreach(input.campaign_goal, contact, interactions);
        drafts.push({ contact: { name: contact.name, company: contact.company }, draft: scrub(draft) });
      }
      return JSON.stringify(drafts);
    }

    case "mutual_connections": {
      const { rows } = await db.query(
        `SELECT c.id, c.name, c.company, c.role, COUNT(DISTINCT i2.group_id) AS shared_events
         FROM interactions i1
         JOIN interactions i2 ON i1.group_id = i2.group_id AND i1.contact_id != i2.contact_id
         JOIN contacts c ON c.id = i2.contact_id
         WHERE i1.contact_id = $1 AND i1.group_id IS NOT NULL
         GROUP BY c.id, c.name, c.company, c.role
         ORDER BY shared_events DESC
         LIMIT 20`,
        [input.contact_id]
      );
      if (rows.length === 0) return "No mutual connections found for this contact.";
      return JSON.stringify(rows);
    }

    case "trigger_briefing": {
      return await generateBriefing(db);
    }

    case "web_search": {
      try {
        const results = await searchWeb(input.query);
        if (results.length === 0) return "No web results found for that query.";
        return JSON.stringify(results);
      } catch (err: any) {
        return err.message || "Web search failed.";
      }
    }

    case "github_activity":
      return await fetchGithubActivity(input);

    case "market_tracker":
      return await fetchMarketData(input);

    case "financial_tracker":
      return await fetchFinancialData(input);

    case "rss_feed":
      return await fetchRssFeeds(input);

    case "network_activity":
      return await fetchNetworkActivity(db, input);

    case "briefing_schedule": {
      if (input.action === "get") {
        const time = await getConfig(db, "briefing_time");
        const tz = await getConfig(db, "timezone");
        return JSON.stringify({
          briefing_time: time || "not set",
          timezone: tz || "not set",
        });
      }
      if (input.action === "set") {
        if (!input.time) return "Please provide a delivery time (e.g. '07:00').";
        const existingTz = await getConfig(db, "timezone");
        const tz = input.timezone || existingTz;
        if (!tz) return "Please provide a timezone (e.g. 'Asia/Singapore') — none is stored yet.";
        await upsertSetting(db, "briefing_time", input.time);
        if (input.timezone) await upsertSetting(db, "timezone", input.timezone);
        return `Briefing schedule set: ${input.time} (${tz})`;
      }
      return "Unknown action. Use 'get' or 'set'.";
    }

    default:
      return "Unknown tool.";
  }
}

export async function handleChatMessage(
  db: pg.Pool,
  sessionId: string,
  userMessage: string
): Promise<string> {
  const { rows: history } = await db.query(
    "SELECT role, content FROM (SELECT role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20) sub ORDER BY created_at ASC",
    [sessionId]
  );

  const messages: Anthropic.MessageParam[] = history.map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
  }));
  messages.push({ role: "user", content: userMessage });

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools,
    messages,
  });

  let iterations = 0;
  while (response.stop_reason === "tool_use" && iterations < 10) {
    iterations++;

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ContentBlock & { type: "tool_use" } => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(db, block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });
  }

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const assistantMessage = textBlocks.map((b) => b.text).join("\n") || "I couldn't generate a response.";

  await db.query(
    "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)",
    [sessionId, userMessage]
  );
  await db.query(
    "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)",
    [sessionId, assistantMessage]
  );

  return assistantMessage;
}
