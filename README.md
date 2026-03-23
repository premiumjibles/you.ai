# Dorjee.ai

Personal AI assistant POC that delivers daily briefings, natural language contact search (semantic + fuzzy), and AI-drafted outreach messages with human-in-the-loop approval.

## Quick Start

**Prerequisites:** Docker, Docker Compose

```bash
# 1. Clone and enter the repo
cd you.ai

# 2. Run setup (creates .env on first run)
./setup.sh

# 3. Edit .env with your API keys
#    Required: ANTHROPIC_API_KEY, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN

# 4. Run setup again to start services
./setup.sh
```

Services will be available at:
- **n8n UI:** http://localhost:5678
- **API:** http://localhost:3000
- **WhatsApp (optional):** `docker compose --profile whatsapp up -d`

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│  Telegram /  │     │      n8n        │     │   Evolution API      │
│  Gmail /     │────▶│  (workflows)    │────▶│   (WhatsApp)         │
│  Calendar    │     │  :5678          │     │   :8080              │
└─────────────┘     └────────┬────────┘     │   optional profile   │
                             │              └──────────────────────┘
                             │ HTTP
                             ▼
                    ┌─────────────────┐
                    │   API (Express) │
                    │   TypeScript    │
                    │   :3000         │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Postgres 17   │
                    │   pgvector      │
                    │   pg_trgm       │
                    │   :5432         │
                    └─────────────────┘
```

n8n workflows call the API for contact search, briefing assembly, and outreach drafting. Postgres stores contacts (with vector embeddings), briefings, interactions, and sub-agent configs.

## API Endpoints

All routes are prefixed with `/api` except health.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/contacts/search` | Search contacts (semantic, fuzzy, or combined) |
| POST | `/api/contacts/ingest` | Upsert a single contact |
| POST | `/api/contacts/ingest/csv` | Bulk-import contacts from CSV string |
| GET | `/api/briefings/history` | Get past briefings (`?user_id=&limit=`) |
| POST | `/api/briefings/assemble` | Generate a briefing from sub-agent outputs via Claude |
| POST | `/api/briefings/store` | Store a pre-built briefing |
| POST | `/api/briefings/matchmaking` | Suggest matches for meeting attendees |
| POST | `/api/outreach/draft` | Draft outreach messages for a campaign goal |
| POST | `/api/interactions` | Log an interaction (auto-summarized by Claude) |
| GET | `/api/interactions/:contact_id` | Get interactions for a contact |
| GET | `/api/sub-agents` | List active sub-agents |
| POST | `/api/sub-agents` | Create a sub-agent |
| PATCH | `/api/sub-agents/:id` | Update a sub-agent |
| DELETE | `/api/sub-agents/:id` | Soft-delete a sub-agent |

## n8n Workflows

| Workflow | Description |
|----------|-------------|
| `telegram-chat` | Telegram bot interface for natural language queries (contact lookup, briefing requests) |
| `morning-briefing` | Cron-triggered daily briefing — collects sub-agent outputs, calls `/briefings/assemble`, sends to Telegram |
| `urgent-alerts` | Periodic check for time-sensitive events, sends alerts via Telegram |
| `gmail-trigger` | Watches inbox for new emails, logs interactions, updates contact records |
| `calendar-trigger` | Watches calendar for upcoming meetings, triggers matchmaking prep |
| `outreach-campaign` | Orchestrates outreach: searches contacts, drafts messages, queues for human approval |
| `whatsapp-chat` | WhatsApp bot interface via Evolution API (mirrors Telegram flow) |

Workflow JSON files live in `n8n/workflows/` and are imported during setup.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `PASSWORD` / `DB` | Postgres credentials and database name |
| `DATABASE_URL` | Full Postgres connection string (used by API) |
| `ANTHROPIC_API_KEY` | Claude API key for briefing assembly, outreach drafting, interaction summaries |
| `OPENAI_API_KEY` | OpenAI key for embedding generation (`text-embedding-3-small`) |
| `EMBEDDING_MODEL` | Embedding model name (default: `text-embedding-3-small`) |
| `EMBEDDING_DIMENSIONS` | Embedding vector size (default: `1536`) |
| `API_PORT` / `API_HOST` | API server bind address (default: `3000` / `0.0.0.0`) |
| `N8N_BASIC_AUTH_USER` / `PASSWORD` | n8n UI login credentials |
| `N8N_ENCRYPTION_KEY` | n8n encryption key for stored credentials |
| `N8N_HOST` / `N8N_PORT` | n8n host and port (default: `localhost` / `5678`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for chat workflows |
| `EVOLUTION_API_URL` / `KEY` | Evolution API connection for WhatsApp integration |
| `BRIEFING_HISTORY_COUNT` | Number of past briefings included as context (default: `5`) |
| `BRIEFING_CRON` | Cron expression for morning briefing (default: `0 7 * * *`) |
| `ALERT_CRON` | Cron expression for urgent alert checks (default: `*/15 * * * *`) |
| `TIMEZONE` | Timezone for n8n scheduling (default: `UTC`) |
