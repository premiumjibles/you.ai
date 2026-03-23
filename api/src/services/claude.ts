import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

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
  let prompt = "You are assembling a daily briefing. Consolidate the following sub-agent outputs into one coherent briefing. Cross-reference related items.\n\n";

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
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
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
    model: "claude-sonnet-4-6-20260401",
    max_tokens: 2000,
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
    model: "claude-opus-4-6-20260401",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function summarizeInteraction(content: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Summarize this interaction in 1-2 sentences. Focus on what was discussed and any action items:\n\n${content}`,
      },
    ],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
