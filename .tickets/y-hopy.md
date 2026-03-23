---
id: y-hopy
status: closed
deps: []
links: []
created: 2026-03-23T10:07:54Z
type: task
priority: 1
assignee: Sean
---
# You.ai POC — Research Brief

# You.ai — Personal AI Assistant POC

## Problem Statement

Build a personal AI assistant that delivers daily briefings, makes a large contact database searchable via natural language, and drafts personalized outreach with human approval. Prove it works end-to-end on real data (Sean's Gmail, contacts, Telegram) first, then package for the first client, and eventually other high-net-worth individuals who'd pay for a "personal Palantir."

The assistant must be reliable enough for daily use (not a demo that flakes), simple enough to set up for new clients (clone repo, fill in keys, spin up), and extensible toward financial management (Vultisig MCP) and a dashboard UI later.

## Research Findings

### MVP Features (three, nothing else until they work)

**1. Morning Briefing**
- Cron-triggered daily summary delivered via Telegram/WhatsApp
- Sub-agent architecture: each user has configurable topic agents (market tracker, company monitor, industry scanner, network activity, custom topics)
- Each sub-agent is a separate workflow with its own data sources and summarization prompt
- Orchestrator collects all sub-agent outputs, Claude consolidates into one coherent briefing with cross-references ("Chainflip announced mainnet upgrade and you have a call with their CTO at 3pm")
- Urgent alerts run on a faster loop (every 15 min) with threshold checks, fire immediately if triggered
- Sub-agents are configurable via chat: "add a sub-agent that tracks EU AI regulation"
- Config stored in a sub_agents table (user_id, type, name, config JSONB, schedule, active flag)

**2. Contact Search**
- Natural language queries against a contacts database: "whos janet fring", "who do I know in Melbourne who cares about real estate"
- Three search strategies in one database:
  - pg_trgm for name typo matching ("jannet" → "janet")
  - Postgres full-text search for keyword queries ("who works at Meridian")
  - pgvector cosine similarity for semantic queries ("who knows about DePIN")
- AI agent decides which tool to call, formats results conversationally
- Can chain tool calls: search contacts → get interaction history → present combined answer

**3. Draft Outreach**
- User defines a campaign goal ("draft intros to my Melbourne real estate contacts")
- AI searches matching contacts, pulls interaction history for personalization context
- Drafts personalized messages per contact
- Sends drafts to Telegram/WhatsApp with approve/edit/skip buttons
- Human must approve before anything sends (deterministic workflow gate, not prompt instruction)

### Stack

| Layer | Tool | Role |
|-------|------|------|
| Orchestration | n8n (self-hosted, community edition, free) | Workflow automation, cron scheduling, messaging integrations, MCP client/server, AI agent execution |
| Database | Postgres + pgvector + pg_trgm | Contact storage, vector embeddings, fuzzy name matching, full-text search, chat memory, sub-agent config |
| Intelligence | Claude API (Anthropic) | Summarization, intent parsing, content drafting, tool-call reasoning |
| WhatsApp | Evolution API (Docker, wraps Baileys) | Bridges personal WhatsApp to n8n via REST/webhooks. User can link personal number directly or use a second number (recommended) for zero ban risk |
| Telegram | n8n native Telegram node | Bot interface via @BotFather token |
| Gmail/Calendar | n8n native Google nodes (OAuth2) | Real-time email/calendar sync, contact enrichment |
| Enrichment | Proxycurl or similar | Fill in LinkedIn profile URLs, current roles for new contacts |

**Infrastructure**: Two Docker containers (n8n + Postgres) on a VPS or local machine. Evolution API as optional third container for WhatsApp. Claude API is external.

### Data Model

**contacts**: name, company, role, location, email, phone, linkedin_url, source_databases (text array), notes, last_interaction_date, priority_ring (1-5), name_tsvector (generated), full_tsvector (generated), embedding (vector 1536)

**interactions**: contact_id, type (email/meeting/whatsapp/linkedin), date, summary (AI-generated), raw_content

**sub_agents**: user_id, type, name, config (JSONB), workflow_id, schedule, active flag

**n8n_chat_histories**: session_id (phone number), message (JSONB), created_at — managed automatically by n8n's Postgres Chat Memory node

### Data Ingestion

| Source | Method | Frequency |
|--------|--------|-----------|
| Gmail | n8n OAuth2 trigger | Real-time (every email auto-updates contacts + interactions) |
| Google Calendar | n8n OAuth2 trigger | Real-time (meeting attendees → contacts, meetings → interactions) |
| RSS feeds | n8n HTTP poll | Every 30 min |
| Financial APIs (CoinGecko, Alpha Vantage) | n8n HTTP poll | Every 15-30 min |
| LinkedIn | CSV export dropped to Telegram/WhatsApp bot → parse, diff, upsert | Manual, monthly-ish. Staleness monitor nudges user when data is >30 days old |
| CRM dumps | CSV drop to bot | Manual, as needed |
| WhatsApp contacts | Evolution API | Real-time on message (sender info captured) |

### n8n Technical Details

- Workflows are JSON files, fully generatable by code, importable via CLI (`n8n import:workflow`) or REST API (`POST /api/v1/workflows`)
- AI Agent node: LangChain-based ReAct agent with tool-calling. Tools are sub-workflows the agent can invoke mid-reasoning. Supports multiple sequential tool calls in one loop (max iterations configurable, default 10)
- Postgres Chat Memory: cross-execution conversation persistence keyed by session_id (sender phone number). Loads last N messages as conversation history
- MCP support: n8n can consume external MCP servers (MCP Client node) and expose workflows as MCP tools (MCP Server Trigger node)
- Credentials: injectable via environment variables (`N8N_CREDENTIALS_OVERWRITE_DATA`) or `={{ $env.VAR }}` expressions in workflow JSON
- Self-hosted community edition: free, no execution limits, no user limits

### WhatsApp Integration (Evolution API)

- Evolution API is a Docker container that wraps Baileys (WhatsApp Web protocol reimplementation)
- User scans QR code to link a WhatsApp account
- Exposes REST endpoints for sending messages and webhooks for receiving
- n8n connects via HTTP Request node (send) and Webhook node (receive)
- Two modes:
  - **Personal number directly**: convenient, small ban risk (mitigated by respond-only mode, rate limiting, human-like delays)
  - **Second number** (recommended): zero risk to personal account, bot is just another contact
- Same approach OpenClaw used under the hood (Baileys), just exposed as a clean API

### Deployment Modes

**POC (Sean)**: Deploy to existing external server. Docker Compose up, configure API keys, connect Gmail/Telegram/WhatsApp, load contacts.

**Client**: Two options:
1. Engineer sets up VPS, configures login shell to auto-run setup wizard on first SSH. Client logs in, answers setup questions (API keys, bot tokens, preferences), system generates .env and starts services
2. Client clones repo, runs `./setup.sh`, follows interactive prompts, `docker compose up -d`

Setup wizard asks for: Claude API key, Telegram bot token (from @BotFather), Gmail OAuth (opens browser URL, user pastes back code), financial tickers, briefing time/timezone. Then imports workflows and activates.

### Future Extensions

**Vultisig Financial Management**: n8n supports MCP natively. When ready, add Vultisig's MCP server as an n8n MCP Client tool. AI agent gets new tools (get_balances, propose_swap, get_portfolio_summary). All transactions go through deterministic approval step (Telegram/WhatsApp inline buttons) before MPC signing ceremony. The .vult key file lives on the server, agent never sees key material. Transaction limits enforced at workflow level, not AI discretion.

**Dashboard UI**: Frontend (Next.js or similar) on top of same Postgres + n8n webhook API. Contact browser, briefing history, outreach queue, chat interface, onboarding wizard. No architectural changes needed — dashboard is a view layer on existing data and workflows.

## Constraints

- LinkedIn has no programmatic API for pulling connections. CSV export is the only safe method. Live monitoring requires Unipile ($79/mo) or scraping (ban risk)
- WhatsApp Business API requires a WhatsApp Business account, not compatible with personal numbers. Evolution API (Baileys) bridges this gap but is unofficial
- Gmail OAuth requires a Google Cloud project with Gmail/Calendar APIs enabled. User must click "authorize" in a browser — cannot be fully automated
- Contact deduplication across sources (same person in LinkedIn CSV and Gmail) needs a matching heuristic. Name + company is fragile (people change jobs), email is more reliable when available
- Relationship reasoning ("who introduced me to Alice", "show the connection chain to Company X") requires graph traversal that flat search cannot do. MVP mitigates with notes/interaction scanning. Neo4j or Postgres recursive CTEs for later

## Dead Ends

- **OpenClaw**: 4 months old, critical security vulnerabilities (CVE-2026-25253, CVSS 8.8), 335 malicious skills in marketplace, rogue agent behavior, 14K+ open issues, creator left for OpenAI. Too immature and risky for production use
- **QMD**: 3 months old, crashes on CPU-only systems, SQLite constraint errors, heavily single-author (Tobi Lutke, 298/300 commits), v1→v2 in two weeks. "95% token reduction" claim is just standard RAG benefit, not unique. Interesting but not production-ready
- **LinkedIn scraping** (PhantomBuster, Apify, Dux-Soup): moderate-to-high ban risk, LinkedIn actively detects automation. Not worth it for a personal tool
- **Browser automation for data sources in MVP**: unnecessary complexity. Gmail, Calendar, RSS, financial data all have APIs. Playwright MCP available if needed later but not for MVP
- **WhatsApp personal via official API**: requires converting personal number to Business account, destroys personal WhatsApp, requires Meta business verification. Not practical

## Loose Recommendations

- n8n's AI Agent node with Tool-Workflow pattern is the core abstraction. Each "tool" the AI can use is a separate n8n workflow containing the actual logic (Postgres query, API call, etc). This keeps AI reasoning separate from deterministic execution
- pg_trgm may be the unsung hero — handles name typos at the database level without needing AI to correct them first. Worth leaning into heavily for contact search
- Claude model tiering could keep costs down: Haiku for email summarization (high volume, simple), Sonnet for contact queries and briefings (needs reasoning), Opus for outreach drafting (needs creativity and personalization)
- The sub-agent pattern for briefings maps cleanly to n8n's Execute Workflow node. Each sub-agent = separate workflow, orchestrator calls them in parallel, merges outputs
- Embedding cost is negligible ($0.05 for 5K contacts with text-embedding-3-small). Not a factor in model/approach decisions
- For the setup wizard, a bash script with read prompts is fine for POC. A web-based onboarding flow belongs in the dashboard UI phase

## Open Questions

- Which embedding model? OpenAI text-embedding-3-small is cheap and good but adds another API dependency. Local via Ollama removes the dependency but needs beefier hardware
- Contact deduplication heuristic: match on name+company (fragile) vs email (more reliable but not always available) vs fuzzy combination with confidence scores?
- Alert threshold defaults and tuning UX: what counts as "urgent enough to alert immediately"? Needs to be configurable per user, will need iteration
- Token budget monitoring: morning briefings + ad-hoc queries + email summarization could add up. Worth building a simple cost tracker early?
- Evolution API stability: how well-maintained is it? How often does Baileys break when WhatsApp updates their protocol? Need a fallback plan (Telegram-only mode)
- Multi-user isolation: one VPS per client (simple, fully isolated) vs multi-tenant on one instance (cheaper, more complex)?

## Notes

**2026-03-23T10:23:24Z**

# Design

## Approved Approach

**Approach B: n8n as orchestrator + custom API service.** n8n handles scheduling, messaging integrations (Telegram, WhatsApp), Gmail/Calendar triggers, and conversational AI routing via its AI Agent node. A Node/TypeScript API service handles the heavy logic: contact search (triple-strategy), embedding generation, briefing assembly, outreach drafting, contact ingestion/dedup. Postgres is shared between both. This keeps n8n thin and gives us testable code for complex logic, plus a natural API layer for the future dashboard UI.

## Architecture

Four containers orchestrated by Docker Compose:

- **n8n** — cron scheduling, Telegram/WhatsApp message routing, Gmail/Calendar triggers, AI Agent node for conversational tool-calling. Calls the API service for heavy lifting
- **API service (Node/TypeScript, Express)** — contact search (triple-strategy), embedding generation, briefing assembly, outreach draft generation, contact ingestion/dedup. Exposes REST endpoints that n8n workflows call. Later becomes the backend for the dashboard UI
- **Postgres** — single database shared by n8n (its own tables + chat memory) and the API service (contacts, interactions, sub_agents). Extensions: pgvector, pg_trgm
- **Evolution API** — optional WhatsApp bridge. n8n talks to it directly for send/receive

Separation of concerns: n8n owns scheduling, messaging I/O, and conversational AI routing. The API service owns data logic. Postgres is the shared state.

## Repo Structure

```
you.ai/
├── docker-compose.yml
├── .env.example
├── setup.sh                    # POC: hardcoded, later: interactive wizard
├── api/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            # Express server entry
│       ├── routes/
│       │   ├── contacts.ts     # search, ingest, dedup endpoints
│       │   ├── briefings.ts    # assembly + sub-agent orchestration
│       │   └── outreach.ts     # draft generation
│       ├── services/
│       │   ├── search.ts       # triple-strategy contact search
│       │   ├── embeddings.ts   # embedding generation + upsert
│       │   ├── ingestion.ts    # CSV parse, Gmail/Cal contact extraction
│       │   ├── dedup.ts        # contact deduplication heuristic
│       │   └── claude.ts       # Claude API client (summarization, drafting)
│       └── db/
│           ├── schema.sql      # contacts, interactions, sub_agents tables
│           ├── migrations/     # incremental schema changes
│           └── client.ts       # Postgres connection pool
├── n8n/
│   ├── workflows/              # exported workflow JSONs
│   │   ├── morning-briefing.json
│   │   ├── urgent-alerts.json
│   │   ├── telegram-chat.json
│   │   ├── whatsapp-chat.json
│   │   ├── gmail-trigger.json
│   │   ├── calendar-trigger.json
│   │   └── outreach-campaign.json
│   └── import.sh               # imports workflows on first boot
└── postgres/
    └── init.sql                # extensions + schema bootstrap
```

POC phase: .env has keys hardcoded, setup.sh just runs docker compose up. Client phase: setup.sh becomes an interactive wizard that generates .env from user input, runs OAuth flows, imports workflows, and starts services.

## Data Model

**contacts**: id (uuid PK), name, company, role, location, email, phone, linkedin_url, source_databases (text[]), notes, last_interaction_date (timestamptz), priority_ring (int 1-5), name_tsvector (generated from name), full_tsvector (generated from name+company+role+location+notes), embedding (vector(1536)), created_at, updated_at

**interactions**: id (uuid PK), contact_id (FK → contacts), type (enum: email/meeting/whatsapp/linkedin/telegram), date (timestamptz), summary (text, AI-generated), raw_content (text), created_at

**sub_agents**: id (uuid PK), user_id (text, hardcoded for POC), type (text), name (text), config (jsonb), workflow_id (text), schedule (text, cron expression), active (boolean)

n8n chat memory managed automatically by n8n's Postgres Chat Memory node, keyed by sender phone/chat ID.

## Contact Search (Triple-Strategy)

Query arrives as natural language. Claude classifies intent — name lookup, keyword query, or semantic query (can be multiple). API fires relevant strategies in parallel:

- **Fuzzy name** — pg_trgm similarity() with threshold on name column. Handles typos ("jannet" → Janet Fring)
- **Keyword** — full_tsvector @@ plainto_tsquery(). Role, company, location lookups
- **Semantic** — embedding <=> query_embedding cosine distance. Conceptual queries ("who knows about DePIN")

Results merged by contact ID with weighted combined relevance score. Deduped. Top results optionally enriched with recent interactions. Returned to n8n AI Agent for conversational formatting.

Indexes: pg_trgm GiST on name, GIN on full_tsvector, HNSW on embedding.

## Morning Briefing & Alerts

**Morning Briefing:** n8n cron → read active sub_agents → Execute Workflow node fires each in parallel (market tracker, company monitor, industry scanner, network activity, custom) → each returns structured JSON summary → orchestrator sends all outputs to Claude Sonnet to consolidate into one coherent briefing with cross-references → sent via Telegram/WhatsApp.

**Urgent Alerts:** separate 15-minute cron. Checks sub-agents with alert_thresholds in config. Deterministic threshold checks (price moved >X%, keyword in high-priority feed). Fires immediately via Telegram/WhatsApp if breached. No Claude call needed.

**Sub-agent management via chat:** user sends "add a sub-agent that tracks EU AI regulation" → AI Agent interprets as tool call to API sub_agents endpoint → creates new row → next briefing picks it up.

**Model tiering:** Haiku for email/interaction summarization, Sonnet for briefing consolidation and contact queries, Opus for outreach drafting.

## Draft Outreach

User initiates via chat ("draft intros to my Melbourne real estate contacts") → AI Agent calls API outreach endpoint → API searches matching contacts, pulls interaction history → Claude Opus generates personalized draft per contact using contact details + interaction history + campaign goal → returns array of {contact, draft, context_used} → n8n sends each to Telegram/WhatsApp with Approve/Edit/Skip inline buttons.

Approve sends via appropriate channel. Edit lets user reply with changes, re-presents. Skip moves on. Approval gate is a deterministic n8n workflow wait node — AI never sends without explicit human approval. Sends are rate-limited to avoid spam detection.

## Data Ingestion & Deduplication

**Ingestion:** Gmail trigger → extract sender/recipients → API ingest → upsert contact + interaction. Calendar trigger → extract attendees → same. LinkedIn/CRM CSV → user drops to Telegram/WhatsApp → n8n forwards to API → parse, upsert. WhatsApp → Evolution API webhook → n8n → API ingest.

**Dedup heuristic (runs on every ingest):** 1) Email match (highest confidence, merge). 2) Phone match (merge). 3) Name + company fuzzy match (pg_trgm >0.8 AND company matches, merge). 4) No match → create new, flag for review if name similarity >0.6 but company differs (possible job change).

Merge strategy: never overwrite with blanks. New data fills empty fields. Both have values → keep more recent source. source_databases array appended for provenance.

**Embeddings:** regenerated after any contact upsert. Concatenation of name+role+company+location+notes. Batched (100 at a time) for CSV imports.

**Staleness monitor:** weekly cron, nudges user via Telegram if LinkedIn data >30 days old.

## Error Handling & Reliability

- n8n HTTP calls to API: built-in retry (3 attempts, exponential backoff)
- Morning briefing: partial degradation — failed sub-agents noted in briefing, rest still delivered
- Claude API: retry with backoff on 429s/5xx, structured error on extended outage so n8n degrades gracefully
- Embedding failures don't block contact ingestion — queued for retry
- Docker Compose: restart: unless-stopped, named volumes for Postgres data and n8n state, health checks (pg_isready, GET /health) for readiness gating
- POC skips: no centralized logging, no system health alerting, no backup automation

## Testing Approach

- **API integration tests** against real Postgres (Docker test container). Triple-strategy search is the critical path. Dedup heuristic unit tests (email match, phone match, fuzzy name+company, merge strategy)
- **n8n workflows:** manual smoke tests via execution log. Not automated for POC
- **End-to-end:** manual run-through of all three MVP features after deployment (briefing arrives, contact queries return results, outreach drafts arrive with buttons and send on approve)
- POC skips: no CI pipeline, no load testing, no n8n workflow unit tests

**2026-03-23T10:27:05Z**

# Design Addendum — Gaps From Original Scope

Three additive requirements identified during review. No changes to existing design — these layer on top.

## 1. PII / Sensitive Data Scrubber

**Problem:** The audience is crypto-adjacent / family office. Incoming data (emails, WhatsApp messages, calendar notes) may contain 12/24-word seed phrases or hex private keys. These must never reach Claude.

**Design:** Deterministic preprocessing filter in the API service, not an AI judgment call. Runs before any Claude API call or embedding generation.

- New module: `api/src/services/scrubber.ts`
- Pattern matching (regex-based):
  - 12/24-word sequences matching BIP-39 wordlist patterns
  - Hex strings matching private key formats (64-char hex, 0x-prefixed, common wallet export patterns)
  - Ethereum/Bitcoin/Solana address patterns (for redaction in contexts where they shouldn't appear)
- Replaces matches with `[REDACTED-SEED-PHRASE]`, `[REDACTED-PRIVATE-KEY]`, etc.
- Applied at the ingestion boundary: every interaction's raw_content and summary input, every contact's notes field, every message body before it enters any Claude prompt
- Deterministic, fast, no false-negative tolerance — if in doubt, redact. False positives (12 random English words that happen to be BIP-39 words) are acceptable
- Scrubber runs in the API service before data hits Postgres too — redacted data is what gets stored, raw sensitive material never persists

**Data model impact:** None. Scrubber operates on data in transit, not at rest.

**Architecture impact:** Scrubber is a pure function called at ingestion and before Claude calls. No new containers or services.

## 2. Briefing Memory

**Problem:** Current design fires morning briefings statelessly. Each briefing is generated from scratch with no awareness of prior briefings. The original scope expects briefings that build on each other — tracking evolving situations, referencing what was reported yesterday.

**Design:** Store briefing outputs and feed recent history into the orchestrator's consolidation prompt.

- New table: **briefings** — id (uuid PK), user_id (text), date (date), content (text, the full rendered briefing), sub_agent_outputs (jsonb, raw outputs from each sub-agent), created_at (timestamptz)
- After each morning briefing is assembled, the API stores it in the briefings table
- When assembling the next briefing, the orchestrator's Claude prompt includes the last 3-5 briefing summaries as context
- Claude can then reference prior briefings: "Bitcoin continued its upward trend from yesterday's briefing, now at $X" or "The Chainflip mainnet upgrade mentioned on Monday has now launched"
- Sub-agent outputs stored as JSONB so individual topic threads can be compared across days without re-parsing the full briefing text
- Briefing history is also available to the chat agent — user can ask "what was in Monday's briefing?" and the AI can retrieve it

**Data model impact:** One new table (briefings).

**Architecture impact:** Briefings route in API service gets a store endpoint (called by n8n after send) and a history endpoint (called by n8n before assembly). Minimal.

## 3. Proactive Matchmaking (Super-Connector)

**Problem:** The network activity sub-agent currently just summarizes recent interactions. The original scope expects it to proactively suggest high-value introductions by correlating upcoming calendar events with the contact database.

**Design:** Extend the network activity sub-agent into a suggestion engine.

- When the network activity sub-agent fires (as part of morning briefing), it:
  1. Pulls upcoming calendar events for the next 48 hours (via API endpoint that queries interactions/calendar data)
  2. For each meeting attendee, retrieves their contact record and recent interactions
  3. Runs a semantic search against the full contact database: "given Person X's profile and interests, who in the network would benefit from an introduction?"
  4. Claude (Sonnet) evaluates potential matches and generates introduction suggestions with reasoning: "You're meeting Person X tomorrow — they're interested in DePIN. Person Y from your Melbourne contacts is building in that space. Consider introducing them."
  5. Suggestions included as a dedicated section in the morning briefing

- Suggestion quality depends on contact richness — notes, interaction history, and embeddings need to be populated. Suggestions will improve as the system ingests more data over time
- Suggestions are passive (included in briefing) not active (no auto-sending intros). User acts on them through the outreach flow if they want
- The matchmaking logic lives in the API service (new endpoint in briefings route), called by the network activity n8n workflow

**Data model impact:** None — uses existing contacts, interactions, and calendar data.

**Architecture impact:** New API endpoint for matchmaking suggestions. Network activity n8n workflow gains an additional step calling this endpoint.

**2026-03-23T10:32:45Z**

# Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use /run tk:y-hopy to implement this plan task-by-task via subagent-driven-development.

**Goal:** Build a personal AI assistant POC with three features: morning briefings, natural language contact search, and draft outreach with human approval — all orchestrated by n8n with a Node/TypeScript API service and Postgres.

**Architecture:** Four Docker containers (n8n, Express API, Postgres+pgvector+pg_trgm, Evolution API). n8n owns scheduling and messaging I/O. The API service owns data logic (search, ingestion, dedup, briefings, outreach, scrubbing). Postgres is shared state. Claude API provides intelligence.

**Tech Stack:** Node.js, TypeScript, Express, Postgres (pgvector, pg_trgm), n8n (self-hosted), Claude API (Anthropic SDK), Docker Compose, Evolution API (WhatsApp)

---

### Task 1: Project Scaffolding & Docker Infrastructure

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `postgres/init.sql`
- Create: `n8n/import.sh`
- Create: `api/Dockerfile`
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/src/index.ts`

**Step 1: Create .gitignore**

```gitignore
node_modules/
dist/
.env
*.log
postgres-data/
n8n-data/
```

**Step 2: Create .env.example with all required environment variables**

```env
# Postgres
POSTGRES_USER=youai
POSTGRES_PASSWORD=changeme
POSTGRES_DB=youai
DATABASE_URL=postgresql://youai:changeme@postgres:5432/youai

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxx

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=changeme
N8N_ENCRYPTION_KEY=changeme-generate-random
N8N_HOST=localhost
N8N_PORT=5678

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=changeme

# API Service
API_PORT=3000
API_HOST=0.0.0.0

# Embeddings
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# OpenAI (for embeddings)
OPENAI_API_KEY=sk-xxx

# Briefing
BRIEFING_HISTORY_COUNT=5
BRIEFING_CRON=0 7 * * *
ALERT_CRON=*/15 * * * *
```

**Step 3: Create postgres/init.sql with extensions and full schema**

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Contacts
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    company TEXT,
    role TEXT,
    location TEXT,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    source_databases TEXT[] DEFAULT '{}',
    notes TEXT,
    last_interaction_date TIMESTAMPTZ,
    priority_ring INT DEFAULT 3 CHECK (priority_ring BETWEEN 1 AND 5),
    name_tsvector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, ''))) STORED,
    full_tsvector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(company, '') || ' ' ||
            coalesce(role, '') || ' ' ||
            coalesce(location, '') || ' ' ||
            coalesce(notes, '')
        )
    ) STORED,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interactions
CREATE TABLE interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('email', 'meeting', 'whatsapp', 'linkedin', 'telegram')),
    date TIMESTAMPTZ NOT NULL,
    summary TEXT,
    raw_content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sub-agents
CREATE TABLE sub_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL DEFAULT 'sean',
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    workflow_id TEXT,
    schedule TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Briefings
CREATE TABLE briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL DEFAULT 'sean',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    content TEXT NOT NULL,
    sub_agent_outputs JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_name_trgm ON contacts USING gist (name gist_trgm_ops);
CREATE INDEX idx_contacts_full_tsvector ON contacts USING gin (full_tsvector);
CREATE INDEX idx_contacts_embedding ON contacts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_contacts_email ON contacts (email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_phone ON contacts (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_interactions_contact_id ON interactions (contact_id);
CREATE INDEX idx_interactions_date ON interactions (date DESC);
CREATE INDEX idx_sub_agents_user_active ON sub_agents (user_id) WHERE active = true;
CREATE INDEX idx_briefings_user_date ON briefings (user_id, date DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sub_agents_updated_at
    BEFORE UPDATE ON sub_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Step 4: Create api/package.json**

```json
{
  "name": "youai-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "express": "^4.21.0",
    "openai": "^4.77.0",
    "pg": "^8.13.0",
    "csv-parse": "^5.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/pg": "^8.11.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 5: Create api/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 6: Create api/src/index.ts (minimal Express server with health check)**

```typescript
import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = parseInt(process.env.API_PORT || "3000");
app.listen(port, process.env.API_HOST || "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
});

export default app;
```

**Step 7: Create api/Dockerfile**

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Step 8: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build: ./api
    environment:
      DATABASE_URL: ${DATABASE_URL}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      API_PORT: ${API_PORT:-3000}
      API_HOST: ${API_HOST:-0.0.0.0}
      EMBEDDING_MODEL: ${EMBEDDING_MODEL:-text-embedding-3-small}
      EMBEDDING_DIMENSIONS: ${EMBEDDING_DIMENSIONS:-1536}
      BRIEFING_HISTORY_COUNT: ${BRIEFING_HISTORY_COUNT:-5}
    ports:
      - "${API_PORT:-3000}:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  n8n:
    image: n8nio/n8n:latest
    environment:
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: ${N8N_BASIC_AUTH_USER}
      N8N_BASIC_AUTH_PASSWORD: ${N8N_BASIC_AUTH_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_HOST: ${N8N_HOST:-localhost}
      N8N_PORT: ${N8N_PORT:-5678}
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: ${POSTGRES_DB}
      DB_POSTGRESDB_USER: ${POSTGRES_USER}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      GENERIC_TIMEZONE: ${TIMEZONE:-UTC}
      N8N_PERSONALIZATION_ENABLED: "false"
    volumes:
      - n8n-data:/home/node/.n8n
      - ./n8n/workflows:/workflows
    ports:
      - "${N8N_PORT:-5678}:5678"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  evolution-api:
    image: atendai/evolution-api:latest
    environment:
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
    volumes:
      - evolution-data:/evolution/instances
    ports:
      - "8080:8080"
    restart: unless-stopped
    profiles:
      - whatsapp

volumes:
  postgres-data:
  n8n-data:
  evolution-data:
```

**Step 9: Create n8n/import.sh**

```bash
#!/bin/bash
set -e
WORKFLOW_DIR="/workflows"
N8N_URL="http://localhost:5678"

echo "Waiting for n8n to be ready..."
until curl -sf "$N8N_URL/healthz" > /dev/null 2>&1; do
  sleep 2
done

echo "Importing workflows..."
for f in "$WORKFLOW_DIR"/*.json; do
  [ -f "$f" ] || continue
  echo "Importing $(basename "$f")..."
  curl -sf -X POST "$N8N_URL/api/v1/workflows" \
    -H "Content-Type: application/json" \
    -u "${N8N_BASIC_AUTH_USER}:${N8N_BASIC_AUTH_PASSWORD}" \
    -d @"$f" || echo "  Failed to import $(basename "$f")"
done

echo "Done."
```

**Step 10: Verify everything starts**

Run: `cd api && npm install && npx tsc --noEmit`
Expected: no errors

**Step 11: Commit**

```bash
git add .gitignore .env.example docker-compose.yml postgres/init.sql api/Dockerfile api/package.json api/tsconfig.json api/src/index.ts n8n/import.sh
git commit -m "feat: project scaffolding — Docker Compose, Postgres schema, Express API skeleton"
```

---

### Task 2: Database Client & Test Infrastructure

**Files:**
- Create: `api/src/db/client.ts`
- Create: `api/src/db/test-helpers.ts`
- Create: `api/vitest.config.ts`

**Step 1: Create api/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
```

**Step 2: Create api/src/db/client.ts (connection pool)**

```typescript
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export type DB = pg.Pool;
export default pool;
```

**Step 3: Create api/src/db/test-helpers.ts (real Postgres test setup)**

This provides a fresh database for integration tests using the same init.sql schema.

```typescript
import pg from "pg";
import { readFileSync } from "fs";
import { join } from "path";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://youai:changeme@localhost:5432/youai_test";

let pool: pg.Pool | null = null;

export async function getTestDb(): Promise<pg.Pool> {
  if (pool) return pool;

  // Connect to default db to create test db
  const adminPool = new pg.Pool({
    connectionString: TEST_DB_URL.replace(/\/[^/]+$/, "/postgres"),
  });
  const dbName = new URL(TEST_DB_URL).pathname.slice(1);

  try {
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await adminPool.end();
  }

  pool = new pg.Pool({ connectionString: TEST_DB_URL });

  // Apply schema
  const schema = readFileSync(
    join(__dirname, "../../../postgres/init.sql"),
    "utf-8"
  );
  await pool.query(schema);

  return pool;
}

export async function cleanTestDb(db: pg.Pool): Promise<void> {
  await db.query("TRUNCATE contacts, interactions, sub_agents, briefings CASCADE");
}

export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

**Step 4: Run test infrastructure smoke test**

Run: `cd api && npx vitest run --passWithNoTests`
Expected: PASS (no tests yet, but vitest config is valid)

**Step 5: Commit**

```bash
git add api/vitest.config.ts api/src/db/client.ts api/src/db/test-helpers.ts
git commit -m "feat: database client and test infrastructure with real Postgres"
```

---

### Task 3: PII Scrubber

**Files:**
- Create: `api/src/services/scrubber.ts`
- Create: `api/src/services/__tests__/scrubber.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { scrub } from "../scrubber";

describe("scrubber", () => {
  it("redacts 12-word BIP-39 seed phrases", () => {
    const input = "My seed is abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(scrub(input)).toContain("[REDACTED-SEED-PHRASE]");
    expect(scrub(input)).not.toContain("abandon");
  });

  it("redacts 24-word BIP-39 seed phrases", () => {
    const input = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
    expect(scrub(input)).toContain("[REDACTED-SEED-PHRASE]");
  });

  it("redacts hex private keys (64 chars)", () => {
    const input = "key: 4c0883a69102937d6231471b5dbb6204fe512961708279f1d7b18a3e0f7b1234";
    expect(scrub(input)).toContain("[REDACTED-PRIVATE-KEY]");
    expect(scrub(input)).not.toContain("4c0883a6");
  });

  it("redacts 0x-prefixed private keys", () => {
    const input = "0x4c0883a69102937d6231471b5dbb6204fe512961708279f1d7b18a3e0f7b1234";
    expect(scrub(input)).toContain("[REDACTED-PRIVATE-KEY]");
  });

  it("redacts Ethereum addresses", () => {
    const input = "Send to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68";
    expect(scrub(input)).toContain("[REDACTED-ADDRESS]");
  });

  it("redacts Bitcoin addresses", () => {
    const input = "BTC: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    expect(scrub(input)).toContain("[REDACTED-ADDRESS]");
  });

  it("redacts Solana addresses", () => {
    const input = "SOL: 7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
    expect(scrub(input)).toContain("[REDACTED-ADDRESS]");
  });

  it("leaves normal text untouched", () => {
    const input = "Meeting with Janet about real estate in Melbourne";
    expect(scrub(input)).toBe(input);
  });

  it("handles multiple redactions in one string", () => {
    const input = "Key: 0x4c0883a69102937d6231471b5dbb6204fe512961708279f1d7b18a3e0f7b1234 addr: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68";
    const result = scrub(input);
    expect(result).toContain("[REDACTED-PRIVATE-KEY]");
    expect(result).toContain("[REDACTED-ADDRESS]");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/scrubber.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the scrubber**

```typescript
// BIP-39 wordlist subset for detection (top ~200 most common words)
// Full detection: any sequence of 12 or 24 lowercase English words separated by spaces
// that are each 3-8 chars (BIP-39 word length range)
const SEED_PHRASE_12 = /\b([a-z]{3,8}\s+){11}[a-z]{3,8}\b/g;
const SEED_PHRASE_24 = /\b([a-z]{3,8}\s+){23}[a-z]{3,8}\b/g;

// Private keys: 64 hex chars, optionally 0x-prefixed
const HEX_PRIVATE_KEY = /\b(0x)?[0-9a-fA-F]{64}\b/g;

// Ethereum addresses: 0x + 40 hex chars
const ETH_ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;

// Bitcoin addresses: base58, starts with 1 or 3 or bc1
const BTC_ADDRESS = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;

// Solana addresses: base58, 32-44 chars
const SOL_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

export function scrub(text: string): string {
  let result = text;

  // Order matters: longer patterns first, private keys before addresses
  // (0x + 64 hex is both a private key and could partial-match an address)
  result = result.replace(SEED_PHRASE_24, "[REDACTED-SEED-PHRASE]");
  result = result.replace(SEED_PHRASE_12, "[REDACTED-SEED-PHRASE]");
  result = result.replace(HEX_PRIVATE_KEY, "[REDACTED-PRIVATE-KEY]");
  result = result.replace(ETH_ADDRESS, "[REDACTED-ADDRESS]");
  result = result.replace(BTC_ADDRESS, "[REDACTED-ADDRESS]");
  result = result.replace(SOL_ADDRESS, "[REDACTED-ADDRESS]");

  return result;
}
```

Note: The Solana regex is intentionally broad. False positives are acceptable per design doc ("if in doubt, redact"). In practice, base58 strings of 32-44 chars in contact notes are suspicious enough to redact. The implementation should be refined iteratively — start aggressive, loosen if false positives are a problem.

**Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/__tests__/scrubber.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add api/src/services/scrubber.ts api/src/services/__tests__/scrubber.test.ts
git commit -m "feat: PII scrubber — redacts seed phrases, private keys, and crypto addresses"
```

---

### Task 4: Contact Search — Triple Strategy

**Files:**
- Create: `api/src/services/search.ts`
- Create: `api/src/services/__tests__/search.test.ts`
- Create: `api/src/routes/contacts.ts`
- Modify: `api/src/index.ts` (mount contacts router)

**Step 1: Write the failing search tests**

These are integration tests against real Postgres. Requires a running Postgres with pgvector + pg_trgm.

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers";
import { searchContacts, SearchStrategy } from "../search";
import type pg from "pg";

describe("searchContacts", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
    // Seed test contacts
    await db.query(`
      INSERT INTO contacts (name, company, role, location, notes) VALUES
      ('Janet Fring', 'Meridian Capital', 'Managing Director', 'Melbourne', 'Real estate investor, DePIN enthusiast'),
      ('Bob Smith', 'Chainflip Labs', 'CTO', 'Berlin', 'DEX infrastructure, cross-chain bridges'),
      ('Alice Johnson', 'Vultisig', 'CEO', 'Singapore', 'MPC wallets, institutional custody'),
      ('張偉', 'Cathay Holdings', 'VP Strategy', 'Hong Kong', 'Family office, real estate, PE')
    `);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    // Don't truncate — we need the seeded data
  });

  describe("fuzzy name search (pg_trgm)", () => {
    it("finds exact name match", async () => {
      const results = await searchContacts(db, {
        strategy: "fuzzy_name",
        query: "Janet Fring",
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Janet Fring");
    });

    it("finds typo matches", async () => {
      const results = await searchContacts(db, {
        strategy: "fuzzy_name",
        query: "Jannet Frng",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("Janet Fring");
    });
  });

  describe("keyword search (full-text)", () => {
    it("finds by company name", async () => {
      const results = await searchContacts(db, {
        strategy: "keyword",
        query: "Meridian",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("Janet Fring");
    });

    it("finds by location", async () => {
      const results = await searchContacts(db, {
        strategy: "keyword",
        query: "Melbourne",
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("combined search", () => {
    it("merges results from multiple strategies", async () => {
      const results = await searchContacts(db, {
        strategy: "combined",
        query: "real estate Melbourne",
        strategies: ["keyword"],
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/search.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the search service**

```typescript
import type pg from "pg";

export type SearchStrategy = "fuzzy_name" | "keyword" | "semantic" | "combined";

export interface SearchParams {
  strategy: SearchStrategy;
  query: string;
  strategies?: SearchStrategy[];
  embedding?: number[];
  limit?: number;
  threshold?: number;
}

export interface ContactResult {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
  priority_ring: number;
  last_interaction_date: Date | null;
  score: number;
}

async function fuzzyNameSearch(
  db: pg.Pool,
  query: string,
  limit: number,
  threshold: number
): Promise<ContactResult[]> {
  const { rows } = await db.query(
    `SELECT *, similarity(name, $1) AS score
     FROM contacts
     WHERE similarity(name, $1) > $2
     ORDER BY score DESC
     LIMIT $3`,
    [query, threshold, limit]
  );
  return rows;
}

async function keywordSearch(
  db: pg.Pool,
  query: string,
  limit: number
): Promise<ContactResult[]> {
  const { rows } = await db.query(
    `SELECT *, ts_rank(full_tsvector, plainto_tsquery('english', $1)) AS score
     FROM contacts
     WHERE full_tsvector @@ plainto_tsquery('english', $1)
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit]
  );
  return rows;
}

async function semanticSearch(
  db: pg.Pool,
  embedding: number[],
  limit: number,
  threshold: number
): Promise<ContactResult[]> {
  const { rows } = await db.query(
    `SELECT *, 1 - (embedding <=> $1::vector) AS score
     FROM contacts
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) > $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(embedding), threshold, limit]
  );
  return rows;
}

function dedupeByContact(results: ContactResult[]): ContactResult[] {
  const seen = new Map<string, ContactResult>();
  for (const r of results) {
    const existing = seen.get(r.id);
    if (!existing || r.score > existing.score) {
      seen.set(r.id, r);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

export async function searchContacts(
  db: pg.Pool,
  params: SearchParams
): Promise<ContactResult[]> {
  const limit = params.limit || 10;
  const threshold = params.threshold || 0.3;

  if (params.strategy === "fuzzy_name") {
    return fuzzyNameSearch(db, params.query, limit, threshold);
  }

  if (params.strategy === "keyword") {
    return keywordSearch(db, params.query, limit);
  }

  if (params.strategy === "semantic") {
    if (!params.embedding) throw new Error("Semantic search requires an embedding");
    return semanticSearch(db, params.embedding, limit, threshold);
  }

  // Combined: run requested strategies in parallel, merge
  const strategies = params.strategies || ["fuzzy_name", "keyword"];
  const promises: Promise<ContactResult[]>[] = [];

  if (strategies.includes("fuzzy_name")) {
    promises.push(fuzzyNameSearch(db, params.query, limit, threshold));
  }
  if (strategies.includes("keyword")) {
    promises.push(keywordSearch(db, params.query, limit));
  }
  if (strategies.includes("semantic") && params.embedding) {
    promises.push(semanticSearch(db, params.embedding, limit, threshold));
  }

  const allResults = (await Promise.all(promises)).flat();
  return dedupeByContact(allResults).slice(0, limit);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/__tests__/search.test.ts`
Expected: PASS

**Step 5: Create the contacts route**

```typescript
import { Router } from "express";
import { searchContacts } from "../services/search";
import type { DB } from "../db/client";

export function contactsRouter(db: DB): Router {
  const router = Router();

  router.post("/search", async (req, res) => {
    try {
      const { strategy, query, strategies, embedding, limit, threshold } = req.body;
      const results = await searchContacts(db, {
        strategy: strategy || "combined",
        query,
        strategies,
        embedding,
        limit,
        threshold,
      });
      res.json({ results, count: results.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
```

**Step 6: Mount the contacts router in index.ts**

Add to `api/src/index.ts`:

```typescript
import { contactsRouter } from "./routes/contacts";
import pool from "./db/client";

app.use("/api/contacts", contactsRouter(pool));
```

**Step 7: Commit**

```bash
git add api/src/services/search.ts api/src/services/__tests__/search.test.ts api/src/routes/contacts.ts api/src/index.ts
git commit -m "feat: triple-strategy contact search (fuzzy name, keyword, semantic, combined)"
```

---

### Task 5: Embeddings Service

**Files:**
- Create: `api/src/services/embeddings.ts`
- Create: `api/src/services/__tests__/embeddings.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildEmbeddingText, updateContactEmbedding, batchUpdateEmbeddings } from "../embeddings";

describe("buildEmbeddingText", () => {
  it("concatenates non-null contact fields", () => {
    const text = buildEmbeddingText({
      name: "Janet Fring",
      role: "Managing Director",
      company: "Meridian Capital",
      location: "Melbourne",
      notes: "Real estate investor",
    });
    expect(text).toBe("Janet Fring Managing Director Meridian Capital Melbourne Real estate investor");
  });

  it("skips null fields", () => {
    const text = buildEmbeddingText({
      name: "Bob",
      role: null,
      company: null,
      location: null,
      notes: null,
    });
    expect(text).toBe("Bob");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/embeddings.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the embeddings service**

```typescript
import type pg from "pg";
import OpenAI from "openai";

const openai = new OpenAI();

interface ContactFields {
  name: string;
  role: string | null;
  company: string | null;
  location: string | null;
  notes: string | null;
}

export function buildEmbeddingText(contact: ContactFields): string {
  return [contact.name, contact.role, contact.company, contact.location, contact.notes]
    .filter(Boolean)
    .join(" ");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    input: text,
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1536"),
  });
  return response.data[0].embedding;
}

export async function updateContactEmbedding(
  db: pg.Pool,
  contactId: string
): Promise<void> {
  const { rows } = await db.query(
    "SELECT name, role, company, location, notes FROM contacts WHERE id = $1",
    [contactId]
  );
  if (!rows[0]) return;

  const text = buildEmbeddingText(rows[0]);
  const embedding = await generateEmbedding(text);

  await db.query("UPDATE contacts SET embedding = $1 WHERE id = $2", [
    JSON.stringify(embedding),
    contactId,
  ]);
}

export async function batchUpdateEmbeddings(
  db: pg.Pool,
  contactIds: string[]
): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    await Promise.all(batch.map((id) => updateContactEmbedding(db, id)));
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/__tests__/embeddings.test.ts`
Expected: PASS (unit tests for buildEmbeddingText; API-calling functions tested in integration)

**Step 5: Commit**

```bash
git add api/src/services/embeddings.ts api/src/services/__tests__/embeddings.test.ts
git commit -m "feat: embeddings service — text generation and OpenAI embedding API integration"
```

---

### Task 6: Contact Ingestion & Deduplication

**Files:**
- Create: `api/src/services/dedup.ts`
- Create: `api/src/services/ingestion.ts`
- Create: `api/src/services/__tests__/dedup.test.ts`
- Create: `api/src/services/__tests__/ingestion.test.ts`

**Step 1: Write the failing dedup tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers";
import { findDuplicate, mergeContacts } from "../dedup";
import type pg from "pg";

describe("dedup", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
  });
  afterAll(() => closeTestDb());
  beforeEach(() => cleanTestDb(db));

  describe("findDuplicate", () => {
    it("matches on email", async () => {
      await db.query(
        "INSERT INTO contacts (name, email) VALUES ('Janet Fring', 'janet@meridian.com')"
      );
      const match = await findDuplicate(db, { email: "janet@meridian.com", name: "J. Fring" });
      expect(match).not.toBeNull();
      expect(match!.name).toBe("Janet Fring");
    });

    it("matches on phone", async () => {
      await db.query(
        "INSERT INTO contacts (name, phone) VALUES ('Janet Fring', '+61412345678')"
      );
      const match = await findDuplicate(db, { phone: "+61412345678", name: "Janet" });
      expect(match).not.toBeNull();
    });

    it("matches on fuzzy name + company", async () => {
      await db.query(
        "INSERT INTO contacts (name, company) VALUES ('Janet Fring', 'Meridian Capital')"
      );
      const match = await findDuplicate(db, { name: "Janet Fring", company: "Meridian Capital" });
      expect(match).not.toBeNull();
    });

    it("returns null when no match", async () => {
      const match = await findDuplicate(db, { name: "Unknown Person", email: "nobody@example.com" });
      expect(match).toBeNull();
    });
  });

  describe("mergeContacts", () => {
    it("fills empty fields from new data", () => {
      const existing = { name: "Janet", company: "Meridian", role: null, location: null };
      const incoming = { name: "Janet Fring", company: null, role: "MD", location: "Melbourne" };
      const merged = mergeContacts(existing, incoming);
      expect(merged.name).toBe("Janet Fring"); // longer/newer wins
      expect(merged.company).toBe("Meridian"); // keep existing
      expect(merged.role).toBe("MD"); // fill blank
      expect(merged.location).toBe("Melbourne"); // fill blank
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/dedup.test.ts`
Expected: FAIL

**Step 3: Implement dedup service**

```typescript
import type pg from "pg";

interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  [key: string]: any;
}

export async function findDuplicate(
  db: pg.Pool,
  input: ContactInput
): Promise<any | null> {
  // 1. Email match (highest confidence)
  if (input.email) {
    const { rows } = await db.query(
      "SELECT * FROM contacts WHERE email = $1 LIMIT 1",
      [input.email]
    );
    if (rows[0]) return rows[0];
  }

  // 2. Phone match
  if (input.phone) {
    const { rows } = await db.query(
      "SELECT * FROM contacts WHERE phone = $1 LIMIT 1",
      [input.phone]
    );
    if (rows[0]) return rows[0];
  }

  // 3. Fuzzy name + company match
  if (input.name && input.company) {
    const { rows } = await db.query(
      `SELECT *, similarity(name, $1) AS name_sim
       FROM contacts
       WHERE similarity(name, $1) > 0.8
         AND company IS NOT NULL
         AND lower(company) = lower($2)
       ORDER BY name_sim DESC
       LIMIT 1`,
      [input.name, input.company]
    );
    if (rows[0]) return rows[0];
  }

  return null;
}

export function mergeContacts(existing: any, incoming: any): any {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null) continue;
    if (key === "source_databases") {
      // Append sources
      merged.source_databases = [
        ...new Set([...(existing.source_databases || []), ...(Array.isArray(value) ? value : [value])]),
      ];
      continue;
    }
    // Fill empty fields, or prefer longer/newer string values
    if (existing[key] == null) {
      merged[key] = value;
    } else if (typeof value === "string" && typeof existing[key] === "string" && value.length > existing[key].length) {
      merged[key] = value;
    }
  }
  return merged;
}
```

**Step 4: Run dedup tests to verify they pass**

Run: `cd api && npx vitest run src/services/__tests__/dedup.test.ts`
Expected: PASS

**Step 5: Write ingestion tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers";
import { upsertContact } from "../ingestion";
import type pg from "pg";

describe("upsertContact", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
  });
  afterAll(() => closeTestDb());
  beforeEach(() => cleanTestDb(db));

  it("creates a new contact when no duplicate exists", async () => {
    const result = await upsertContact(db, {
      name: "Janet Fring",
      email: "janet@meridian.com",
      company: "Meridian Capital",
      source: "gmail",
    });
    expect(result.action).toBe("created");
    expect(result.contact.name).toBe("Janet Fring");
  });

  it("merges with existing contact on email match", async () => {
    await upsertContact(db, {
      name: "Janet",
      email: "janet@meridian.com",
      source: "gmail",
    });
    const result = await upsertContact(db, {
      name: "Janet Fring",
      email: "janet@meridian.com",
      company: "Meridian Capital",
      role: "MD",
      source: "linkedin",
    });
    expect(result.action).toBe("merged");
    expect(result.contact.name).toBe("Janet Fring");
    expect(result.contact.company).toBe("Meridian Capital");
  });
});
```

**Step 6: Run ingestion tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/ingestion.test.ts`
Expected: FAIL

**Step 7: Implement ingestion service**

```typescript
import type pg from "pg";
import { findDuplicate, mergeContacts } from "./dedup";
import { scrub } from "./scrubber";

interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
  source: string;
}

interface UpsertResult {
  action: "created" | "merged";
  contact: any;
}

export async function upsertContact(
  db: pg.Pool,
  input: ContactInput
): Promise<UpsertResult> {
  // Scrub PII from notes
  const scrubbed = {
    ...input,
    notes: input.notes ? scrub(input.notes) : null,
  };

  const existing = await findDuplicate(db, scrubbed);

  if (existing) {
    const merged = mergeContacts(existing, {
      ...scrubbed,
      source_databases: [scrubbed.source],
    });
    const { rows } = await db.query(
      `UPDATE contacts SET
        name = $1, company = $2, role = $3, location = $4,
        email = $5, phone = $6, linkedin_url = $7, notes = $8,
        source_databases = $9
      WHERE id = $10 RETURNING *`,
      [
        merged.name, merged.company, merged.role, merged.location,
        merged.email, merged.phone, merged.linkedin_url, merged.notes,
        merged.source_databases, existing.id,
      ]
    );
    return { action: "merged", contact: rows[0] };
  }

  const { rows } = await db.query(
    `INSERT INTO contacts (name, company, role, location, email, phone, linkedin_url, notes, source_databases)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      scrubbed.name, scrubbed.company, scrubbed.role, scrubbed.location,
      scrubbed.email, scrubbed.phone, scrubbed.linkedin_url, scrubbed.notes,
      [scrubbed.source],
    ]
  );
  return { action: "created", contact: rows[0] };
}
```

**Step 8: Run ingestion tests to verify they pass**

Run: `cd api && npx vitest run src/services/__tests__/ingestion.test.ts`
Expected: PASS

**Step 9: Commit**

```bash
git add api/src/services/dedup.ts api/src/services/ingestion.ts api/src/services/__tests__/dedup.test.ts api/src/services/__tests__/ingestion.test.ts
git commit -m "feat: contact ingestion with dedup (email, phone, fuzzy name+company) and PII scrubbing"
```

---

### Task 7: Claude Service

**Files:**
- Create: `api/src/services/claude.ts`
- Create: `api/src/services/__tests__/claude.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { buildBriefingPrompt, buildOutreachPrompt, classifySearchIntent } from "../claude";

describe("claude prompt builders", () => {
  it("builds briefing consolidation prompt with history", () => {
    const prompt = buildBriefingPrompt(
      [{ name: "Markets", output: "BTC up 5%" }],
      [{ date: "2026-03-22", content: "BTC was stable..." }]
    );
    expect(prompt).toContain("BTC up 5%");
    expect(prompt).toContain("BTC was stable");
  });

  it("builds outreach prompt with contact context", () => {
    const prompt = buildOutreachPrompt(
      "intro to Melbourne real estate contacts",
      { name: "Janet Fring", company: "Meridian", notes: "RE investor" },
      [{ summary: "Met at conference 2025" }]
    );
    expect(prompt).toContain("Janet Fring");
    expect(prompt).toContain("conference");
  });
});

describe("classifySearchIntent", () => {
  it("exports classifySearchIntent function", () => {
    expect(typeof classifySearchIntent).toBe("function");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/claude.test.ts`
Expected: FAIL

**Step 3: Implement Claude service**

```typescript
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
  return JSON.parse(text);
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
```

**Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/__tests__/claude.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add api/src/services/claude.ts api/src/services/__tests__/claude.test.ts
git commit -m "feat: Claude service — briefing consolidation, outreach drafting, intent classification"
```

---

### Task 8: Briefings Route

**Files:**
- Create: `api/src/routes/briefings.ts`
- Create: `api/src/services/__tests__/briefings-route.test.ts`
- Modify: `api/src/index.ts` (mount briefings router)

**Step 1: Write failing tests for briefing storage and retrieval**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getTestDb, cleanTestDb, closeTestDb } from "../../db/test-helpers";
import type pg from "pg";

describe("briefings storage", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = await getTestDb();
  });
  afterAll(() => closeTestDb());
  beforeEach(() => cleanTestDb(db));

  it("stores a briefing and retrieves history", async () => {
    // Store
    await db.query(
      "INSERT INTO briefings (user_id, date, content, sub_agent_outputs) VALUES ($1, $2, $3, $4)",
      ["sean", "2026-03-22", "BTC stable at 65k", JSON.stringify([{ name: "Markets", output: "BTC 65k" }])]
    );

    // Retrieve history
    const { rows } = await db.query(
      "SELECT * FROM briefings WHERE user_id = $1 ORDER BY date DESC LIMIT 5",
      ["sean"]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("BTC stable at 65k");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/briefings-route.test.ts`
Expected: FAIL (or PASS if it's just db queries — either way validates schema)

**Step 3: Implement briefings route**

```typescript
import { Router } from "express";
import type { DB } from "../db/client";
import { consolidateBriefing } from "../services/claude";

export function briefingsRouter(db: DB): Router {
  const router = Router();

  // Get recent briefing history
  router.get("/history", async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || "sean";
      const limit = parseInt((req.query.limit as string) || "5");
      const { rows } = await db.query(
        "SELECT id, date, content, sub_agent_outputs, created_at FROM briefings WHERE user_id = $1 ORDER BY date DESC LIMIT $2",
        [userId, limit]
      );
      res.json({ briefings: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Assemble and store a new briefing
  router.post("/assemble", async (req, res) => {
    try {
      const { user_id = "sean", sub_agent_outputs } = req.body;

      // Get recent history for context
      const historyLimit = parseInt(process.env.BRIEFING_HISTORY_COUNT || "5");
      const { rows: history } = await db.query(
        "SELECT date::text, content FROM briefings WHERE user_id = $1 ORDER BY date DESC LIMIT $2",
        [user_id, historyLimit]
      );

      // Consolidate via Claude
      const content = await consolidateBriefing(sub_agent_outputs, history);

      // Store
      const { rows } = await db.query(
        "INSERT INTO briefings (user_id, content, sub_agent_outputs) VALUES ($1, $2, $3) RETURNING *",
        [user_id, content, JSON.stringify(sub_agent_outputs)]
      );

      res.json({ briefing: rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Store a pre-assembled briefing (for n8n to call after sending)
  router.post("/store", async (req, res) => {
    try {
      const { user_id = "sean", content, sub_agent_outputs } = req.body;
      const { rows } = await db.query(
        "INSERT INTO briefings (user_id, content, sub_agent_outputs) VALUES ($1, $2, $3) RETURNING *",
        [user_id, content, JSON.stringify(sub_agent_outputs)]
      );
      res.json({ briefing: rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Matchmaking suggestions for upcoming calendar events
  router.post("/matchmaking", async (req, res) => {
    try {
      const { attendees } = req.body;
      // For each attendee, find potential introductions via semantic search
      // This will be implemented when embeddings are populated
      res.json({ suggestions: [], message: "Matchmaking requires populated embeddings" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

**Step 4: Mount in index.ts**

Add to `api/src/index.ts`:
```typescript
import { briefingsRouter } from "./routes/briefings";

app.use("/api/briefings", briefingsRouter(pool));
```

**Step 5: Run tests**

Run: `cd api && npx vitest run src/services/__tests__/briefings-route.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add api/src/routes/briefings.ts api/src/services/__tests__/briefings-route.test.ts api/src/index.ts
git commit -m "feat: briefings route — assembly with history context, storage, matchmaking stub"
```

---

### Task 9: Outreach Route

**Files:**
- Create: `api/src/routes/outreach.ts`
- Modify: `api/src/index.ts` (mount outreach router)

**Step 1: Implement outreach route**

```typescript
import { Router } from "express";
import type { DB } from "../db/client";
import { searchContacts } from "../services/search";
import { draftOutreach } from "../services/claude";
import { scrub } from "../services/scrubber";

export function outreachRouter(db: DB): Router {
  const router = Router();

  // Generate outreach drafts for matching contacts
  router.post("/draft", async (req, res) => {
    try {
      const { campaign_goal, query, strategy = "combined", limit = 10 } = req.body;

      // Find matching contacts
      const contacts = await searchContacts(db, {
        strategy,
        query,
        limit,
      });

      // For each contact, get interaction history and draft message
      const drafts = await Promise.all(
        contacts.map(async (contact) => {
          const { rows: interactions } = await db.query(
            "SELECT summary FROM interactions WHERE contact_id = $1 ORDER BY date DESC LIMIT 5",
            [contact.id]
          );

          const draft = await draftOutreach(campaign_goal, contact, interactions);

          return {
            contact: {
              id: contact.id,
              name: contact.name,
              company: contact.company,
              email: contact.email,
            },
            draft: scrub(draft),
            interaction_count: interactions.length,
          };
        })
      );

      res.json({ drafts, count: drafts.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

**Step 2: Mount in index.ts**

Add to `api/src/index.ts`:
```typescript
import { outreachRouter } from "./routes/outreach";

app.use("/api/outreach", outreachRouter(pool));
```

**Step 3: Commit**

```bash
git add api/src/routes/outreach.ts api/src/index.ts
git commit -m "feat: outreach route — draft generation with contact search and interaction context"
```

---

### Task 10: Ingestion Route (CSV + individual contacts)

**Files:**
- Create: `api/src/services/csv-parser.ts`
- Create: `api/src/services/__tests__/csv-parser.test.ts`
- Modify: `api/src/routes/contacts.ts` (add ingest endpoints)

**Step 1: Write failing CSV parser tests**

```typescript
import { describe, it, expect } from "vitest";
import { parseContactsCsv } from "../csv-parser";

describe("parseContactsCsv", () => {
  it("parses LinkedIn export format", async () => {
    const csv = `First Name,Last Name,Email Address,Company,Position,Connected On
Janet,Fring,janet@meridian.com,Meridian Capital,Managing Director,22 Mar 2025`;
    const contacts = await parseContactsCsv(csv);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Janet Fring");
    expect(contacts[0].email).toBe("janet@meridian.com");
    expect(contacts[0].company).toBe("Meridian Capital");
    expect(contacts[0].role).toBe("Managing Director");
  });

  it("handles missing fields gracefully", async () => {
    const csv = `First Name,Last Name,Email Address
Bob,,bob@example.com`;
    const contacts = await parseContactsCsv(csv);
    expect(contacts[0].name).toBe("Bob");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/__tests__/csv-parser.test.ts`
Expected: FAIL

**Step 3: Implement CSV parser**

```typescript
import { parse } from "csv-parse/sync";

interface ParsedContact {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  linkedin_url: string | null;
  notes: string | null;
}

export async function parseContactsCsv(csvText: string): Promise<ParsedContact[]> {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((r: any) => {
    const firstName = r["First Name"] || r["first_name"] || r["Name"] || "";
    const lastName = r["Last Name"] || r["last_name"] || "";
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();

    return {
      name: name || "Unknown",
      email: r["Email Address"] || r["email"] || r["Email"] || null,
      phone: r["Phone"] || r["phone"] || null,
      company: r["Company"] || r["company"] || r["Organization"] || null,
      role: r["Position"] || r["role"] || r["Title"] || r["Job Title"] || null,
      location: r["Location"] || r["location"] || r["City"] || null,
      linkedin_url: r["Profile URL"] || r["linkedin_url"] || null,
      notes: r["Notes"] || r["notes"] || null,
    };
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/__tests__/csv-parser.test.ts`
Expected: PASS

**Step 5: Add ingest endpoints to contacts route**

Add to `api/src/routes/contacts.ts`:

```typescript
import { upsertContact } from "../services/ingestion";
import { parseContactsCsv } from "../services/csv-parser";
import { updateContactEmbedding } from "../services/embeddings";

// Single contact ingest
router.post("/ingest", async (req, res) => {
  try {
    const result = await upsertContact(db, req.body);
    // Queue embedding update (fire and forget)
    updateContactEmbedding(db, result.contact.id).catch(console.error);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Bulk CSV ingest
router.post("/ingest/csv", async (req, res) => {
  try {
    const { csv, source } = req.body;
    const contacts = await parseContactsCsv(csv);
    const results = [];
    for (const c of contacts) {
      const result = await upsertContact(db, { ...c, source: source || "csv" });
      results.push(result);
    }
    // Batch embedding update
    const ids = results.map((r) => r.contact.id);
    batchUpdateEmbeddings(db, ids).catch(console.error);
    res.json({
      total: results.length,
      created: results.filter((r) => r.action === "created").length,
      merged: results.filter((r) => r.action === "merged").length,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
```

Also add the import for `batchUpdateEmbeddings` from `../services/embeddings`.

**Step 6: Commit**

```bash
git add api/src/services/csv-parser.ts api/src/services/__tests__/csv-parser.test.ts api/src/routes/contacts.ts
git commit -m "feat: contact ingestion route — single upsert and bulk CSV import with auto-embedding"
```

---

### Task 11: Interactions Route

**Files:**
- Create: `api/src/routes/interactions.ts`
- Modify: `api/src/index.ts` (mount interactions router)

**Step 1: Implement interactions route**

```typescript
import { Router } from "express";
import type { DB } from "../db/client";
import { scrub } from "../services/scrubber";
import { summarizeInteraction } from "../services/claude";

export function interactionsRouter(db: DB): Router {
  const router = Router();

  // Record a new interaction
  router.post("/", async (req, res) => {
    try {
      const { contact_id, type, date, raw_content } = req.body;

      // Scrub and summarize
      const scrubbed = scrub(raw_content || "");
      const summary = raw_content ? await summarizeInteraction(scrubbed) : null;

      const { rows } = await db.query(
        `INSERT INTO interactions (contact_id, type, date, summary, raw_content)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [contact_id, type, date || new Date().toISOString(), summary, scrubbed]
      );

      // Update contact's last_interaction_date
      await db.query(
        "UPDATE contacts SET last_interaction_date = $1 WHERE id = $2",
        [date || new Date().toISOString(), contact_id]
      );

      res.json({ interaction: rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get interactions for a contact
  router.get("/:contact_id", async (req, res) => {
    try {
      const { rows } = await db.query(
        "SELECT * FROM interactions WHERE contact_id = $1 ORDER BY date DESC LIMIT $2",
        [req.params.contact_id, parseInt((req.query.limit as string) || "20")]
      );
      res.json({ interactions: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

**Step 2: Mount in index.ts**

```typescript
import { interactionsRouter } from "./routes/interactions";

app.use("/api/interactions", interactionsRouter(pool));
```

**Step 3: Commit**

```bash
git add api/src/routes/interactions.ts api/src/index.ts
git commit -m "feat: interactions route — record with auto-summarization and PII scrubbing"
```

---

### Task 12: Sub-Agents Route

**Files:**
- Create: `api/src/routes/sub-agents.ts`
- Modify: `api/src/index.ts` (mount sub-agents router)

**Step 1: Implement sub-agents CRUD route**

```typescript
import { Router } from "express";
import type { DB } from "../db/client";

export function subAgentsRouter(db: DB): Router {
  const router = Router();

  // List active sub-agents
  router.get("/", async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || "sean";
      const { rows } = await db.query(
        "SELECT * FROM sub_agents WHERE user_id = $1 AND active = true ORDER BY name",
        [userId]
      );
      res.json({ sub_agents: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create a sub-agent
  router.post("/", async (req, res) => {
    try {
      const { user_id = "sean", type, name, config = {}, workflow_id, schedule } = req.body;
      const { rows } = await db.query(
        `INSERT INTO sub_agents (user_id, type, name, config, workflow_id, schedule)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user_id, type, name, JSON.stringify(config), workflow_id, schedule]
      );
      res.json({ sub_agent: rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Update a sub-agent
  router.patch("/:id", async (req, res) => {
    try {
      const { name, config, schedule, active } = req.body;
      const { rows } = await db.query(
        `UPDATE sub_agents SET
          name = COALESCE($1, name),
          config = COALESCE($2, config),
          schedule = COALESCE($3, schedule),
          active = COALESCE($4, active)
        WHERE id = $5 RETURNING *`,
        [name, config ? JSON.stringify(config) : null, schedule, active, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json({ sub_agent: rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Delete (deactivate) a sub-agent
  router.delete("/:id", async (req, res) => {
    try {
      await db.query("UPDATE sub_agents SET active = false WHERE id = $1", [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

**Step 2: Mount in index.ts**

```typescript
import { subAgentsRouter } from "./routes/sub-agents";

app.use("/api/sub-agents", subAgentsRouter(pool));
```

**Step 3: Commit**

```bash
git add api/src/routes/sub-agents.ts api/src/index.ts
git commit -m "feat: sub-agents CRUD route — list, create, update, deactivate"
```

---

### Task 13: Final API Assembly & Smoke Test

**Files:**
- Modify: `api/src/index.ts` (final assembly — ensure all routes mounted)

**Step 1: Verify api/src/index.ts has all routes mounted**

The final index.ts should import and mount all routers:
- `/api/contacts` → contactsRouter
- `/api/briefings` → briefingsRouter
- `/api/outreach` → outreachRouter
- `/api/interactions` → interactionsRouter
- `/api/sub-agents` → subAgentsRouter

**Step 2: Run TypeScript compilation check**

Run: `cd api && npx tsc --noEmit`
Expected: no errors

**Step 3: Run all tests**

Run: `cd api && npx vitest run`
Expected: all tests pass

**Step 4: Commit (if any assembly changes)**

```bash
git add api/src/index.ts
git commit -m "feat: assemble all API routes — contacts, briefings, outreach, interactions, sub-agents"
```

---

### Task 14: n8n Workflow — Telegram Chat (Conversational AI)

**Files:**
- Create: `n8n/workflows/telegram-chat.json`

**Step 1: Create the Telegram chat workflow**

This workflow handles incoming Telegram messages, routes them through Claude AI Agent with tool-calling to the API service, and responds.

The workflow JSON should define:
1. **Telegram Trigger** node — receives incoming messages
2. **AI Agent** node (LangChain ReAct) — processes the message with tools:
   - Contact search tool (HTTP Request to `http://api:3000/api/contacts/search`)
   - Interaction history tool (HTTP Request to `http://api:3000/api/interactions/:id`)
   - Sub-agent management tool (HTTP Request to `http://api:3000/api/sub-agents`)
   - Briefing history tool (HTTP Request to `http://api:3000/api/briefings/history`)
   - Outreach draft tool (HTTP Request to `http://api:3000/api/outreach/draft`)
3. **Postgres Chat Memory** node — session persistence keyed by chat ID
4. **Telegram Send** node — returns the AI response

Note: n8n workflow JSONs are large and declarative. The implementing engineer should use n8n's UI to build and export this workflow, using the node types and API endpoints specified above. A skeleton JSON with the correct node types and connections will be provided, but fine-tuning happens in the n8n UI.

**Step 2: Test manually**

After import, send a message to the Telegram bot and verify it responds via the AI Agent node.

**Step 3: Commit**

```bash
git add n8n/workflows/telegram-chat.json
git commit -m "feat: n8n Telegram chat workflow — AI Agent with contact search and outreach tools"
```

---

### Task 15: n8n Workflow — Morning Briefing

**Files:**
- Create: `n8n/workflows/morning-briefing.json`

**Step 1: Create the morning briefing workflow**

Workflow structure:
1. **Cron Trigger** — fires at configured time (default 7am)
2. **HTTP Request** — GET `http://api:3000/api/sub-agents?user_id=sean` to list active sub-agents
3. **Split In Batches** — iterate over sub-agents
4. **Execute Workflow** — run each sub-agent's workflow (referenced by workflow_id in sub_agent config)
5. **Merge** — collect all sub-agent outputs
6. **HTTP Request** — POST `http://api:3000/api/briefings/assemble` with sub_agent_outputs array
7. **Telegram Send** — deliver the assembled briefing to the user

The implementing engineer should build this in the n8n UI and export. Key config: Cron schedule from env var, Telegram chat ID from env var.

**Step 2: Seed default sub-agents**

Add a seed SQL or API call to create initial sub-agents:
- Market tracker (crypto prices via CoinGecko)
- Network activity (recent interactions summary)

**Step 3: Test by manually triggering the workflow in n8n UI**

Expected: briefing arrives in Telegram with market data and network summary.

**Step 4: Commit**

```bash
git add n8n/workflows/morning-briefing.json
git commit -m "feat: n8n morning briefing workflow — cron-triggered with sub-agent orchestration"
```

---

### Task 16: n8n Workflow — Urgent Alerts

**Files:**
- Create: `n8n/workflows/urgent-alerts.json`

**Step 1: Create the urgent alerts workflow**

1. **Cron Trigger** — every 15 minutes
2. **HTTP Request** — GET active sub-agents with alert_thresholds in config
3. **Code Node** — for each sub-agent, check thresholds (e.g., price change > X%)
4. **IF Node** — threshold breached?
5. **Telegram Send** — fire alert immediately

This is a deterministic workflow — no Claude call needed. Threshold checks are simple comparisons in a Code node.

**Step 2: Test by manually triggering**

**Step 3: Commit**

```bash
git add n8n/workflows/urgent-alerts.json
git commit -m "feat: n8n urgent alerts workflow — 15-min cron with deterministic threshold checks"
```

---

### Task 17: n8n Workflow — Gmail Trigger

**Files:**
- Create: `n8n/workflows/gmail-trigger.json`

**Step 1: Create the Gmail trigger workflow**

1. **Gmail Trigger** — fires on new email (OAuth2 credentials)
2. **Code Node** — extract sender name, email, subject, body snippet
3. **HTTP Request** — POST `http://api:3000/api/contacts/ingest` with sender data (source: "gmail")
4. **HTTP Request** — POST `http://api:3000/api/interactions` with email summary (type: "email")

This auto-populates the contacts database from every incoming email.

**Step 2: Configure OAuth2 credentials in n8n UI**

User must authorize Gmail access in n8n's credential setup.

**Step 3: Test by sending a test email**

Expected: sender appears in contacts table, email recorded as interaction.

**Step 4: Commit**

```bash
git add n8n/workflows/gmail-trigger.json
git commit -m "feat: n8n Gmail trigger — auto-ingest contacts and interactions from incoming email"
```

---

### Task 18: n8n Workflow — Calendar Trigger

**Files:**
- Create: `n8n/workflows/calendar-trigger.json`

**Step 1: Create the Calendar trigger workflow**

1. **Google Calendar Trigger** — fires on new/updated event
2. **Code Node** — extract attendee names, emails, event summary
3. **Loop** — for each attendee:
   - HTTP Request → POST `http://api:3000/api/contacts/ingest` (source: "calendar")
   - HTTP Request → POST `http://api:3000/api/interactions` (type: "meeting")

**Step 2: Test by creating a calendar event**

**Step 3: Commit**

```bash
git add n8n/workflows/calendar-trigger.json
git commit -m "feat: n8n Calendar trigger — auto-ingest attendees and meeting interactions"
```

---

### Task 19: n8n Workflow — Outreach Campaign

**Files:**
- Create: `n8n/workflows/outreach-campaign.json`

**Step 1: Create the outreach campaign workflow**

1. **Webhook Trigger** — called by the AI Agent from the chat workflow when user requests outreach
2. **HTTP Request** — POST `http://api:3000/api/outreach/draft` with campaign_goal and query
3. **Split In Batches** — iterate over drafts
4. **Telegram Send** — send each draft with inline keyboard buttons (Approve / Edit / Skip)
5. **Wait** — pause for user response (n8n Wait node with webhook resume)
6. **IF Node** — route based on button pressed:
   - Approve → send via email/Telegram/WhatsApp
   - Edit → wait for user's edited text, then re-present
   - Skip → move to next draft

**Step 2: Test end-to-end manually**

Expected: user says "draft intros to Melbourne contacts" → receives drafts with buttons → approve sends.

**Step 3: Commit**

```bash
git add n8n/workflows/outreach-campaign.json
git commit -m "feat: n8n outreach campaign workflow — draft, approve/edit/skip via Telegram inline buttons"
```

---

### Task 20: n8n Workflow — WhatsApp Chat (Optional)

**Files:**
- Create: `n8n/workflows/whatsapp-chat.json`

**Step 1: Create the WhatsApp chat workflow (mirrors Telegram chat)**

1. **Webhook** — receives messages from Evolution API
2. **AI Agent** node — same tool configuration as Telegram chat
3. **Postgres Chat Memory** — keyed by WhatsApp sender phone number
4. **HTTP Request** — sends response back via Evolution API REST endpoint

This is structurally identical to the Telegram chat workflow but uses webhook/HTTP instead of native Telegram nodes.

**Step 2: Test with Evolution API running**

Run: `docker compose --profile whatsapp up -d evolution-api`
Then scan QR code and send a test message.

**Step 3: Commit**

```bash
git add n8n/workflows/whatsapp-chat.json
git commit -m "feat: n8n WhatsApp chat workflow — AI Agent via Evolution API bridge"
```

---

### Task 21: Setup Script

**Files:**
- Create: `setup.sh`

**Step 1: Write setup.sh**

```bash
#!/bin/bash
set -e

echo "=== You.ai POC Setup ==="

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker required. Install: https://docs.docker.com/get-docker/"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "Docker Compose required."; exit 1; }

# Copy .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it with your API keys before proceeding."
  echo "Required: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, OPENAI_API_KEY"
  exit 0
fi

# Start services
echo "Starting Postgres, API, and n8n..."
docker compose up -d postgres api n8n

# Wait for services
echo "Waiting for services to be ready..."
until docker compose exec postgres pg_isready -U youai > /dev/null 2>&1; do sleep 1; done
echo "Postgres ready."

until curl -sf http://localhost:3000/health > /dev/null 2>&1; do sleep 1; done
echo "API ready."

until curl -sf http://localhost:5678/healthz > /dev/null 2>&1; do sleep 1; done
echo "n8n ready."

# Import n8n workflows
echo "Importing n8n workflows..."
docker compose exec n8n sh /workflows/../import.sh || echo "Manual workflow import may be needed via n8n UI"

echo ""
echo "=== Setup Complete ==="
echo "n8n UI: http://localhost:5678"
echo "API: http://localhost:3000"
echo ""
echo "Next steps:"
echo "1. Open n8n UI and configure Gmail OAuth2 credentials"
echo "2. Set your Telegram chat ID in workflow variables"
echo "3. Activate workflows in n8n"
echo "4. (Optional) Enable WhatsApp: docker compose --profile whatsapp up -d"
```

**Step 2: Make executable and commit**

```bash
chmod +x setup.sh
git add setup.sh
git commit -m "feat: setup script — prerequisites check, Docker Compose start, workflow import"
```

---

### Task 22: End-to-End Smoke Test

**Files:** None (manual testing)

**Step 1: Start all services**

Run: `./setup.sh`

**Step 2: Test Contact Search**

```bash
# Ingest a test contact
curl -X POST http://localhost:3000/api/contacts/ingest \
  -H "Content-Type: application/json" \
  -d '{"name": "Janet Fring", "email": "janet@meridian.com", "company": "Meridian Capital", "role": "Managing Director", "location": "Melbourne", "notes": "Real estate investor", "source": "manual"}'

# Search by name (fuzzy)
curl -X POST http://localhost:3000/api/contacts/search \
  -H "Content-Type: application/json" \
  -d '{"strategy": "fuzzy_name", "query": "Jannet Frng"}'

# Search by keyword
curl -X POST http://localhost:3000/api/contacts/search \
  -H "Content-Type: application/json" \
  -d '{"strategy": "keyword", "query": "Melbourne real estate"}'
```

Expected: Contact found via both strategies.

**Step 3: Test Briefing Storage**

```bash
curl -X POST http://localhost:3000/api/briefings/store \
  -H "Content-Type: application/json" \
  -d '{"content": "Test briefing content", "sub_agent_outputs": [{"name": "test", "output": "test data"}]}'

curl http://localhost:3000/api/briefings/history
```

Expected: Briefing stored and retrievable.

**Step 4: Test Telegram Bot**

Send a message to the Telegram bot: "who is Janet Fring"
Expected: AI Agent calls contact search, returns formatted result.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes"
```

---

### Task 23: Final Cleanup & Documentation

**Files:**
- Create: `README.md`

**Step 1: Write README.md**

Include:
- Project description (1-2 sentences)
- Quick start (prerequisites, setup, first run)
- Architecture diagram (text-based)
- API endpoints reference
- n8n workflow descriptions
- Environment variables reference

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quick start, architecture, and API reference"
```

**2026-03-23T11:02:34Z**

All 23 tasks complete. Tasks 1-13: API service (Express/TS) with contacts search, ingestion/dedup, briefings, outreach, interactions, sub-agents routes. PII scrubber, embeddings service, Claude service. Tasks 14-20: 7 n8n workflow JSONs. Task 21: setup script. Task 23: README. Final review completed and fixes applied (workflow/API field mismatches, unsafe JSON parse, type dedup).
