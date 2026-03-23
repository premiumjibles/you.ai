---
id: y-fstb
status: open
deps: []
links: []
created: 2026-03-23T21:40:47Z
type: feature
priority: 2
assignee: Jibles
---
# Web-search sub-agents for daily briefings and chat

## Objective

Add a `web_search` sub-agent type so users can create briefing topics that pull live information from the web (e.g., "latest terrorism information in Panama", "weather in Panama City", "AI regulation news"). Also add `web_search` as a tool available to the chat agent so conversational queries can fetch real-time information on demand.

Currently, the `custom` sub-agent type (scheduler.ts:110-124) sends a bare prompt to Claude Haiku with no internet access — Claude answers from training data, producing stale or hallucinated results for anything time-sensitive. The chat agent (agent.ts) has 5 tools, all pointed at the internal database — no way to look anything up externally.

## User Story

As a user, I want to create briefing topics like "Panama security news" or "crypto regulatory updates" and get real, current information in my daily briefing — not LLM confabulations. I also want to ask the chat agent ad-hoc questions about current events and get web-sourced answers.

## Design Constraints

- Use Tavily Search API (tavily.com) — single REST call returns clean, summarized text; no HTML parsing needed. Free tier: 1,000 searches/month, sufficient for PoC.
- `TAVILY_API_KEY` env var, optional — web search gracefully skipped if not set (like OpenAI embeddings today).
- The `web_search` sub-agent type should accept a `query` config field (the search query template) and optionally a `search_depth` field ("basic" or "advanced").
- The chat agent's `web_search` tool should let Claude decide autonomously when a question needs live info vs. a database lookup.

## Context & Findings

- **Current sub-agent types** (scheduler.ts:79-128): `market_tracker` (CoinGecko API), `network_activity` (DB query), `custom` (bare Claude prompt). The `custom` type is the closest to what we want but has no web access.
- **Current chat agent tools** (agent.ts:15-75): `contact_search`, `interaction_history`, `sub_agent_management`, `briefing_history`, `outreach_draft`. All internal.
- **Sub-agent config schema** (init.sql:52): `config JSONB DEFAULT '{}'` — flexible, no migration needed for new config fields.
- **Sub-agent creation flow** (agent.ts:109-114): The `sub_agent_management` tool's `create` action already accepts `type` and `config`, so users can create `web_search` sub-agents via chat ("add a briefing topic for Panama news") without code changes to the creation flow.
- **Tavily API**: POST to `https://api.tavily.com/search` with `{ api_key, query, search_depth }`. Returns `{ results: [{ title, url, content }] }`. Simple, no SDK needed — plain `fetch`.

**Rejected approaches:**
- Brave Search API: requires parsing HTML snippets, more work for no benefit at PoC stage.
- Serper/SerpAPI: Google search proxies with rate limits and heavier responses.
- Claude with tool_use in sub-agent runner: overkill — for a predefined search query we can just call the search API directly and pass results to Claude for synthesis.
- Adding a full browser/scraping capability: way too heavy for PoC, Tavily's summarized results are sufficient.

## Files

- `api/src/services/scheduler.ts` — add `web_search` case to `executeSubAgent` switch (line 82). Calls Tavily API with `config.query`, returns formatted results. If no API key, return a message saying web search is not configured.
- `api/src/services/agent.ts` — add `web_search` tool definition to the `tools` array (after line 74). Add handler in `executeTool` switch. The tool takes a `query` string, calls Tavily, returns results as text for Claude to synthesize.
- `api/src/services/search-web.ts` — new file. Thin wrapper around Tavily REST API: `searchWeb(query: string, opts?: { searchDepth?: string }): Promise<{ title: string, url: string, content: string }[]>`. Shared by both the sub-agent runner and the chat agent tool.
- `.env.example` — add `TAVILY_API_KEY=` entry.

Reference patterns:
- `executeSubAgent` switch cases in `api/src/services/scheduler.ts:82-128` — follow the same pattern (check config, call external API, format output string).
- Tool definitions in `api/src/services/agent.ts:15-75` — follow the same `Anthropic.Tool` shape.
- `executeTool` switch cases in `api/src/services/agent.ts:77-156` — follow existing pattern.

## Acceptance Criteria

- [ ] New file `api/src/services/search-web.ts` with `searchWeb()` function calling Tavily REST API
- [ ] `executeSubAgent` in scheduler.ts handles `web_search` type: calls `searchWeb(config.query)`, formats results with title + URL + summary
- [ ] If `TAVILY_API_KEY` is not set, `searchWeb` returns an informative error (not a crash)
- [ ] Chat agent has a `web_search` tool that takes a `query` param and returns Tavily results
- [ ] System prompt in agent.ts updated to tell Claude it can search the web for current information
- [ ] `.env.example` includes `TAVILY_API_KEY`
- [ ] User can create a web_search sub-agent via chat: "add a briefing topic for Panama security news" → creates sub-agent with type `web_search` and appropriate query config
- [ ] Morning briefing includes web search results when `web_search` sub-agents are active
- [ ] Lint and type-check pass (`npm run build`)

## Gotchas

- Tavily free tier is 1,000 searches/month. With 5 web_search sub-agents running daily + alerts every 15 min, you could burn through this fast. For PoC, only run web_search sub-agents during morning briefing (not in `runUrgentAlerts`).
- The `sub_agent_management` create action (agent.ts:109-114) already passes `input.type` and `input.config` to the DB — no changes needed there. But the system prompt should mention `web_search` as a valid type so Claude knows to use it.
- Tavily returns `content` fields that can be long. Truncate or limit results count (top 5) to avoid blowing up the briefing consolidation prompt's token budget.
