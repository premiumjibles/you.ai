# You.ai Dashboard — Design Spec

## Overview

A web dashboard for You.ai that gives users a visual command center for their personal AI assistant. Surfaces daily briefings, GitHub activity, outreach draft management, data imports, and full configuration — all in a dark, minimal UI served from the existing Express app.

**Key decisions:**
- Multi-tenant (each user gets their own scoped dashboard)
- Auth via bot-issued magic links (Telegram/WhatsApp)
- React SPA served as static files from the existing Express server (single deployment)
- Dark and minimal aesthetic (Linear/Vercel style)
- Icon sidebar navigation
- Hero summary + source card grid for briefings

---

## 1. Authentication

### Flow

1. User sends `/dashboard` (or "open dashboard") to the bot via Telegram/WhatsApp
2. Bot generates a short-lived token, stores it in `dashboard_tokens` table
3. Bot replies with a link: `https://<host>/auth?token=<token>`
4. Express validates the token, creates a JWT session cookie, redirects to `/dashboard`
5. Subsequent API calls include the JWT — all data scoped by `user_id`

### Token Security

- 32 bytes, cryptographically random (`crypto.randomBytes`), base64url encoded
- Single-use: marked `used=true` on first consumption, reuse rejected
- 5-minute expiry, enforced server-side
- Rate limited: max 5 token generations per hour per user

### JWT Session

- Issued as `httpOnly`, `Secure`, `SameSite=Strict` cookie
- 24-hour expiry — user requests a fresh link to re-auth
- Contains `user_id` and `exp` claims
- Signed with a server-side secret (`DASHBOARD_JWT_SECRET` env var)

### New DB Table: `dashboard_tokens`

```sql
CREATE TABLE dashboard_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dashboard_tokens_token ON dashboard_tokens(token);
```

### Bot Command

Add a `/dashboard` command handler to the messaging layer. When received:
1. Check rate limit (5/hour for the user)
2. Generate token, insert into `dashboard_tokens` with `expires_at = NOW() + 5 minutes`
3. Reply with the URL

---

## 2. Navigation & Layout

### Icon Sidebar

A narrow (~56px) icon rail on the left side of the screen. Each icon has a tooltip on hover showing the page name.

| Icon | Page | Condition |
|------|------|-----------|
| Home | Briefings | Always visible |
| GitBranch | GitHub | Only if user has `github_activity` sub-agents |
| Send | Outreach | Always visible |
| Upload | Import | Always visible |
| Gear | Settings | Always visible |

Bottom of sidebar: user initial/avatar circle + logout action.

Active page indicated by a highlighted icon background (indigo tint).

### Responsive Behavior

On narrow viewports (<768px), the sidebar collapses to a bottom tab bar with the same icons.

---

## 3. Briefings Page (Home / Default)

### Layout (top to bottom)

**Date navigation:** "Today's Briefing" heading with left/right arrow buttons to browse previous dates. Current date shown as a subtle pill badge.

**Urgent alerts banner:** Conditionally rendered above the hero card if any alert-threshold sub-agents have fired. Subtle notification bar with alert details.

**Hero card:** Full-width card with a subtle gradient border. Displays the AI-consolidated briefing text — the same content the bot sends each morning. If no briefing exists for the selected date:
- Today: shows a "Generate now" button (calls `POST /api/briefings/trigger`)
- Past date: shows "No briefing was generated for this date"

**Source cards grid:** One card per sub-agent that contributed to the briefing. Rendered from the `sub_agent_outputs` JSONB column. Each card shows:
- Color-coded category label (Markets = indigo, GitHub = amber, RSS = green, Web Search = pink, Network = cyan, Custom = purple)
- Summary metric extracted from the output (e.g. "BTC $94,200 +2.4%", "3 PRs merged")
- Click to expand inline, revealing the full raw sub-agent output
- Expanded state toggles back on click

**Empty state:** No sub-agents configured → prompt card directing user to Settings to add data sources.

### Data Sources

- `GET /api/briefings/history` — briefing content and `sub_agent_outputs`
- `POST /api/briefings/trigger` — on-demand generation

---

## 4. GitHub Page

Only rendered in the sidebar navigation if the user has at least one active `github_activity` sub-agent.

### Layout

**Page header:** "GitHub Activity" with a time range indicator ("Last 24 hours").

**Repo cards:** One card per tracked repo (from sub-agent `config.repos`). Each card contains:
- **Header:** repo name (e.g. `vercel/next.js`) as a clickable link to GitHub
- **PRs section:** list of recently merged PRs — `#1234: Title (by author)` with links to GitHub
- **Commits section:** latest commits with message and author. Collapsed by default if PRs exist.
- **AI summary:** "Summarize changes" button that calls a new endpoint to generate a short LLM summary of the repo's recent activity. Cached for the current day.

**Add repo:** "+ Track repo" button at the bottom. Opens an inline form with an `owner/repo` text input. On submit, updates or creates the `github_activity` sub-agent's config via `PATCH /api/sub-agents/:id`.

### New Endpoint

```
POST /api/github/summary
Body: { repo: "owner/repo", commits: [...], prs: [...] }
Response: { summary: "..." }
```

Calls the `fast` model tier to generate a concise summary. Response cached in memory or a simple cache table for the day.

---

## 5. Outreach Page

### Layout

**Page header:** "Outreach Drafts" with status filter tabs: All / Pending / Approved / Sent / Discarded.

**Draft list:** Each draft rendered as a card showing:
- Recipient name and company
- Draft preview (first 2 lines, truncated)
- Status badge with color coding (Pending = yellow, Approved = green, Sent = blue, Discarded = gray)
- Generation timestamp

**Draft detail view:** Clicking a draft expands it to show:
- Full AI-generated message in an editable text area
- Context sidebar: why this person was selected, relevant contact notes, interaction history snippet (from `context` JSONB)
- Action buttons:
  - **Approve** — sets status to `approved`
  - **Edit & Approve** — saves edited text, sets status to `approved`
  - **Regenerate** — re-calls `/api/outreach/draft` with the same params, replaces message text
  - **Discard** — sets status to `discarded`

### New DB Table: `outreach_drafts`

```sql
CREATE TABLE outreach_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL DEFAULT 'sean',
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'sent', 'discarded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_outreach_drafts_user_status ON outreach_drafts(user_id, status);
```

### New Endpoints

```
GET  /api/outreach/drafts          — List drafts, optional ?status= filter
PATCH /api/outreach/drafts/:id     — Update status and/or message text
```

The existing `POST /api/outreach/draft` endpoint should be updated to also persist the generated draft to this table before returning it.

---

## 6. Import Page

### Layout

**Drop zone:** Large drag-and-drop area spanning the full content width. Accepts `.csv`, `.mbox`, and `.ics` files. Also includes a "Browse files" button for manual selection. File type auto-detected from extension.

**Upload progress:** After a file is dropped:
- File name and detected type badge
- Progress bar during upload
- Results summary on completion: "Imported 42 contacts, 3 duplicates merged, 12 interactions logged"
- Error state if upload fails

**Import history table:** Below the drop zone. Columns: Date, File name, Type, Records imported, Duplicates merged. Sorted by date descending.

### New DB Table: `import_history`

```sql
CREATE TABLE import_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL DEFAULT 'sean',
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'mbox', 'ics')),
  records_imported INT DEFAULT 0,
  duplicates_merged INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_import_history_user ON import_history(user_id, created_at DESC);
```

### New Endpoint

```
GET /api/import/history — List past imports for the authenticated user
```

Existing import endpoints (`POST /api/import/csv`, `/mbox`, `/ics`) should be updated to log results to `import_history` after successful processing.

---

## 7. Settings Page

Form-based UI organized into collapsible sections, each with its own save button.

### 7.1 LLM Provider

- Radio toggle: Anthropic / Venice
- API key input (masked with reveal toggle)
- Read-only display of model tier mappings (fast → haiku, quality → sonnet, etc.)
- Save validates the key format matches the selected provider

### 7.2 Messaging Provider

- Radio toggle: Telegram / WhatsApp
- Conditional fields based on selection:
  - **Telegram:** Bot token (validates `\d+:[A-Za-z0-9_-]+`), Owner ID (validates numeric)
  - **WhatsApp:** Phone number (validates 7+ digits), Evolution API URL, Evolution API key
- Changing provider requires a restart notice ("Changes take effect on next restart")

### 7.3 Sub-Agent Management

- List of active sub-agents as cards with: name, type badge, active/inactive toggle
- Click to expand and edit config (type-specific form fields):
  - `market_tracker`: editable asset list (comma-separated or tag input)
  - `financial_tracker`: editable symbol list
  - `github_activity`: repo list + include_prs toggle + alert_threshold input
  - `rss_feed`: URL list + max_items number
  - `web_search`: query list + search_depth select
  - `custom`: free-form prompt textarea
- "+ Add data source" button → type picker dropdown → config form
- Delete button (soft-delete via `PATCH /api/sub-agents/:id` setting `active=false`)

### 7.4 Briefing Schedule

- Cron expression input field
- Human-readable preview below ("Every day at 7:00 AM")
- Preset buttons: 6am, 7am, 8am, Custom
- Note: schedule change takes effect on next scheduler restart

### 7.5 Optional Integrations

Toggle cards for each optional service:
- **OpenAI** (semantic contact search) — API key input
- **Tavily** (web search) — API key input
- **GitHub** (activity tracking) — personal access token input
- **Alpha Vantage** (financial data) — API key input

Each card shows enabled/disabled state and expands to show the key input when enabled.

### New DB Table: `user_settings`

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,  -- encrypted at rest
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);
```

Settings are encrypted at rest using a server-side encryption key (`SETTINGS_ENCRYPTION_KEY` env var). API responses return masked values for sensitive keys (e.g. `sk-ant-****xyz`).

### New Endpoints

```
GET   /api/settings          — Read all settings (masked secrets)
PATCH /api/settings          — Update one or more settings
```

---

## 8. Auth Middleware

A new Express middleware applied to all `/api/*` routes (except `/auth`):

1. Extract JWT from the `httpOnly` cookie
2. Verify signature and expiry
3. Attach `user_id` to `req` (e.g. `req.userId`)
4. Return 401 if invalid or missing

Existing route handlers switch from hardcoded `'sean'` user_id to `req.userId`.

For backward compatibility during the transition, if no JWT is present and `NODE_ENV !== 'production'`, fall back to the default user_id. This allows the Telegram/WhatsApp bot to continue calling internal API endpoints without auth during development.

---

## 9. Frontend Architecture

### Tech Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **React Router** for client-side routing
- **Tailwind CSS** for styling (dark theme, consistent with the minimal aesthetic)
- No component library — custom components to keep the bundle lean and the design cohesive

### Directory Structure

```
dashboard/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Router + layout shell + auth guard
│   ├── api.ts                # Fetch wrapper (handles 401 → redirect to re-auth)
│   ├── components/
│   │   ├── Sidebar.tsx       # Icon rail + tooltips + active state
│   │   ├── HeroCard.tsx      # Consolidated briefing display
│   │   ├── SourceCard.tsx    # Individual sub-agent output card
│   │   ├── AlertBanner.tsx   # Urgent alerts bar
│   │   ├── DraftCard.tsx     # Outreach draft list item + detail
│   │   ├── DropZone.tsx      # File upload with drag-and-drop
│   │   ├── RepoCard.tsx      # GitHub repo activity card
│   │   ├── SettingsSection.tsx  # Collapsible settings section
│   │   └── DateNav.tsx       # Date navigation with arrows
│   ├── pages/
│   │   ├── Briefings.tsx
│   │   ├── GitHub.tsx
│   │   ├── Outreach.tsx
│   │   ├── Import.tsx
│   │   └── Settings.tsx
│   └── hooks/
│       ├── useAuth.ts        # Auth state, logout, 401 handling
│       └── useApi.ts         # Data fetching with loading/error states
```

### Build & Serving

- `dashboard/` lives at the repo root as a sibling to `api/`
- Vite builds to `dashboard/dist/`
- Express serves `dashboard/dist/` as static files with a catch-all that returns `index.html` for client-side routing
- In development: Vite dev server with proxy to Express API on port 3000

### Docker Integration

- The `Dockerfile` builds both the API (`api/`) and the dashboard (`dashboard/`)
- Single container serves both
- No new services in `docker-compose.yml`

---

## 10. New Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DASHBOARD_JWT_SECRET` | Signing key for JWT session tokens | Yes (auto-generated by setup.sh) |
| `SETTINGS_ENCRYPTION_KEY` | Encryption key for sensitive settings at rest | Yes (auto-generated by setup.sh) |

Both should be added to `setup.sh` auto-generation and `.env.example`.

---

## 11. Visual Design Tokens

Consistent with the dark minimal aesthetic:

| Token | Value |
|-------|-------|
| Background (page) | `#0a0a0f` |
| Background (card/sidebar) | `#111118` |
| Border | `#1e1e2e` |
| Text primary | `#e2e8f0` |
| Text secondary | `#999` |
| Text muted | `#666` |
| Accent (primary) | `#6366f1` (indigo) |
| Success | `#22c55e` |
| Warning | `#f59e0b` |
| Danger | `#ef4444` |
| Category: Markets | `#6366f1` |
| Category: GitHub | `#f59e0b` |
| Category: RSS | `#22c55e` |
| Category: Web Search | `#ec4899` |
| Category: Network | `#06b6d4` |
| Category: Custom | `#a78bfa` |
| Border radius (cards) | `8px` |
| Border radius (buttons) | `6px` |
| Sidebar width | `56px` |
