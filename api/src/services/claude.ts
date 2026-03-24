import { getProvider, extractText } from "./llm/index.js";

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
  let prompt = "You are assembling a daily briefing for a chat app. Consolidate the following sub-agent outputs into one coherent briefing. Cross-reference related items. Use plain text only — no markdown, no asterisks, no formatting symbols. Use emoji sparingly for section headers and visual structure.\n\n";

  if (history.length > 0) {
    prompt += "## Recent Briefings (for context and continuity)\n\n";
    for (const h of history) {
      prompt += `### ${h.date}\n${h.content}\n\n`;
    }
  }

  prompt += "## Today's Sub-Agent Reports\n\n";
  for (const o of outputs) {
    prompt += `### ${o.name}\n${o.output}\n\n`;
  }

  prompt += "Write a concise, well-structured daily briefing. Reference prior briefings where relevant (e.g., 'continuing from yesterday...').";
  return prompt;
}

export function buildOutreachPrompt(
  campaignGoal: string,
  contact: { name: string; company?: string | null; role?: string | null; notes?: string | null },
  interactions: { summary?: string | null }[]
): string {
  let prompt = `Draft a personalized outreach message for the following campaign goal: "${campaignGoal}"\n\n`;
  prompt += `## Contact\n- Name: ${contact.name}\n`;
  if (contact.company) prompt += `- Company: ${contact.company}\n`;
  if (contact.role) prompt += `- Role: ${contact.role}\n`;
  if (contact.notes) prompt += `- Notes: ${contact.notes}\n`;

  if (interactions.length > 0) {
    prompt += "\n## Interaction History\n";
    for (const i of interactions) {
      if (i.summary) prompt += `- ${i.summary}\n`;
    }
  }

  prompt += "\nWrite a warm, personalized message. Reference shared context from interactions. Keep it concise (3-5 sentences). Do not be overly formal.";
  return prompt;
}

export async function classifySearchIntent(
  query: string
): Promise<{ strategies: string[]; reasoning: string }> {
  const provider = getProvider();
  const response = await provider.chat({
    model: "fast",
    maxTokens: 200,
    messages: [
      {
        role: "user",
        content: `Classify this contact search query into one or more strategies. Respond with JSON only.
Strategies: "fuzzy_name" (looking up a person by name), "keyword" (searching by role/company/location), "semantic" (conceptual/interest-based query)

Query: "${query}"

Respond: {"strategies": [...], "reasoning": "..."}`,
      },
    ],
  });
  const text = extractText(response);
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
  const provider = getProvider();
  const response = await provider.chat({
    model: "fast",
    maxTokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  return extractText(response);
}

export async function draftOutreach(
  campaignGoal: string,
  contact: any,
  interactions: any[]
): Promise<string> {
  const prompt = buildOutreachPrompt(campaignGoal, contact, interactions);
  const provider = getProvider();
  const response = await provider.chat({
    model: "fast",
    maxTokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  return extractText(response);
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
  let prompt = `Generate an investment memo / one-pager for the company: "${company}"\n\n`;

  if (contacts.length > 0) {
    prompt += "## Known Contacts\n";
    for (const c of contacts) {
      prompt += `- ${c.name}`;
      if (c.role) prompt += ` (${c.role})`;
      if (c.email) prompt += ` — ${c.email}`;
      if (c.notes) prompt += ` — ${c.notes}`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (contactInteractions.length > 0) {
    prompt += "## Recent Interactions\n";
    for (const ci of contactInteractions) {
      if (ci.interactions.length === 0) continue;
      prompt += `### ${ci.contact.name}\n`;
      for (const i of ci.interactions) {
        const prefix = i.date ? `[${i.date}] ` : "";
        if (i.summary) prompt += `- ${prefix}${i.summary}\n`;
      }
    }
    prompt += "\n";
  }

  if (webContext) {
    prompt += `## Web Research\n${webContext}\n\n`;
  }

  prompt += `Structure your response as an investment memo with these sections:
## Company Overview
Brief description of what the company does, their market, and value proposition.

## Key Contacts
Summary of our relationship contacts at this company and their roles.

## Recent Interactions
Highlight key themes and takeaways from our interactions.

## Current News & Context
Any relevant context from web research (if available) or general knowledge.

## Summary & Recommendation
Concise assessment of the relationship and suggested next steps.

If you have limited information for any section, note what's missing and provide what you can. Be concise and actionable.`;
  return prompt;
}

export async function generateMemo(
  company: string,
  contacts: MemoContact[],
  contactInteractions: { contact: MemoContact; interactions: MemoInteraction[] }[],
  webContext?: string | null
): Promise<string> {
  const prompt = buildMemoPrompt(company, contacts, contactInteractions, webContext);
  const provider = getProvider();
  const response = await provider.chat({
    model: "fast",
    maxTokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  return extractText(response);
}

export async function summarizeInteraction(content: string): Promise<string> {
  const provider = getProvider();
  const response = await provider.chat({
    model: "fast",
    maxTokens: 200,
    messages: [
      {
        role: "user",
        content: `Summarize this interaction in 1-2 sentences. Focus on what was discussed and any action items:\n\n${content}`,
      },
    ],
  });
  return extractText(response);
}
