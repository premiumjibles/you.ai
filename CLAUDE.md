# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

You.ai is a personal AI assistant that delivers daily briefings from configurable sub-agent data sources, natural language contact search (semantic + fuzzy), AI-drafted outreach messages, and human-in-the-loop approval via Telegram (default) or WhatsApp.

**Stack:** TypeScript + Express.js, PostgreSQL 17 (pgvector, pg_trgm), Claude API (Anthropic SDK), grammy (Telegram), Docker Compose, Vitest.

## Commands

All commands run from `api/`:

```bash
npm run dev          # Dev server with hot reload (tsx watch)
npm run build        # TypeScript compilation (tsc)
npm run start        # Production (node dist/index.js)
npm test             # Vitest watch mode
npm run test:run     # Single test run (CI)
```

Run a single test file:
```bash
npx vitest run src/routes/__tests__/contacts.test.ts
```

Docker (from repo root):
```bash
./setup.sh                    # First-time setup (generates .env, starts containers)
docker compose up --build     # Rebuild and start all services
```

## Architecture

### Entry Point & Routing

`api/src/index.ts` — Express server on port 3000. Mounts route modules under `/api`, initializes the Telegram bot (long-polling) or WhatsApp webhook, and starts the cron scheduler. The `db` pool is injected into route factories.

### Services Layer (`api/src/services/`)

- **agent.ts** — Agentic chat loop using Claude (sonnet model) with 8 tools (contact_search, interaction_history, sub_agent_management, briefing_history, outreach_draft, mutual_connections, trigger_briefing, web_search). Max 10 tool-use iterations per turn. Messages persisted in `chat_messages` table.
- **scheduler.ts** — Cron-driven briefing assembly. Executes sub-agents by type (market_tracker → CoinGecko, financial_tracker → Yahoo Finance, github_activity → GitHub API, rss_feed, web_search → Tavily, network_activity, custom → Claude prompt). Consolidates outputs via Claude haiku. Also runs urgent alert checks on a separate cron.
- **search.ts** — Three parallel search strategies: fuzzy (pg_trgm similarity), keyword (tsvector full-text), semantic (pgvector cosine distance). Results merged and deduplicated.
- **claude.ts** — Prompt construction for briefing consolidation, outreach drafting, interaction summarization, investment memos. Uses haiku for all non-agent calls.
- **messaging/** — Provider pattern: `MessagingProvider` interface implemented by `telegram.ts` (grammy long-polling) and `whatsapp.ts` (Evolution API webhook). Factory in `index.ts` selects based on `MESSAGING_PROVIDER` env var.
- **embeddings.ts** — OpenAI text-embedding-3-small for contact semantic search. Optional (disabled if no `OPENAI_API_KEY`).

### Database (`postgres/init.sql`)

Core tables: `contacts` (with tsvector, trigram, and vector indexes), `interactions`, `sub_agents` (JSONB config), `briefings`, `chat_messages`. Uses uuid-ossp, vector, and pg_trgm extensions.

### Key Patterns

- Route handlers receive the `pg.Pool` as a dependency via factory functions
- Claude agentic loop: multi-turn tool use with tool results fed back until `end_turn` or iteration limit
- Sub-agent executor dispatches by `type` field to appropriate API/service
- PII scrubbing (`scrubber.ts`) before outreach generation

## Environment Variables

Required: `ANTHROPIC_API_KEY`, `POSTGRES_*`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OWNER_ID` (or WhatsApp equivalents). See `.env.example` for full list. `setup.sh` auto-generates secrets on first run.

## Testing

Vitest with 15s test timeout, 30s hook timeout. Test files live alongside source in `__tests__/` directories. Tests use mocking for external services (Claude, database).
