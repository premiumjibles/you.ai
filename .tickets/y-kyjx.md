---
id: y-kyjx
status: closed
deps: []
links: []
created: 2026-03-24T00:22:48Z
type: feature
priority: 2
assignee: Jibles
---
# RSS feed sub-agent type

## Objective

Add an `rss_feed` sub-agent type so users can create briefing topics that pull headlines from RSS/Atom feeds (e.g., TechCrunch, CoinDesk, portfolio company blogs). Currently there's no way to ingest syndicated content into the briefing pipeline.

## User Story

As a user, I want to add RSS feeds as briefing topics so my morning briefing includes headlines from sources I follow, without relying on web search to find them.

## Context & Findings

- Sub-agent execution is a switch statement in `api/src/services/scheduler.ts` inside `executeSubAgent()`. Each case fetches data and returns a formatted string. The `web_search` and `market_tracker` cases are the closest patterns to follow.
- Sub-agent config is JSONB — no schema migration needed. Config shape: `{ urls: ["https://..."], max_items?: number }`.
- The chat agent's `sub_agent_management` tool (agent.ts) already passes `type` and `config` to the DB, so users can create RSS sub-agents via chat.
- The `rss-parser` npm package (MIT, 1.5M weekly downloads) handles both RSS 2.0 and Atom feeds with a simple async API: `new Parser().parseURL(url)` returns `{ items: [{ title, link, contentSnippet, pubDate }] }`.
- Rejected: writing a custom XML parser — unnecessary when rss-parser handles all common formats.
- Rejected: storing feed items in DB — for MVP, just fetch and format for the briefing. Persistence can come later.

## Files

- `api/src/services/scheduler.ts` — add `case "rss_feed"` in `executeSubAgent` switch. Fetch each URL via rss-parser, collect recent items (last 24h or max_items, default 10), format as "Title — Source (URL)".
- `api/src/services/agent.ts` — update system prompt to list `rss_feed` as a valid sub-agent type with config example `{ urls: ["https://..."], max_items: 10 }`.
- `api/package.json` — add `rss-parser` dependency.

Reference patterns:
- `executeSubAgent` cases in `api/src/services/scheduler.ts` — follow the market_tracker/web_search pattern.
- System prompt in `api/src/services/agent.ts` — where valid sub-agent types are listed.

## Acceptance Criteria

- [ ] `rss-parser` added to api/package.json dependencies
- [ ] `executeSubAgent` handles `rss_feed` type: parses each URL in `config.urls`, returns formatted headlines
- [ ] Items filtered to last 24 hours when pubDate is available, otherwise capped at `config.max_items` (default 10)
- [ ] Gracefully handles unreachable feeds (log warning, skip, don't crash the briefing)
- [ ] System prompt in agent.ts lists `rss_feed` as a valid type with config example
- [ ] Morning briefing includes RSS headlines when `rss_feed` sub-agents are active
- [ ] Lint and type-check pass

## Gotchas

- Some feeds don't include pubDate on items — fall back to max_items limit rather than filtering by date
- rss-parser can throw on malformed XML — wrap in try/catch per URL so one bad feed doesn't kill the whole sub-agent
- Feed URLs may redirect (HTTP→HTTPS) — rss-parser handles this but timeouts should be set (5s) to avoid hanging the briefing pipeline
