import Anthropic from "@anthropic-ai/sdk";
import type pg from "pg";
import { searchContacts } from "./search.js";
import { draftOutreach } from "./claude.js";
import { scrub } from "./scrubber.js";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Dorjee's personal AI assistant. You help manage contacts, search for people in the network, draft outreach messages, and provide briefing summaries.

When the user asks about people, search for them. When they ask you to draft messages, use the outreach tool. Be concise and conversational — this is WhatsApp, not email.

If the user wants to add or manage briefing topics, use the sub-agent management tool.`;

const tools: Anthropic.Tool[] = [
  {
    name: "contact_search",
    description: "Search the contact database by name, company, role, location, or interests. Use for any query about people in the network.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query — a name, company, location, or interest" },
      },
      required: ["query"],
    },
  },
  {
    name: "interaction_history",
    description: "Get recent interactions (emails, meetings, messages) with a specific contact.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string", description: "The contact's UUID" },
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
        name: { type: "string", description: "Name for a new topic (required for create)" },
        type: { type: "string", description: "Type: market_tracker, network_activity, or custom (required for create)" },
        config: { type: "object", description: "Configuration for the topic (optional)" },
        id: { type: "string", description: "ID of topic to deactivate (required for deactivate)" },
      },
      required: ["action"],
    },
  },
  {
    name: "briefing_history",
    description: "Get recent daily briefings.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of briefings to retrieve (default 5)" },
      },
    },
  },
  {
    name: "outreach_draft",
    description: "Draft personalized outreach messages for contacts matching a query.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_goal: { type: "string", description: "What the outreach is for" },
        query: { type: "string", description: "Search query to find matching contacts" },
      },
      required: ["campaign_goal", "query"],
    },
  },
];

async function executeTool(db: pg.Pool, name: string, input: any): Promise<string> {
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
          "SELECT id, name, type, config, schedule, active FROM sub_agents WHERE user_id = 'sean' AND active = true ORDER BY name"
        );
        return rows.length === 0 ? "No active briefing topics." : JSON.stringify(rows);
      }
      if (input.action === "create") {
        const { rows } = await db.query(
          `INSERT INTO sub_agents (user_id, type, name, config) VALUES ('sean', $1, $2, $3) RETURNING id, name, type`,
          [input.type || "custom", input.name, JSON.stringify(input.config || {})]
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
        "SELECT date::text, content FROM briefings WHERE user_id = 'sean' ORDER BY date DESC LIMIT $1",
        [input.limit || 5]
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
    "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20",
    [sessionId]
  );

  const messages: Anthropic.MessageParam[] = history.map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
  }));
  messages.push({ role: "user", content: userMessage });

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20260401",
    max_tokens: 1024,
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
      model: "claude-sonnet-4-6-20260401",
      max_tokens: 1024,
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
