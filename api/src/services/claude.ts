import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

function briefingSystem(): string {
  return `You consolidate sub-agent reports into a single daily briefing for a chat app. Today's date: ${new Date().toISOString().split("T")[0]}.

<format>
- Plain text with a single emoji at the start of each section header.
- Order sections by actionability: items requiring user attention first, informational items after.
- When items from different reports relate (e.g., a contact's company appears in market news), mention the connection inline.
- If a sub-agent report is empty or errored, note it in one line and move on.
- Reference prior briefings when a topic is continuing (e.g., "Bitcoin is up 4% — continuing the rally noted yesterday").
- If two reports present conflicting data (e.g., different price figures), include both with their sources rather than choosing one.
- Keep total length under 2000 words.
</format>`;
}

const OUTREACH_SYSTEM = `You draft personalized outreach messages for a networking assistant.
Write warm, concise messages (3-5 sentences) in plain text, suitable for email or direct message.
Reference shared context from interaction history when available. If none exists, reference the contact's role or a shared interest.
Match formality to the relationship depth — warmer for existing contacts, more professional for new ones.
If the campaign goal is vague (e.g., "reach out" or "connect"), default to a warm check-in tone referencing the most recent interaction.
Each message should feel unique — vary the opening and the specific detail referenced, even for contacts with similar profiles.
Do not include phone numbers, physical addresses, or financial details in drafts.`;

const MEMO_SYSTEM = `You are a deal team analyst preparing investment memos from CRM data and web research.

Structure: Company Overview, Key Contacts, Recent Interactions, Current News & Context, Summary & Recommendation.
Write in concise prose. Each section: 2-3 sentences unless the data warrants more.
In Summary & Recommendation, propose concrete next steps (e.g., "Schedule intro call with [contact]" or "Monitor Q3 earnings before re-engaging").
If you have limited information for any section, note what is missing and provide what you can.`;

interface SubAgentOutput {
  name: string;
  output: string;
}

interface BriefingHistory {
  date: string;
  content: string;
}

export function buildBriefingPrompt(
  outputs: SubAgentOutput[],
  history: BriefingHistory[]
): string {
  let prompt = "";

  if (history.length > 0) {
    prompt += "<recent-briefings>\n";
    for (const h of history) {
      prompt += `[${h.date}]\n${h.content}\n\n`;
    }
    prompt += "</recent-briefings>\n\n";
  }

  prompt += "<reports>\n";
  for (const o of outputs) {
    prompt += `[${o.name}]\n${o.output}\n\n`;
  }
  prompt += "</reports>";

  return prompt;
}

export function buildOutreachPrompt(
  campaignGoal: string,
  contact: { name: string; company?: string | null; role?: string | null; notes?: string | null },
  interactions: { summary?: string | null }[]
): string {
  let prompt = `Campaign goal: "${campaignGoal}"\n\n`;
  prompt += `<contact>\nName: ${contact.name}\n`;
  if (contact.company) prompt += `Company: ${contact.company}\n`;
  if (contact.role) prompt += `Role: ${contact.role}\n`;
  if (contact.notes) prompt += `Notes: ${contact.notes}\n`;
  prompt += "</contact>\n";

  if (interactions.length > 0) {
    prompt += "\n<interactions>\n";
    for (const i of interactions) {
      if (i.summary) prompt += `- ${i.summary}\n`;
    }
    prompt += "</interactions>\n";
  }

  return prompt;
}

export async function classifySearchIntent(
  query: string
): Promise<{ strategies: string[]; reasoning: string }> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: `Classify contact search queries into one or more strategies. Respond with a JSON object only, no surrounding text.

Strategies:
- "fuzzy_name": looking up a person by name
- "keyword": searching by role, company, or location
- "semantic": conceptual or interest-based query

<example>
Input: "John Smith"
Output: {"strategies": ["fuzzy_name"], "reasoning": "Direct name lookup"}
</example>
<example>
Input: "engineers at Google"
Output: {"strategies": ["keyword"], "reasoning": "Role and company filter"}
</example>
<example>
Input: "someone who knows about ML infrastructure"
Output: {"strategies": ["semantic", "keyword"], "reasoning": "Conceptual interest plus keyword match"}
</example>
<example>
Input: "Sarah from the fintech startup in NYC"
Output: {"strategies": ["fuzzy_name", "keyword"], "reasoning": "Name plus company and location context"}
</example>`,
    messages: [
      {
        role: "user",
        content: `Query: "${query}"`,
      },
    ],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return { strategies: ["fuzzy_name"], reasoning: "Failed to parse LLM response, using default" };
  }
}

export async function consolidateBriefing(
  outputs: SubAgentOutput[],
  history: BriefingHistory[]
): Promise<string> {
  const prompt = buildBriefingPrompt(outputs, history);
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: briefingSystem(),
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function draftOutreach(
  campaignGoal: string,
  contact: any,
  interactions: any[]
): Promise<string> {
  const prompt = buildOutreachPrompt(campaignGoal, contact, interactions);
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: OUTREACH_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

interface MemoContact {
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  notes?: string | null;
}

interface MemoInteraction {
  summary?: string | null;
  date?: string | null;
}

export function buildMemoPrompt(
  company: string,
  contacts: MemoContact[],
  contactInteractions: { contact: MemoContact; interactions: MemoInteraction[] }[],
  webContext?: string | null
): string {
  let prompt = `Company: "${company}"\n\n`;

  if (contacts.length > 0) {
    prompt += "<contacts>\n";
    for (const c of contacts) {
      prompt += `- ${c.name}`;
      if (c.role) prompt += ` (${c.role})`;
      if (c.email) prompt += ` — ${c.email}`;
      if (c.notes) prompt += ` — ${c.notes}`;
      prompt += "\n";
    }
    prompt += "</contacts>\n\n";
  }

  if (contactInteractions.length > 0) {
    prompt += "<interactions>\n";
    for (const ci of contactInteractions) {
      if (ci.interactions.length === 0) continue;
      prompt += `[${ci.contact.name}]\n`;
      for (const i of ci.interactions) {
        const prefix = i.date ? `[${i.date}] ` : "";
        if (i.summary) prompt += `- ${prefix}${i.summary}\n`;
      }
    }
    prompt += "</interactions>\n\n";
  }

  if (webContext) {
    prompt += `<web-research>\n${webContext}\n</web-research>\n\n`;
  }

  return prompt.trimEnd();
}

export async function generateMemo(
  company: string,
  contacts: MemoContact[],
  contactInteractions: { contact: MemoContact; interactions: MemoInteraction[] }[],
  webContext?: string | null
): Promise<string> {
  const prompt = buildMemoPrompt(company, contacts, contactInteractions, webContext);
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: MEMO_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function summarizeInteraction(content: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: "Summarize this interaction in 1-2 sentences. Lead with the main topic, then key decisions or action items. Name participants when present. Ignore email signatures, legal disclaimers, and forwarded headers.",
    messages: [
      {
        role: "user",
        content: content,
      },
    ],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
