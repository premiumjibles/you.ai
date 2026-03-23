# You.ai

Personal AI assistant POC that delivers daily briefings, natural language contact search (semantic + fuzzy), and AI-drafted outreach messages with human-in-the-loop approval via WhatsApp.

## Quick Start

**Prerequisites:** Docker, Docker Compose

```bash
# 1. Clone and enter the repo
cd you.ai

# 2. Run setup (creates .env on first run)
./setup.sh

# 3. Edit .env with your API keys
#    Required: ANTHROPIC_API_KEY

# 4. Run setup again to start services
./setup.sh
```

Services will be available at:
- **API:** http://localhost:3000
- **Evolution API (WhatsApp):** http://localhost:8080

## Architecture

```
┌──────────────────────┐
│   Evolution API      │
│   (WhatsApp)         │◀── WhatsApp messages
│   :8080              │
└──────────┬───────────┘
           │ webhook
           ▼
  ┌─────────────────┐
  │   API (Express) │
  │   TypeScript    │
  │   :3000         │
  │   + scheduler   │
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

The API service handles all logic: WhatsApp chat via webhook, scheduled briefings and alerts (cron), contact search, outreach drafting, and data import. Postgres stores contacts (with vector embeddings), briefings, interactions, and sub-agent configs.

## API Endpoints

All routes are prefixed with `/api` except health.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/chat/webhook` | WhatsApp chat webhook (called by Evolution API) |
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
| POST | `/api/import/mbox` | Import contacts/interactions from mbox email export |
| POST | `/api/import/ics` | Import events from ICS calendar file |
| POST | `/api/import/csv` | Import contacts from CSV file |

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
| `EVOLUTION_API_URL` / `KEY` | Evolution API connection for WhatsApp integration |
| `EVOLUTION_INSTANCE` | Evolution API instance name (default: `youai`) |
| `WHATSAPP_OWNER_JID` | WhatsApp JID of the bot owner |
| `BRIEFING_HISTORY_COUNT` | Number of past briefings included as context (default: `5`) |
| `BRIEFING_CRON` | Cron expression for morning briefing (default: `0 7 * * *`) |
| `ALERT_CRON` | Cron expression for urgent alert checks (default: `*/15 * * * *`) |
