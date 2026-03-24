# Interactive Setup Wizard Design

## Overview

Replace the current two-pass `setup.sh` (which requires manual `.env` editing) with an interactive CLI wizard that collects all required configuration through guided prompts. Uses Charm's `gum` for a polished TUI experience with a graceful bash fallback.

## Goals

- **Get running fast**: collect only essentials (Anthropic key + messaging credentials), then offer advanced config
- **Guide the user**: walk through obtaining credentials (BotFather, API consoles), don't assume they have anything
- **Re-runnable**: detect existing config and offer a menu of actions (advanced config, re-setup, start services)
- **Resilient**: graceful fallback to plain bash prompts if `gum` can't be downloaded

## Non-Goals

- Replacing Docker as the deployment mechanism
- Supporting messaging providers beyond Telegram and WhatsApp
- GUI or web-based setup

---

## Architecture

### Tool: Charm's `gum` with Bash Fallback

`gum` is a single statically-linked Go binary (~10MB) that provides composable TUI components callable from shell scripts: arrow-key menus, masked input, spinners, styled text.

**Download strategy:**
- On first run, download `gum` v0.14.5 for the detected OS/arch to `.gum/` inside the project directory
- Add `.gum/` to `.gitignore`
- On subsequent runs, reuse the cached binary
- Detect OS (`uname -s`) and arch (`uname -m`), map to release artifacts (linux/darwin, amd64/arm64)

**Fallback mapping:**

| Feature | gum | Fallback |
|---|---|---|
| Text input | `gum input --placeholder "..."` | `read -p "..." val` |
| Masked input | `gum input --password` | `read -s -p "..." val` |
| Selection menu | `gum choose "A" "B"` | `select opt in "A" "B"` |
| Confirmation | `gum confirm "Proceed?"` | `read -p "... (y/n) "` |
| Spinner | `gum spin --title "..." -- cmd` | `echo "..."; cmd` |
| Styled text | `gum style --bold --foreground 212` | `echo` (plain) |

If `gum` download fails, the script prints a one-line notice ("Falling back to basic prompts") and continues.

### Script: `setup.sh`

Single entry point with three modes based on detected state.

---

## Flow: Mode Detection

```
setup.sh
  ├── Docker/Docker Compose installed? → No → error + install link
  ├── .env exists?
  │   ├── No  → Fresh Install (quick setup wizard)
  │   └── Yes → Returning User Menu
  └── (gum downloaded? if not, attempt download)
```

---

## Flow: Fresh Install (Quick Setup)

### Welcome Banner
Styled header with project name and brief description of what the wizard will do.

### Step 1: Anthropic API Key
- Masked input (`gum input --password`)
- Validation: must start with `sk-ant-`
- Inline guidance: "Get your key from console.anthropic.com"

### Step 2: Messaging Provider Selection
- Arrow-key menu: "Telegram (recommended)" / "WhatsApp"
- Telegram is the default/highlighted choice (simpler setup)

### Step 3a: Telegram Setup (if selected)
1. Display instructions: "Open Telegram, search for @BotFather, send `/newbot`, follow the prompts"
2. Prompt for bot token — masked input, validate format (digits:alphanumeric)
3. Display instructions: "Search for @userinfobot on Telegram, send `/start`, it will reply with your ID"
4. Prompt for owner ID — validate numeric

### Step 3b: WhatsApp Setup (if selected)
1. Prompt for phone number in international format (e.g., `61412345678`) — validate numeric, minimum 7 digits
2. Auto-construct JID (`<number>@s.whatsapp.net`)
3. Instance name defaults to `youai` (from `.env.example`) — not prompted
4. Note that QR code scanning happens after services start via Evolution API UI at `localhost:8080`

### Step 4: Confirmation
- Display summary of collected configuration
- `gum confirm "Proceed?"` — if yes, continue to Step 5; if no, exit cleanly with a message ("Run ./setup.sh again when you're ready")

### Step 5: Write & Launch
1. Copy `.env.example` → `.env`
2. Auto-generate secrets: Postgres password, Evolution API key (random 16-byte hex)
3. Uncomment commented-out key=value lines (matching pattern `^# [A-Z_]+=`) so they exist as empty values — prevents Docker Compose issues with missing vars. Pure comment lines (e.g., `# Start with: docker compose...`) are left untouched.
4. Write all collected values via portable `sed` (see `.env` Manipulation section)
5. Start Docker services with spinner:
   - Telegram: `docker compose up -d`
   - WhatsApp: `docker compose --profile whatsapp up -d`
6. Display: "Services started! You can run this yourself next time with: `docker compose up -d`"
7. Health check sequence with per-service spinner:
   - Postgres (poll `pg_isready`) → API (poll `/health`) → Evolution API if WhatsApp (poll HTTP 8080)
   - Timeout: 60 seconds per service, then show error with hint to check `docker compose logs <service>`
8. If WhatsApp: remind user to visit `http://localhost:8080` to scan QR code

### Step 6: What's Next?
- Arrow-key menu: "Configure optional integrations" / "Start using your bot"
- "Configure optional integrations" → enters Advanced Config flow
- "Start using your bot" → print final summary with URLs, exit

---

## Flow: Returning User Menu

When `.env` already exists:

```
What would you like to do?
  > Configure optional integrations
    Re-run initial setup
    Start services
    Exit
```

- **Configure optional integrations** → Advanced Config flow
- **Re-run initial setup** → confirm overwrite warning, then: read and save existing advanced config values (OpenAI key, Tavily key, GitHub token, etc.) from current `.env`, re-copy `.env.example`, re-generate secrets, run Fresh Install flow, then re-apply the saved advanced config values
- **Start services** → `docker compose up -d` with health checks
- **Exit** → exit

---

## Flow: Advanced Configuration

Each integration presented one at a time. User can skip any by pressing Enter/selecting "Skip".

### OpenAI API Key
- "Enables semantic search — find contacts by meaning, not just name matching"
- Masked input, validate starts with `sk-`
- `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` already have defaults in `.env.example` — no need to write them

### Tavily API Key
- "Enables web search in briefings and chat conversations"
- Masked input, validate starts with `tvly-`

### GitHub Token
- "Enables GitHub activity tracking in your morning briefings"
- Masked input, validate starts with `ghp_` or `github_pat_`
- Inline instruction: "Create a token at github.com/settings/tokens"

### Alpha Vantage API Key
- "Enables commodities and forex data in briefings"
- Plain text input (no standard prefix to validate)

### Briefing Schedule
- "When should your morning briefing run? (default: 7:00 AM)"
- Simple hour selection menu or cron expression input with default shown
- Show current value if already configured
- `ALERT_CRON` is left at its default (`*/15 * * * *`) — not prompted, as the 15-minute alert interval is appropriate for most users

### Owner Email
- "Your email address — used to filter yourself out of contact imports"
- Plain text input, basic email format validation
- Note: deferring this to Advanced Config is acceptable — contact import is not part of the initial bot startup, and the wizard can be re-run anytime

### Completion
- Each value written to `.env` immediately via `sed` (update existing or append if missing)
- At the end, if services are running (check `docker compose ps`), offer to restart to pick up new config: `docker compose down && docker compose up -d`

---

## `.env` Manipulation

- **Fresh install**: copy `.env.example`, uncomment commented-out key=value lines (matching `^# [A-Z_]+=`, not plain comment lines) so every key exists with at least an empty value, then `sed` to replace placeholder values with collected/generated ones
- **Advanced config / re-run**: if the key exists (commented or uncommented), uncomment it and set the value; if it does not exist at all, append it
- **Portable `sed`**: use `sed -i.bak ... && rm file.bak` pattern, which works on both macOS and Linux (GNU sed). The current codebase uses `sed -i ''` which is macOS-only — this is a fix.
- Auto-generated values: `POSTGRES_PASSWORD`, `EVOLUTION_API_KEY` (random 16-byte hex via `openssl rand -hex 16`)
- `DATABASE_URL` updated to match generated Postgres password

### Interrupt safety
- Write config to a temporary file (`.env.tmp`), then `mv .env.tmp .env` atomically at the end of the wizard. If the user presses Ctrl+C mid-wizard, no partial `.env` is left behind. Trap `SIGINT`/`SIGTERM` to clean up the temp file.

---

## Docker Service Management

### Starting Services
- Detect `MESSAGING_PROVIDER` from `.env`:
  - `telegram` (or unset): `docker compose up -d`
  - `whatsapp`: `docker compose --profile whatsapp up -d`

### Health Checks
- Spinner per service with status feedback
- Use `docker compose ps` to check for "healthy" status (leverages the healthcheck already defined in `docker-compose.yml` for Postgres, and HTTP polls for API/Evolution API)
- Order: Postgres → API → Evolution API (if WhatsApp)
- Timeout: 60 seconds per service
- On timeout: clear error message + hint (`docker compose logs <service>`)

### Restart on Config Change
- After advanced config, check if services are running via `docker compose ps`
- If running, offer to restart: `docker compose down && docker compose up -d`

---

## File Changes

| File | Action | Description |
|---|---|---|
| `setup.sh` | Rewrite | Replace with interactive wizard |
| `.gitignore` | Update | Add `.gum/` entry |
| `.env.example` | No change | Remains the template |
| `docker-compose.yml` | No change | |
| `SETUP-GUIDE.md` | Update | Add note that the interactive wizard now handles initial setup; keep manual/advanced reference content |

---

## Validation Rules

| Field | Rule |
|---|---|
| Anthropic API key | Must start with `sk-ant-` |
| Telegram bot token | Must match `digits:alphanumeric` pattern |
| Telegram owner ID | Must be numeric |
| WhatsApp phone | Must be numeric, minimum 7 digits (international format, no `+`) |
| OpenAI API key | Must start with `sk-` |
| Tavily API key | Must start with `tvly-` |
| GitHub token | Must start with `ghp_` or `github_pat_` |
| Owner email | Must contain `@` |
| Briefing cron | Valid cron expression or hour selection |
