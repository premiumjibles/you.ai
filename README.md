# You.ai

Personal AI assistant POC that delivers daily briefings, natural language contact search (semantic + fuzzy), and AI-drafted outreach messages with human-in-the-loop approval via Telegram (default) or WhatsApp.

## Quick Start

**Prerequisites:** Docker, Docker Compose

```bash
# 1. Clone and enter the repo
cd you.ai

# 2. Run setup (creates .env on first run)
./setup.sh

# 3. Edit .env with your API keys
#    Required: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN

# 4. Run setup again to start services
./setup.sh

# (Optional) To use WhatsApp instead of Telegram:
#   Set MESSAGING_PROVIDER=whatsapp in .env
#   docker compose --profile whatsapp up -d
```

Services will be available at:
- **API:** http://localhost:3000
- **Evolution API (WhatsApp only):** http://localhost:8080 — only when started with `--profile whatsapp`

See [SETUP-GUIDE.md](SETUP-GUIDE.md) for detailed WhatsApp configuration.

## Architecture

```
  ┌──────────────────┐     ┌──────────────────────┐
  │   Telegram Bot   │     │   Evolution API       │
  │   (grammy)       │◀──  │   (WhatsApp, optional)│
  │   long-polling   │     │   :8080               │
  └────────┬─────────┘     └──────────┬────────────┘
           │                          │ webhook
           ▼                          ▼
         ┌──────────────────────────────┐
         │   API (Express + TypeScript) │
         │   :3000                      │
         │   + cron scheduler           │
         │   + sub-agent executor       │
         └──────────────┬───────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   Postgres 17   │
              │   pgvector      │
              │   pg_trgm       │
              │   :5432         │
              └─────────────────┘
```

The API service handles all logic: chat via Telegram (default) or WhatsApp, scheduled briefings and alerts (cron), sub-agent data collection, contact search, outreach drafting, and data import. Postgres stores contacts (with vector embeddings), briefings, interactions, and sub-agent configs.

## API Endpoints

All routes are prefixed with `/api` except health.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/chat/webhook` | Chat webhook (WhatsApp via Evolution API; Telegram uses long-polling instead) |
| GET | `/api/chat/history/:session_id` | Get chat history for a session (`?limit=`) |
| POST | `/api/contacts/search` | Search contacts (semantic, fuzzy, or combined) |
| POST | `/api/contacts/ingest` | Upsert a single contact |
| POST | `/api/contacts/ingest/csv` | Bulk-import contacts from CSV string |
| GET | `/api/briefings/history` | Get past briefings (`?user_id=&limit=`) |
| POST | `/api/briefings/assemble` | Generate a briefing from sub-agent outputs via Claude |
| POST | `/api/briefings/store` | Store a pre-built briefing |
| POST | `/api/briefings/matchmaking` | Suggest matches for meeting attendees |
| POST | `/api/briefings/trigger` | Manually trigger a briefing and send it |
| POST | `/api/outreach/draft` | Draft outreach messages for a campaign goal |
| POST | `/api/outreach/memo` | Generate an investment memo for a company |
| POST | `/api/interactions` | Log an interaction (auto-summarized by Claude) |
| GET | `/api/interactions/:contact_id` | Get interactions for a contact |
| GET | `/api/sub-agents` | List active sub-agents |
| POST | `/api/sub-agents` | Create a sub-agent |
| PATCH | `/api/sub-agents/:id` | Update a sub-agent |
| DELETE | `/api/sub-agents/:id` | Soft-delete a sub-agent |
| POST | `/api/import/mbox` | Import contacts/interactions from mbox email export |
| POST | `/api/import/ics` | Import events from ICS calendar file |
| POST | `/api/import/csv` | Import contacts from CSV file |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `PASSWORD` / `DB` | Postgres credentials and database name |
| `DATABASE_URL` | Full Postgres connection string (used by API) |
| `ANTHROPIC_API_KEY` | **Required.** Claude API key for briefing assembly, outreach drafting, interaction summaries |
| `MESSAGING_PROVIDER` | `telegram` (default) or `whatsapp` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (required when using Telegram) |
| `TELEGRAM_OWNER_ID` | Telegram user ID of the bot owner |
| `EVOLUTION_API_URL` / `KEY` | Evolution API connection (only needed for WhatsApp) |
| `EVOLUTION_INSTANCE` | Evolution API instance name (default: `youai`) |
| `WHATSAPP_OWNER_JID` | WhatsApp JID of the bot owner (only needed for WhatsApp) |
| `OWNER_EMAIL` | Your email address — filtered out of contact imports |
| `OPENAI_API_KEY` | OpenAI key for embedding generation (optional, enables semantic search) |
| `EMBEDDING_MODEL` | Embedding model name (default: `text-embedding-3-small`) |
| `EMBEDDING_DIMENSIONS` | Embedding vector size (default: `1536`) |
| `TAVILY_API_KEY` | Tavily API key (optional, enables web search in briefings and chat) |
| `GITHUB_TOKEN` | GitHub token (optional, enables `github_activity` sub-agent, higher rate limits) |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage key (optional, alternative financial data for commodities/forex) |
| `API_PORT` / `API_HOST` | API server bind address (default: `3000` / `0.0.0.0`) |
| `BRIEFING_HISTORY_COUNT` | Number of past briefings included as context (default: `5`) |
| `BRIEFING_CRON` | Cron expression for morning briefing (default: `0 7 * * *`) |
| `ALERT_CRON` | Cron expression for urgent alert checks (default: `*/15 * * * *`) |

## Sub-Agent Types

Sub-agents are data sources that feed into daily briefings. Create them via `POST /api/sub-agents`.

| Type | Description | Config example |
|------|-------------|----------------|
| `market_tracker` | Crypto prices via CoinGecko | `{ "assets": ["bitcoin", "ethereum"] }` |
| `financial_tracker` | Stocks, commodities, indices via Yahoo Finance | `{ "symbols": ["AAPL", "GC=F", "^GSPC"] }` |
| `network_activity` | Recent interactions from your contacts | — |
| `web_search` | Web search via Tavily API | `{ "query": "AI funding news" }` |
| `github_activity` | Repo commits and merged PRs (last 24h) | `{ "repos": ["owner/repo"], "include_prs": true }` |
| `rss_feed` | RSS/Atom feed headlines | `{ "urls": ["https://..."], "max_items": 10 }` |
| `custom` | Free-form Claude prompt | `{ "prompt": "Summarize today's macro outlook" }` |
