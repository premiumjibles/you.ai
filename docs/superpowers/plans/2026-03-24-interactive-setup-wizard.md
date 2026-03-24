# Interactive Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-pass `setup.sh` with an interactive CLI wizard that uses `gum` for a polished TUI experience, collecting all config through guided prompts.

**Architecture:** Single bash script (`setup.sh`) with helper functions. Downloads `gum` binary to `.gum/` for rich TUI, falls back to plain bash prompts if unavailable. Three modes: fresh install, returning user menu, advanced config. Writes `.env` atomically via temp file.

**Tech Stack:** Bash, Charm's `gum` v0.14.5, `sed`, `openssl`, Docker Compose

**Spec:** `docs/superpowers/specs/2026-03-24-interactive-setup-wizard-design.md` (on branch `docs/add-claude-md`)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `setup.sh` | Rewrite | Interactive wizard — all logic lives here |
| `.gitignore` | Modify | Add `.gum/` entry |
| `SETUP-GUIDE.md` | Modify | Add note about interactive wizard |

No new files are created beyond the rewritten `setup.sh`.

---

## Task 1: Update `.gitignore`

**Files:**
- Modify: `/Users/apotheosis/git/ai-combinator/you.ai/.gitignore`

- [ ] **Step 1: Add `.gum/` to `.gitignore`**

Append `.gum/` to the existing `.gitignore`:

```
.gum/
```

Add it after the existing `n8n-data/` line.

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gum/ to gitignore for setup wizard binary cache"
```

---

## Task 2: Write `setup.sh` — Core infrastructure (gum download, helpers, env manipulation)

**Files:**
- Rewrite: `/Users/apotheosis/git/ai-combinator/you.ai/setup.sh`

This task creates the script skeleton with all utility functions. Subsequent tasks add the flow logic.

- [ ] **Step 1: Write the script header and constants**

```bash
#!/bin/bash
set -euo pipefail

# Constants
GUM_VERSION="0.14.5"
GUM_DIR=".gum"
GUM_BIN=""
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
ENV_TMP=".env.tmp"
```

- [ ] **Step 2: Write the cleanup trap and interrupt handler**

```bash
cleanup() {
  [ -f "$ENV_TMP" ] && rm -f "$ENV_TMP"
}
trap cleanup EXIT INT TERM
```

- [ ] **Step 3: Write the `gum` download function**

Detect OS/arch, download from GitHub releases to `.gum/`, set `GUM_BIN`. If download fails, leave `GUM_BIN` empty (triggers fallback).

```bash
install_gum() {
  if [ -x "$GUM_DIR/gum" ]; then
    GUM_BIN="$GUM_DIR/gum"
    return
  fi

  local os arch
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)
  case "$arch" in
    x86_64)  arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Unsupported architecture: $arch"; return 1 ;;
  esac

  # gum uses "Darwin" and "Linux" (capitalized) in release filenames
  local gum_os
  case "$os" in
    darwin) gum_os="Darwin" ;;
    linux)  gum_os="Linux" ;;
    *) echo "Unsupported OS: $os"; return 1 ;;
  esac

  local url="https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_${gum_os}_${arch}.tar.gz"

  mkdir -p "$GUM_DIR"
  echo "Downloading setup tools..."
  if curl -fsSL "$url" | tar xz -C "$GUM_DIR" --strip-components=1 2>/dev/null; then
    chmod +x "$GUM_DIR/gum"
    GUM_BIN="$GUM_DIR/gum"
  else
    echo "Could not download UI tools — falling back to basic prompts."
  fi
}
```

Note: this extracts the entire tarball contents (gum binary, LICENSE, README, completions) into `.gum/`. Only the binary is needed, but the rest is harmless and `.gum/` is gitignored. This approach avoids platform-specific differences in tar filter path handling between BSD tar (macOS) and GNU tar (Linux).

- [ ] **Step 4: Write TUI wrapper functions with fallback**

Each function checks if `GUM_BIN` is set; if not, falls back to plain bash.

```bash
# Styled header
ui_header() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --bold --foreground 212 --border double --align center --padding "1 4" "$1"
  else
    echo ""
    echo "=== $1 ==="
    echo ""
  fi
}

# Text input (optional --password flag)
ui_input() {
  local placeholder="$1"
  local is_password="${2:-}"

  if [ -n "$GUM_BIN" ]; then
    if [ "$is_password" = "password" ]; then
      "$GUM_BIN" input --password --placeholder "$placeholder"
    else
      "$GUM_BIN" input --placeholder "$placeholder"
    fi
  else
    if [ "$is_password" = "password" ]; then
      read -s -r -p "$placeholder: " val
      echo "" >&2
      echo "$val"
    else
      read -r -p "$placeholder: " val
      echo "$val"
    fi
  fi
}

# Selection menu — returns the selected option
ui_choose() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" choose "$@"
  else
    select opt in "$@"; do
      echo "$opt"
      break
    done
  fi
}

# Confirmation — returns 0 (yes) or 1 (no)
ui_confirm() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" confirm "$1"
  else
    read -r -p "$1 (y/n): " yn
    case "$yn" in
      [Yy]*) return 0 ;;
      *) return 1 ;;
    esac
  fi
}

# Spinner wrapping a command
ui_spin() {
  local title="$1"
  shift
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" spin --spinner dot --title "$title" -- "$@"
  else
    echo "$title"
    "$@"
  fi
}

# Styled info message
ui_info() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --foreground 39 "$1"
  else
    echo "$1"
  fi
}

# Styled success message
ui_success() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --foreground 76 "✓ $1"
  else
    echo "✓ $1"
  fi
}

# Styled error message
ui_error() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --foreground 196 "✗ $1"
  else
    echo "ERROR: $1" >&2
  fi
}
```

- [ ] **Step 5: Write portable `sed` helper**

```bash
# Portable in-place sed (works on macOS and Linux)
# Note: designed for single-file usage only (file must be the last argument)
sedi() {
  local file="${@: -1}"
  sed -i.bak "$@" && rm -f "${file}.bak"
}
```

- [ ] **Step 6: Write `.env` manipulation functions**

```bash
# Set a key=value in .env file. Handles:
# - Existing uncommented key: replace value
# - Existing commented key (# KEY=...): uncomment and set value
# - Missing key: append
env_set() {
  local file="$1" key="$2" value="$3"
  # Escape sed replacement special chars: & \ | /
  local escaped_value
  escaped_value=$(printf '%s\n' "$value" | sed 's/[&\|/\\]/\\&/g')

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # Key exists uncommented — replace value
    sedi "s|^${key}=.*|${key}=${escaped_value}|" "$file"
  elif grep -q "^# *${key}=" "$file" 2>/dev/null; then
    # Key exists but commented — uncomment and set
    sedi "s|^# *${key}=.*|${key}=${escaped_value}|" "$file"
  else
    # Key doesn't exist — append (use raw value, no sed involved)
    echo "${key}=${value}" >> "$file"
  fi
}

# Read a value from .env (returns empty string if not found or commented)
env_get() {
  local file="$1" key="$2"
  grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-
}

# Uncomment all commented key=value lines (^# KEY=) but leave plain comments alone
env_uncomment_keys() {
  local file="$1"
  sedi 's/^# \([A-Z_]\{1,\}=\)/\1/' "$file"
}
```

- [ ] **Step 7: Write the prerequisite check**

```bash
check_prerequisites() {
  command -v docker >/dev/null 2>&1 || {
    ui_error "Docker is required but not installed."
    echo "  Install: https://docs.docker.com/get-docker/"
    exit 1
  }
  command -v docker compose >/dev/null 2>&1 || {
    ui_error "Docker Compose is required but not installed."
    exit 1
  }
}
```

- [ ] **Step 8: Test the script skeleton**

Run the script to verify it loads without errors:
```bash
chmod +x setup.sh
bash -n setup.sh  # syntax check only
```
Expected: no output (clean syntax).

- [ ] **Step 9: Commit**

```bash
git add setup.sh
git commit -m "feat(setup): add script skeleton with gum download and UI helpers"
```

---

## Task 3: Write `setup.sh` — Validation functions

**Files:**
- Modify: `/Users/apotheosis/git/ai-combinator/you.ai/setup.sh`

- [ ] **Step 1: Write input validation functions**

Add after the UI helper functions:

```bash
# Validation helpers — return 0 if valid, 1 if invalid

validate_anthropic_key() {
  [[ "$1" == sk-ant-* ]]
}

validate_telegram_token() {
  # Format: digits:alphanumeric (e.g., 123456789:ABCdefGhIjKlMnOpQrStUvWxYz)
  [[ "$1" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]
}

validate_telegram_owner_id() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

validate_whatsapp_phone() {
  [[ "$1" =~ ^[0-9]{7,}$ ]]
}

validate_openai_key() {
  [[ "$1" == sk-* ]]
}

validate_tavily_key() {
  [[ "$1" == tvly-* ]]
}

validate_github_token() {
  [[ "$1" == ghp_* ]] || [[ "$1" == github_pat_* ]]
}

validate_email() {
  [[ "$1" == *@* ]]
}
```

- [ ] **Step 2: Write a prompt-with-validation loop**

```bash
# Prompt for input with validation. Loops until valid or user skips (if skippable).
# Usage: prompt_validated "prompt text" "password|text" "validator_func" [skippable]
# Returns the validated value via stdout.
prompt_validated() {
  local prompt="$1" input_type="$2" validator="$3" skippable="${4:-}"
  local value

  while true; do
    value=$(ui_input "$prompt" "$input_type")

    # Allow skip if marked as skippable and input is empty
    if [ -n "$skippable" ] && [ -z "$value" ]; then
      echo ""
      return 0
    fi

    if [ -z "$value" ]; then
      ui_error "This field is required."
      continue
    fi

    if $validator "$value"; then
      echo "$value"
      return 0
    else
      ui_error "Invalid format. Please try again."
    fi
  done
}
```

- [ ] **Step 3: Syntax check**

```bash
bash -n setup.sh
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add setup.sh
git commit -m "feat(setup): add input validation functions"
```

---

## Task 4: Write `setup.sh` — Fresh install flow

**Files:**
- Modify: `/Users/apotheosis/git/ai-combinator/you.ai/setup.sh`

- [ ] **Step 1: Write the welcome banner function**

```bash
show_welcome() {
  ui_header "You.ai Setup"
  echo ""
  echo "This wizard will configure your personal AI assistant."
  echo "It takes about 2 minutes. You'll need:"
  echo "  • An Anthropic API key"
  echo "  • A Telegram or WhatsApp account"
  echo ""
}
```

- [ ] **Step 2: Write the Anthropic API key collection**

```bash
collect_anthropic_key() {
  echo ""
  ui_info "Step 1: Anthropic API Key"
  echo "  Get your key from: https://console.anthropic.com → API Keys"
  echo ""
  ANTHROPIC_KEY=$(prompt_validated "Paste your Anthropic API key" "password" "validate_anthropic_key")
}
```

- [ ] **Step 3: Write the messaging provider selection**

```bash
collect_messaging_provider() {
  echo ""
  ui_info "Step 2: Messaging Provider"
  echo "  Choose how you'll chat with your AI assistant."
  echo ""
  MESSAGING_PROVIDER=$(ui_choose "Telegram (recommended)" "WhatsApp")

  case "$MESSAGING_PROVIDER" in
    "Telegram"*) MESSAGING_PROVIDER="telegram" ;;
    "WhatsApp"*) MESSAGING_PROVIDER="whatsapp" ;;
  esac
}
```

- [ ] **Step 4: Write Telegram setup flow**

```bash
collect_telegram() {
  echo ""
  ui_info "Step 3: Telegram Bot Setup"
  echo ""
  echo "  To create a Telegram bot:"
  echo "  1. Open Telegram and search for @BotFather"
  echo "  2. Send /newbot and follow the prompts"
  echo "  3. BotFather will give you a token like: 123456789:ABCdef..."
  echo ""
  TELEGRAM_TOKEN=$(prompt_validated "Paste your bot token" "password" "validate_telegram_token")

  echo ""
  echo "  To find your Telegram user ID:"
  echo "  1. Search for @userinfobot on Telegram"
  echo "  2. Send /start — it will reply with your numeric ID"
  echo ""
  TELEGRAM_OWNER_ID=$(prompt_validated "Enter your Telegram user ID" "text" "validate_telegram_owner_id")
}
```

- [ ] **Step 5: Write WhatsApp setup flow**

```bash
collect_whatsapp() {
  echo ""
  ui_info "Step 3: WhatsApp Setup"
  echo ""
  echo "  Enter your phone number in international format (no + or spaces)."
  echo "  Example: 61412345678 (Australia), 14155551234 (US)"
  echo ""
  WHATSAPP_PHONE=$(prompt_validated "Phone number" "text" "validate_whatsapp_phone")
  WHATSAPP_JID="${WHATSAPP_PHONE}@s.whatsapp.net"

  echo ""
  echo "  After setup, you'll scan a QR code to connect WhatsApp."
  echo "  We'll show you how when services are ready."
  echo ""
}
```

- [ ] **Step 6: Write confirmation and summary**

```bash
show_summary() {
  echo ""
  ui_info "Configuration Summary"
  echo "  Anthropic API Key: ****${ANTHROPIC_KEY: -4}"
  echo "  Messaging: $MESSAGING_PROVIDER"
  if [ "$MESSAGING_PROVIDER" = "telegram" ]; then
    echo "  Bot Token: ****${TELEGRAM_TOKEN: -4}"
    echo "  Owner ID: $TELEGRAM_OWNER_ID"
  else
    echo "  WhatsApp JID: $WHATSAPP_JID"
  fi
  echo ""
}
```

- [ ] **Step 7: Write the env file creation function**

```bash
write_env() {
  # Copy template to temp file
  cp "$ENV_EXAMPLE" "$ENV_TMP"

  # Auto-generate secrets
  local pg_pass evo_key
  pg_pass=$(openssl rand -hex 16)
  evo_key=$(openssl rand -hex 16)

  # Uncomment all commented key=value lines
  env_uncomment_keys "$ENV_TMP"

  # Core config
  env_set "$ENV_TMP" "ANTHROPIC_API_KEY" "$ANTHROPIC_KEY"
  env_set "$ENV_TMP" "MESSAGING_PROVIDER" "$MESSAGING_PROVIDER"

  # Secrets
  env_set "$ENV_TMP" "POSTGRES_PASSWORD" "$pg_pass"
  env_set "$ENV_TMP" "DATABASE_URL" "postgresql://youai:${pg_pass}@postgres:5432/youai"
  env_set "$ENV_TMP" "EVOLUTION_API_KEY" "$evo_key"

  # Provider-specific
  if [ "$MESSAGING_PROVIDER" = "telegram" ]; then
    env_set "$ENV_TMP" "TELEGRAM_BOT_TOKEN" "$TELEGRAM_TOKEN"
    env_set "$ENV_TMP" "TELEGRAM_OWNER_ID" "$TELEGRAM_OWNER_ID"
  else
    env_set "$ENV_TMP" "WHATSAPP_OWNER_JID" "$WHATSAPP_JID"
  fi

  # Atomic write
  mv "$ENV_TMP" "$ENV_FILE"
}
```

- [ ] **Step 8: Write the Docker launch and health check functions**

```bash
start_services() {
  local compose_cmd=(docker compose up -d)
  local compose_hint="docker compose up -d"
  if [ "$MESSAGING_PROVIDER" = "whatsapp" ]; then
    compose_cmd=(docker compose --profile whatsapp up -d)
    compose_hint="docker compose --profile whatsapp up -d"
  fi

  echo ""
  ui_spin "Starting services..." "${compose_cmd[@]}"
  echo ""
  echo "  Next time, start services with: $compose_hint"
  echo ""
}

wait_for_services() {
  local timeout=60
  local elapsed=0

  # Postgres
  echo -n "  Waiting for Postgres..."
  while ! docker compose exec postgres pg_isready -U youai > /dev/null 2>&1; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ $elapsed -ge $timeout ]; then
      echo ""
      ui_error "Postgres did not become ready in ${timeout}s."
      echo "  Check logs: docker compose logs postgres"
      return 1
    fi
  done
  ui_success "Postgres ready"

  # API
  elapsed=0
  echo -n "  Waiting for API..."
  while ! curl -sf http://localhost:3000/health > /dev/null 2>&1; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ $elapsed -ge $timeout ]; then
      echo ""
      ui_error "API did not become ready in ${timeout}s."
      echo "  Check logs: docker compose logs api"
      return 1
    fi
  done
  ui_success "API ready (http://localhost:3000)"

  # Evolution API (WhatsApp only)
  if [ "${MESSAGING_PROVIDER:-telegram}" = "whatsapp" ]; then
    elapsed=0
    echo -n "  Waiting for Evolution API..."
    while ! curl -sf http://localhost:8080/ > /dev/null 2>&1; do
      sleep 2
      elapsed=$((elapsed + 2))
      if [ $elapsed -ge $timeout ]; then
        echo ""
        ui_error "Evolution API did not become ready in ${timeout}s."
        echo "  Check logs: docker compose logs evolution-api"
        return 1
      fi
    done
    ui_success "Evolution API ready (http://localhost:8080)"
  fi
}
```

- [ ] **Step 9: Write the post-setup "what's next" prompt**

```bash
show_whats_next() {
  echo ""
  if [ "${MESSAGING_PROVIDER:-telegram}" = "whatsapp" ]; then
    ui_info "WhatsApp: Connect your phone"
    echo "  1. Open http://localhost:8080 in your browser"
    echo "  2. Log in with your Evolution API key"
    echo "  3. Create an instance and scan the QR code with your phone"
    echo "  See SETUP-GUIDE.md for detailed WhatsApp setup instructions."
    echo ""
  fi

  ui_info "Setup complete! What would you like to do next?"
  echo ""
  local choice
  choice=$(ui_choose "Configure optional integrations" "Start using your bot")

  case "$choice" in
    "Configure"*) advanced_config ;;
    *)
      echo ""
      ui_success "You're all set! Send a message to your bot to get started."
      ;;
  esac
}
```

- [ ] **Step 10: Wire together the fresh install flow**

```bash
# Collect config and write .env — no service launch. Used by both fresh_install and rerun_setup.
collect_and_write_config() {
  show_welcome
  collect_anthropic_key
  collect_messaging_provider

  if [ "$MESSAGING_PROVIDER" = "telegram" ]; then
    collect_telegram
  else
    collect_whatsapp
  fi

  show_summary

  if ! ui_confirm "Proceed with this configuration?"; then
    echo ""
    echo "No changes made. Run ./setup.sh again when you're ready."
    exit 0
  fi

  write_env
  ui_success "Configuration saved"
}

fresh_install() {
  collect_and_write_config
  start_services
  wait_for_services
  show_whats_next
}
```

- [ ] **Step 11: Syntax check**

```bash
bash -n setup.sh
```
Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add setup.sh
git commit -m "feat(setup): implement fresh install wizard flow"
```

---

## Task 5: Write `setup.sh` — Advanced configuration flow

**Files:**
- Modify: `/Users/apotheosis/git/ai-combinator/you.ai/setup.sh`

- [ ] **Step 1: Write the advanced config function**

```bash
advanced_config() {
  echo ""
  ui_header "Optional Integrations"
  echo "  Press Enter to skip any integration you don't need."
  echo ""

  # OpenAI
  ui_info "OpenAI API Key"
  echo "  Enables semantic search — find contacts by meaning, not just name matching."
  echo "  Get a key from: https://platform.openai.com/api-keys"
  echo ""
  local openai_key
  openai_key=$(prompt_validated "OpenAI API key (Enter to skip)" "password" "validate_openai_key" "skippable")
  if [ -n "$openai_key" ]; then
    env_set "$ENV_FILE" "OPENAI_API_KEY" "$openai_key"
    ui_success "OpenAI API key saved"
  fi
  echo ""

  # Tavily
  ui_info "Tavily Search API Key"
  echo "  Enables web search in briefings and chat conversations."
  echo "  Get a key from: https://tavily.com"
  echo ""
  local tavily_key
  tavily_key=$(prompt_validated "Tavily API key (Enter to skip)" "password" "validate_tavily_key" "skippable")
  if [ -n "$tavily_key" ]; then
    env_set "$ENV_FILE" "TAVILY_API_KEY" "$tavily_key"
    ui_success "Tavily API key saved"
  fi
  echo ""

  # GitHub
  ui_info "GitHub Token"
  echo "  Enables GitHub activity tracking in your morning briefings."
  echo "  Create a token at: https://github.com/settings/tokens"
  echo ""
  local github_token
  github_token=$(prompt_validated "GitHub token (Enter to skip)" "password" "validate_github_token" "skippable")
  if [ -n "$github_token" ]; then
    env_set "$ENV_FILE" "GITHUB_TOKEN" "$github_token"
    ui_success "GitHub token saved"
  fi
  echo ""

  # Alpha Vantage
  ui_info "Alpha Vantage API Key"
  echo "  Enables commodities and forex data in briefings."
  echo "  Get a free key from: https://www.alphavantage.co/support/#api-key"
  echo ""
  local av_key
  av_key=$(ui_input "Alpha Vantage API key (Enter to skip)")
  if [ -n "$av_key" ]; then
    env_set "$ENV_FILE" "ALPHA_VANTAGE_API_KEY" "$av_key"
    ui_success "Alpha Vantage API key saved"
  fi
  echo ""

  # Briefing schedule
  ui_info "Briefing Schedule"
  local current_cron
  current_cron=$(env_get "$ENV_FILE" "BRIEFING_CRON")
  current_cron="${current_cron:-0 7 * * *}"
  echo "  When should your morning briefing run?"
  echo "  Current: $current_cron"
  echo ""
  local hour
  hour=$(ui_choose "6:00 AM" "7:00 AM (default)" "8:00 AM" "9:00 AM" "Custom cron expression" "Skip")
  case "$hour" in
    "6:00"*) env_set "$ENV_FILE" "BRIEFING_CRON" "0 6 * * *" ;;
    "7:00"*) env_set "$ENV_FILE" "BRIEFING_CRON" "0 7 * * *" ;;
    "8:00"*) env_set "$ENV_FILE" "BRIEFING_CRON" "0 8 * * *" ;;
    "9:00"*) env_set "$ENV_FILE" "BRIEFING_CRON" "0 9 * * *" ;;
    "Custom"*)
      local cron_expr
      cron_expr=$(ui_input "Cron expression (e.g., 0 7 * * *)")
      if [ -n "$cron_expr" ]; then
        env_set "$ENV_FILE" "BRIEFING_CRON" "$cron_expr"
      fi
      ;;
    *) ;; # Skip
  esac
  echo ""

  # Owner email
  ui_info "Owner Email"
  echo "  Your email — used to filter yourself out of contact imports."
  echo ""
  local owner_email
  owner_email=$(prompt_validated "Email address (Enter to skip)" "text" "validate_email" "skippable")
  if [ -n "$owner_email" ]; then
    env_set "$ENV_FILE" "OWNER_EMAIL" "$owner_email"
    ui_success "Owner email saved"
  fi

  # Offer restart if services are running
  echo ""
  if docker compose ps --status running --quiet 2>/dev/null | grep -q .; then
    if ui_confirm "Services are running. Restart to apply changes?"; then
      local provider
      provider=$(env_get "$ENV_FILE" "MESSAGING_PROVIDER")
      MESSAGING_PROVIDER="${provider:-telegram}"
      ui_spin "Stopping services..." docker compose down
      start_services
      wait_for_services
    fi
  fi

  echo ""
  ui_success "Advanced configuration complete!"
}
```

- [ ] **Step 2: Syntax check**

```bash
bash -n setup.sh
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add setup.sh
git commit -m "feat(setup): implement advanced configuration flow"
```

---

## Task 6: Write `setup.sh` — Returning user menu and re-run logic

**Files:**
- Modify: `/Users/apotheosis/git/ai-combinator/you.ai/setup.sh`

- [ ] **Step 1: Write the returning user menu**

```bash
returning_user_menu() {
  ui_header "You.ai Setup"
  echo ""
  echo "  Existing configuration detected."
  echo ""

  local choice
  choice=$(ui_choose "Configure optional integrations" "Re-run initial setup" "Start services" "Exit")

  case "$choice" in
    "Configure"*)
      advanced_config
      ;;
    "Re-run"*)
      rerun_setup
      ;;
    "Start"*)
      local provider
      provider=$(env_get "$ENV_FILE" "MESSAGING_PROVIDER")
      MESSAGING_PROVIDER="${provider:-telegram}"
      start_services
      wait_for_services
      echo ""
      ui_success "Services are running!"
      ;;
    *)
      echo "Bye!"
      exit 0
      ;;
  esac
}
```

- [ ] **Step 2: Write the re-run setup function**

Preserves advanced config values, re-runs fresh install, then restores them.

```bash
rerun_setup() {
  echo ""
  ui_info "This will reconfigure your core settings (API key, messaging provider)."
  echo "  Your optional integrations (OpenAI, Tavily, GitHub, etc.) will be preserved."
  echo ""

  if ! ui_confirm "Continue?"; then
    echo "Cancelled."
    return
  fi

  # Save advanced config values from existing .env
  local saved_openai saved_tavily saved_github saved_av saved_email saved_cron
  saved_openai=$(env_get "$ENV_FILE" "OPENAI_API_KEY")
  saved_tavily=$(env_get "$ENV_FILE" "TAVILY_API_KEY")
  saved_github=$(env_get "$ENV_FILE" "GITHUB_TOKEN")
  saved_av=$(env_get "$ENV_FILE" "ALPHA_VANTAGE_API_KEY")
  saved_email=$(env_get "$ENV_FILE" "OWNER_EMAIL")
  saved_cron=$(env_get "$ENV_FILE" "BRIEFING_CRON")

  # Remove existing .env so collect_and_write_config treats it as new
  rm -f "$ENV_FILE"

  # Collect new core config and write .env (no service launch yet)
  collect_and_write_config

  # Restore saved advanced config BEFORE starting services
  [ -n "$saved_openai" ] && env_set "$ENV_FILE" "OPENAI_API_KEY" "$saved_openai"
  [ -n "$saved_tavily" ] && env_set "$ENV_FILE" "TAVILY_API_KEY" "$saved_tavily"
  [ -n "$saved_github" ] && env_set "$ENV_FILE" "GITHUB_TOKEN" "$saved_github"
  [ -n "$saved_av" ] && env_set "$ENV_FILE" "ALPHA_VANTAGE_API_KEY" "$saved_av"
  [ -n "$saved_email" ] && env_set "$ENV_FILE" "OWNER_EMAIL" "$saved_email"
  [ -n "$saved_cron" ] && env_set "$ENV_FILE" "BRIEFING_CRON" "$saved_cron"

  # Now start services with full config applied
  start_services
  wait_for_services
  show_whats_next
}
```

- [ ] **Step 3: Syntax check**

```bash
bash -n setup.sh
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add setup.sh
git commit -m "feat(setup): implement returning user menu and re-run logic"
```

---

## Task 7: Write `setup.sh` — Main entry point and mode detection

**Files:**
- Modify: `/Users/apotheosis/git/ai-combinator/you.ai/setup.sh`

- [ ] **Step 1: Write the main function at the bottom of the script**

```bash
main() {
  check_prerequisites
  install_gum

  if [ -f "$ENV_FILE" ]; then
    returning_user_menu
  else
    fresh_install
  fi
}

main "$@"
```

- [ ] **Step 2: Syntax check**

```bash
bash -n setup.sh
```
Expected: no output.

- [ ] **Step 3: Manual smoke test — fresh install**

Delete `.env` if it exists, then run the wizard:
```bash
rm -f .env
./setup.sh
```

Walk through the fresh install flow:
1. Verify `gum` downloads (or falls back)
2. Enter an Anthropic key (can be fake for testing: `sk-ant-test123`)
3. Choose Telegram
4. Enter a fake token (e.g., `123456:ABCtest`)
5. Enter a fake owner ID (e.g., `999999`)
6. Confirm → verify `.env` is written correctly
7. Docker services will attempt to start (expected to fail with fake keys — that's fine for a smoke test)

Verify `.env` contents:
```bash
cat .env
```
Expected: all keys uncommented, fake values in place, auto-generated Postgres password and Evolution API key.

- [ ] **Step 4: Manual smoke test — returning user menu**

Re-run with existing `.env`:
```bash
./setup.sh
```
Expected: shows "Existing configuration detected" with the 4-option menu.

- [ ] **Step 5: Commit**

```bash
git add setup.sh
git commit -m "feat(setup): add main entry point and mode detection"
```

---

## Task 8: Update `SETUP-GUIDE.md`

**Files:**
- Modify: `/Users/apotheosis/git/ai-combinator/you.ai/SETUP-GUIDE.md`

- [ ] **Step 1: Update Steps 3-5 to reflect the interactive wizard**

Replace the current Steps 3, 4, and 5 (which describe the two-pass manual setup) with:

```markdown
## Step 3: Run setup

```bash
./setup.sh
```

The interactive wizard will guide you through:
1. Entering your Anthropic API key
2. Choosing a messaging provider (Telegram or WhatsApp)
3. Configuring your messaging credentials

The wizard walks you through obtaining each credential — no prior setup needed.

After configuration, services start automatically. You can start them manually next time with:

```bash
docker compose up -d
# or for WhatsApp:
docker compose --profile whatsapp up -d
```

### Optional integrations

After initial setup, run `./setup.sh` again to configure optional integrations:
- **OpenAI** — semantic contact search
- **Tavily** — web search in briefings and chat
- **GitHub** — activity tracking in briefings
- **Alpha Vantage** — commodities and forex data
- **Briefing schedule** — customize when your morning briefing runs
```

Remove the old Step 4 ("Add your Anthropic key") and Step 5 ("Start services") since they are now handled by the wizard. Renumber subsequent steps.

- [ ] **Step 2: Commit**

```bash
git add SETUP-GUIDE.md
git commit -m "docs: update SETUP-GUIDE.md to reflect interactive wizard"
```

---

## Task 9: End-to-end manual test

**Files:** None (testing only)

- [ ] **Step 1: Clean slate test**

```bash
rm -f .env
rm -rf .gum/
./setup.sh
```

Verify:
1. `gum` downloads successfully
2. Welcome banner displays with styling
3. Anthropic key prompt accepts input with masking
4. Provider selection shows arrow-key menu
5. Telegram/WhatsApp flow collects credentials
6. Summary displays correctly (key masked except last 4 chars)
7. Confirmation works
8. `.env` is written with correct values
9. Docker services start (or fail gracefully with test credentials)

- [ ] **Step 2: Returning user test**

```bash
./setup.sh
```

Verify:
1. Detects existing `.env`
2. Shows 4-option menu
3. "Configure optional integrations" enters advanced flow
4. Each integration is skippable
5. "Re-run initial setup" preserves advanced values

- [ ] **Step 3: Fallback test**

```bash
rm -rf .gum/
# Temporarily break gum download by setting wrong version
# (or test on a machine without network)
./setup.sh
```

Verify: falls back to plain `read` prompts without errors.

- [ ] **Step 4: Commit final state if any adjustments were made**

```bash
git add -A
git commit -m "fix(setup): adjustments from end-to-end testing"
```
