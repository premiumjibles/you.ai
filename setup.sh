#!/bin/bash
set -euo pipefail

# Constants
GUM_VERSION="0.17.0"
GUM_DIR=".gum"
GUM_BIN=""
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
ENV_TMP=".env.tmp"

# ---------------------------------------------------------------------------
# Cleanup trap and interrupt handler
# ---------------------------------------------------------------------------

cleanup() {
  [ -f "$ENV_TMP" ] && rm -f "$ENV_TMP"
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

# ---------------------------------------------------------------------------
# gum download function
# ---------------------------------------------------------------------------

install_gum() {
  if [ -x "$GUM_DIR/gum" ]; then
    GUM_BIN="$GUM_DIR/gum"
    return
  fi

  local os arch
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)
  case "$arch" in
    x86_64)  arch="x86_64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Unsupported architecture: $arch — falling back to basic prompts."; return 0 ;;
  esac

  local gum_os
  case "$os" in
    darwin) gum_os="Darwin" ;;
    linux)  gum_os="Linux" ;;
    *) echo "Unsupported OS: $os — falling back to basic prompts."; return 0 ;;
  esac

  local url="https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_${gum_os}_${arch}.tar.gz"

  mkdir -p "$GUM_DIR"
  echo "Downloading setup tools..."
  if curl -fsSL --connect-timeout 10 --max-time 30 "$url" | tar xz -C "$GUM_DIR" --strip-components=1 2>/dev/null; then
    chmod +x "$GUM_DIR/gum"
    GUM_BIN="$GUM_DIR/gum"
  else
    echo "Could not download UI tools — falling back to basic prompts."
  fi
}

# ---------------------------------------------------------------------------
# TUI wrapper functions with fallback
# ---------------------------------------------------------------------------

# Exit on signal-kill exit codes (e.g. 130 from Ctrl+C).
# Called after every gum invocation to propagate interrupts through subshells.
gum_check_interrupt() {
  if [ $1 -ge 128 ]; then kill -INT $$ 2>/dev/null; exit 130; fi
}

ui_header() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --bold --foreground 212 --border double --align center --padding "1 4" "$1"
  else
    echo ""
    echo "=== $1 ==="
    echo ""
  fi
}

ui_input() {
  local placeholder="$1"
  local is_password="${2:-}"
  local rc=0

  if [ -n "$GUM_BIN" ]; then
    if [ "$is_password" = "password" ]; then
      "$GUM_BIN" input --password --placeholder "$placeholder" || rc=$?
    else
      "$GUM_BIN" input --placeholder "$placeholder" || rc=$?
    fi
    gum_check_interrupt $rc
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

ui_choose() {
  if [ -n "$GUM_BIN" ]; then
    local rc=0
    "$GUM_BIN" choose "$@" || rc=$?
    gum_check_interrupt $rc
    return $rc
  else
    select opt in "$@"; do
      if [ -n "$opt" ]; then
        echo "$opt"
        break
      fi
    done
  fi
}

ui_choose_default() {
  local default_val="$1"
  shift
  if [ -n "$GUM_BIN" ]; then
    local rc=0
    "$GUM_BIN" choose --selected "$default_val" "$@" || rc=$?
    gum_check_interrupt $rc
    return $rc
  else
    select opt in "$@"; do
      if [ -n "$opt" ]; then
        echo "$opt"
        break
      fi
    done
  fi
}

ui_confirm() {
  local default="${2:-yes}"
  if [ -n "$GUM_BIN" ]; then
    local rc=0
    if [ "$default" = "no" ]; then
      "$GUM_BIN" confirm --default=no "$1" || rc=$?
    else
      "$GUM_BIN" confirm "$1" || rc=$?
    fi
    gum_check_interrupt $rc
    return $rc
  else
    local hint="(y/n)"
    [ "$default" = "no" ] && hint="(y/N)"
    read -r -p "$1 $hint: " yn
    case "$yn" in
      [Yy]*) return 0 ;;
      *) return 1 ;;
    esac
  fi
}

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

ui_info() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --foreground 39 "$1"
  else
    echo "$1"
  fi
}

ui_info_configured() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" join --horizontal \
      "$("$GUM_BIN" style --foreground 39 "$1  ")" \
      "$("$GUM_BIN" style --foreground 76 "✓ configured")"
  else
    echo "$1  ✓ configured"
  fi
}

ui_success() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --foreground 76 "✓ $1"
  else
    echo "✓ $1"
  fi
}

ui_error() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" style --foreground 196 "✗ $1"
  else
    echo "ERROR: $1" >&2
  fi
}

# ---------------------------------------------------------------------------
# Portable sed helper
# ---------------------------------------------------------------------------

# Portable in-place sed (works on macOS and Linux)
# Note: designed for single-file usage only (file must be the last argument)
sedi() {
  local file="${@: -1}"
  sed -i.bak "$@" && rm -f "${file}.bak"
}

# ---------------------------------------------------------------------------
# .env manipulation functions
# ---------------------------------------------------------------------------

# Set a key=value in .env file. Handles:
# - Existing uncommented key: replace value
# - Existing commented key (# KEY=...): uncomment and set value
# - Missing key: append
env_set() {
  local file="$1" key="$2" value="$3"
  # Escape sed replacement special chars: & \ | /
  local escaped_value
  escaped_value=$(printf '%s\n' "$value" | sed 's/[&|\\]/\\&/g')

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sedi "s|^${key}=.*|${key}=${escaped_value}|" "$file"
  elif grep -q "^# *${key}=" "$file" 2>/dev/null; then
    sedi "s|^# *${key}=.*|${key}=${escaped_value}|" "$file"
  else
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
  sedi 's/^# *\([A-Z_]\{1,\}=\)/\1/' "$file"
}

# ---------------------------------------------------------------------------
# Prerequisite check
# ---------------------------------------------------------------------------

check_prerequisites() {
  command -v docker >/dev/null 2>&1 || {
    ui_error "Docker is required but not installed."
    echo "  Install: https://docs.docker.com/get-docker/"
    exit 1
  }
  docker compose version >/dev/null 2>&1 || {
    ui_error "Docker Compose is required but not installed."
    exit 1
  }
}

# ---------------------------------------------------------------------------
# Input validation functions
# ---------------------------------------------------------------------------

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

validate_github_token() {
  [[ "$1" == ghp_* ]] || [[ "$1" == github_pat_* ]]
}

validate_email() {
  [[ "$1" == *@* ]]
}

# ---------------------------------------------------------------------------
# Prompt with validation
# ---------------------------------------------------------------------------

# Prompt for input with validation. Loops until valid or user skips (if skippable).
# Usage: prompt_validated "prompt text" "password|text" "validator_func" [skippable]
# Sets PROMPT_RESULT with the validated value (empty string if skipped).
PROMPT_RESULT=""
prompt_validated() {
  local prompt="$1" input_type="$2" validator="$3" skippable="${4:-}"
  PROMPT_RESULT=""

  while true; do
    local value
    value=$(ui_input "$prompt" "$input_type")

    # Allow skip if marked as skippable and input is empty
    if [ -n "$skippable" ] && [ -z "$value" ]; then
      return 0
    fi

    if [ -z "$value" ]; then
      ui_error "This field is required."
      continue
    fi

    if $validator "$value"; then
      PROMPT_RESULT="$value"
      return 0
    else
      ui_error "Invalid format. Please try again."
    fi
  done
}

# ---------------------------------------------------------------------------
# Fresh install wizard flow
# ---------------------------------------------------------------------------

show_welcome() {
  ui_header "You.ai Setup"
  echo ""
  echo "This wizard will configure your personal AI assistant."
  echo "It takes about 2 minutes. You'll need:"
  echo "  • An Anthropic API key"
  echo "  • A Telegram or WhatsApp account"
  echo ""
}

collect_anthropic_key() {
  echo ""
  ui_info "Step 1: Anthropic API Key"
  echo "  Get your key from: https://console.anthropic.com → API Keys"
  echo ""
  prompt_validated "Paste your Anthropic API key" "password" "validate_anthropic_key"
  ANTHROPIC_KEY="$PROMPT_RESULT"
}

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

collect_telegram() {
  echo ""
  ui_info "Step 3: Telegram Bot Setup"
  echo ""
  echo "  To create a Telegram bot:"
  echo "  1. Open Telegram and search for @BotFather"
  echo "  2. Send /newbot and follow the prompts"
  echo "  3. BotFather will give you a token like: 123456789:ABCdef..."
  echo ""
  prompt_validated "Paste your bot token" "password" "validate_telegram_token"
  TELEGRAM_TOKEN="$PROMPT_RESULT"

  echo ""
  echo "  To find your Telegram user ID:"
  echo "  1. Search for @idbot on Telegram"
  echo "  2. Send /getid — it will reply with your numeric ID"
  echo ""
  prompt_validated "Enter your Telegram user ID" "text" "validate_telegram_owner_id"
  TELEGRAM_OWNER_ID="$PROMPT_RESULT"
}

collect_whatsapp() {
  echo ""
  ui_info "Step 3: WhatsApp Setup"
  echo ""
  echo "  Enter your phone number in international format (no + or spaces)."
  echo "  Example: 61412345678 (Australia), 14155551234 (US)"
  echo ""
  prompt_validated "Phone number" "text" "validate_whatsapp_phone"
  WHATSAPP_PHONE="$PROMPT_RESULT"
  WHATSAPP_JID="${WHATSAPP_PHONE}@s.whatsapp.net"

  echo ""
  echo "  After setup, you'll scan a QR code to connect WhatsApp."
  echo "  We'll show you how when services are ready."
  echo ""
}

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

write_env() {
  # Copy template to temp file
  cp "$ENV_EXAMPLE" "$ENV_TMP"

  # Reuse existing secrets if present (avoids DB auth mismatch with existing volume)
  local pg_pass evo_key
  pg_pass=$(env_get "$ENV_FILE" "POSTGRES_PASSWORD" 2>/dev/null)
  evo_key=$(env_get "$ENV_FILE" "EVOLUTION_API_KEY" 2>/dev/null)
  [ -z "$pg_pass" ] && pg_pass=$(openssl rand -hex 16)
  [ -z "$evo_key" ] && evo_key=$(openssl rand -hex 16)

  # Uncomment all commented key=value lines
  env_uncomment_keys "$ENV_TMP"

  # Clear optional keys so they don't retain placeholder values from .env.example
  env_set "$ENV_TMP" "OPENAI_API_KEY" ""
  env_set "$ENV_TMP" "GITHUB_TOKEN" ""
  env_set "$ENV_TMP" "ALPHA_VANTAGE_API_KEY" ""

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

# Find an available port starting from a given port
find_available_port() {
  local port="$1"
  while lsof -i :"$port" >/dev/null 2>&1 || ss -tln 2>/dev/null | grep -q ":${port} " 2>/dev/null; do
    port=$((port + 1))
  done
  echo "$port"
}

start_services() {
  # Stop any existing services first to free ports
  if docker compose ps --quiet 2>/dev/null | grep -q .; then
    ui_info "Stopping existing services..."
    docker compose down >/dev/null 2>&1 || true
  fi

  # Reset API_PORT to default before checking availability
  env_set "$ENV_FILE" "API_PORT" "3000"
  local api_port="3000"

  local available_port
  available_port=$(find_available_port "$api_port")

  if [ "$available_port" != "$api_port" ]; then
    ui_info "Port $api_port is in use, using port $available_port instead."
    env_set "$ENV_FILE" "API_PORT" "$available_port"
    api_port="$available_port"
  fi

  local compose_cmd=(docker compose up -d --build)
  local compose_hint="docker compose up -d --build"
  if [ "$MESSAGING_PROVIDER" = "whatsapp" ]; then
    compose_cmd=(docker compose --profile whatsapp up -d --build)
    compose_hint="docker compose --profile whatsapp up -d --build"
  fi

  echo ""
  ui_info "Starting services..."
  if ! "${compose_cmd[@]}" 2>&1; then
    echo ""
    ui_error "Failed to start services."
    echo "  Check Docker is running: docker info"
    echo "  Check logs: docker compose logs"
    echo ""
    echo "  You can try starting manually with: $compose_hint"
    return 1
  fi
  echo ""
  echo "  Next time, start services with: $compose_hint"
  echo ""
}

wait_for_services() {
  local timeout=60
  local elapsed=0
  local api_port
  api_port=$(env_get "$ENV_FILE" "API_PORT")
  api_port="${api_port:-3000}"

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
  while ! curl -sf "http://localhost:${api_port}/health" > /dev/null 2>&1; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ $elapsed -ge $timeout ]; then
      echo ""
      ui_error "API did not become ready in ${timeout}s."
      echo "  Check logs: docker compose logs api"
      return 1
    fi
  done
  ui_success "API ready (http://localhost:${api_port})"

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
  choice=$(ui_choose "Import your data" "Configure optional integrations" "Start using your bot")

  case "$choice" in
    "Import"*) import_data ;;
    "Configure"*) advanced_config ;;
    *)
      echo ""
      ui_success "You're all set! Send a message to your bot to get started."
      ;;
  esac
}

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
    return 1
  fi

  write_env
  ui_success "Configuration saved"
}

fresh_install() {
  if ! collect_and_write_config; then
    return 0
  fi

  if ! start_services; then
    return 1
  fi

  if ! wait_for_services; then
    echo ""
    echo "  Your configuration is saved. You can retry with: docker compose up -d"
    return 1
  fi

  show_whats_next
}

advanced_config() {
  echo ""
  ui_header "Optional Integrations"
  echo "  Press Enter to skip any integration you don't need."
  echo ""

  # OpenAI
  local existing_openai
  existing_openai=$(env_get "$ENV_FILE" "OPENAI_API_KEY")
  if [ -n "$existing_openai" ]; then
    ui_info_configured "OpenAI API Key"
  else
    ui_info "OpenAI API Key"
  fi
  echo "  Enables semantic search — find contacts by meaning, not just name matching."
  echo "  Get a key from: https://platform.openai.com/api-keys"
  echo ""
  local openai_prompt="OpenAI API key (Enter to skip)"
  [ -n "$existing_openai" ] && openai_prompt="OpenAI API key (Enter to keep current)"
  local openai_key
  prompt_validated "$openai_prompt" "password" "validate_openai_key" "skippable"
  openai_key="$PROMPT_RESULT"
  if [ -n "$openai_key" ]; then
    env_set "$ENV_FILE" "OPENAI_API_KEY" "$openai_key"
    ui_success "OpenAI API key saved"
  fi
  echo ""

  # GitHub
  local existing_github
  existing_github=$(env_get "$ENV_FILE" "GITHUB_TOKEN")
  if [ -n "$existing_github" ]; then
    ui_info_configured "GitHub Token"
  else
    ui_info "GitHub Token"
  fi
  echo "  Enables GitHub activity tracking in your morning briefings."
  echo "  Create a token at: https://github.com/settings/tokens"
  echo ""
  local github_prompt="GitHub token (Enter to skip)"
  [ -n "$existing_github" ] && github_prompt="GitHub token (Enter to keep current)"
  local github_token
  prompt_validated "$github_prompt" "password" "validate_github_token" "skippable"
  github_token="$PROMPT_RESULT"
  if [ -n "$github_token" ]; then
    env_set "$ENV_FILE" "GITHUB_TOKEN" "$github_token"
    ui_success "GitHub token saved"
  fi
  echo ""

  # Alpha Vantage
  local existing_av
  existing_av=$(env_get "$ENV_FILE" "ALPHA_VANTAGE_API_KEY")
  if [ -n "$existing_av" ]; then
    ui_info_configured "Alpha Vantage API Key"
  else
    ui_info "Alpha Vantage API Key"
  fi
  echo "  Enables commodities and forex data in briefings."
  echo "  Get a free key from: https://www.alphavantage.co/support/#api-key"
  echo ""
  local av_prompt="Alpha Vantage API key (Enter to skip)"
  [ -n "$existing_av" ] && av_prompt="Alpha Vantage API key (Enter to keep current)"
  local av_key
  av_key=$(ui_input "$av_prompt")
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
  local hour schedule_default
  case "$current_cron" in
    "0 6 * * *") schedule_default="6:00 AM" ;;
    "0 7 * * *") schedule_default="7:00 AM (default)" ;;
    "0 8 * * *") schedule_default="8:00 AM" ;;
    "0 9 * * *") schedule_default="9:00 AM" ;;
    *)           schedule_default="Custom cron expression" ;;
  esac
  hour=$(ui_choose_default "$schedule_default" "6:00 AM" "7:00 AM (default)" "8:00 AM" "9:00 AM" "Custom cron expression" "Skip")
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
  local existing_email
  existing_email=$(env_get "$ENV_FILE" "OWNER_EMAIL")
  if [ -n "$existing_email" ]; then
    ui_info_configured "Owner Email"
    echo "  Current: $existing_email"
  else
    ui_info "Owner Email"
  fi
  echo "  Your email — used to filter yourself out of contact imports."
  echo ""
  local email_prompt="Email address (Enter to skip)"
  [ -n "$existing_email" ] && email_prompt="Email address (Enter to keep current)"
  local owner_email
  prompt_validated "$email_prompt" "text" "validate_email" "skippable"
  owner_email="$PROMPT_RESULT"
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

# ---------------------------------------------------------------------------
# Import data wizard
# ---------------------------------------------------------------------------

# Resolve API base URL from .env
get_api_url() {
  local api_port
  api_port=$(env_get "$ENV_FILE" "API_PORT")
  api_port="${api_port:-3000}"
  echo "http://localhost:${api_port}"
}

# Check the API is reachable, offer to start services if not
ensure_api_running() {
  local api_url
  api_url=$(get_api_url)
  if curl -sf "${api_url}/health" > /dev/null 2>&1; then
    return 0
  fi

  echo ""
  ui_error "API is not running at ${api_url}"
  if ui_confirm "Start services now?"; then
    local provider
    provider=$(env_get "$ENV_FILE" "MESSAGING_PROVIDER")
    MESSAGING_PROVIDER="${provider:-telegram}"
    if ! start_services || ! wait_for_services; then
      ui_error "Could not start services. Run 'docker compose up -d' and try again."
      return 1
    fi
  else
    echo "  Start services first: docker compose up -d"
    return 1
  fi
}

# Ensure OWNER_EMAIL is set (critical for filtering yourself out of imports)
ensure_owner_email() {
  local existing_email
  existing_email=$(env_get "$ENV_FILE" "OWNER_EMAIL")
  if [ -n "$existing_email" ]; then
    ui_info "Owner email: $existing_email"
    if ! ui_confirm "Is this correct?"; then
      existing_email=""
    fi
  fi

  if [ -z "$existing_email" ]; then
    echo ""
    ui_info "Your email address"
    echo "  This filters you out of contact imports — without it, every email"
    echo "  you've ever sent will create a contact entry for yourself."
    echo ""
    prompt_validated "Your email address" "text" "validate_email"
    env_set "$ENV_FILE" "OWNER_EMAIL" "$PROMPT_RESULT"
    ui_success "Owner email saved: $PROMPT_RESULT"

    # Restart API so it picks up the new OWNER_EMAIL
    if docker compose ps --status running --quiet 2>/dev/null | grep -q .; then
      echo ""
      ui_info "Restarting API to apply owner email..."
      docker compose restart api > /dev/null 2>&1
      sleep 3
    fi
  fi
}

# Send a file to an import endpoint and display results
# Usage: send_import "/api/import/mbox" "/path/to/file.mbox" "Gmail"
send_import() {
  local endpoint="$1" filepath="$2" label="$3"
  local api_url
  api_url=$(get_api_url)

  echo ""
  local response http_code body
  response=$(curl -s -w "\n%{http_code}" -X POST "${api_url}${endpoint}" -F "file=@${filepath}" 2>&1)
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" != "200" ]; then
    ui_error "${label} import failed (HTTP ${http_code})"
    echo "  $body"
    return 1
  fi

  ui_success "${label} import complete!"

  # Parse and display results from JSON response
  # Handle both CSV-style (total/created/merged) and mbox/ics-style (contacts/interactions) responses
  local contacts created merged interactions
  contacts=$(echo "$body" | grep -o '"contacts":[0-9]*' | head -1 | cut -d: -f2)
  created=$(echo "$body" | grep -o '"created":[0-9]*' | head -1 | cut -d: -f2)
  merged=$(echo "$body" | grep -o '"merged":[0-9]*' | head -1 | cut -d: -f2)
  interactions=$(echo "$body" | grep -o '"interactions":[0-9]*' | head -1 | cut -d: -f2)

  if [ -n "$created" ] && [ -n "$merged" ]; then
    echo "  Contacts created: $created"
    echo "  Contacts merged with existing: $merged"
  elif [ -n "$contacts" ]; then
    echo "  Contacts processed: $contacts"
  fi
  if [ -n "$interactions" ]; then
    echo "  Interactions logged: $interactions"
  fi
}

# Prompt user for a file path, with tab completion hint
# Usage: prompt_file "description" "expected_extension"
# Sets PROMPT_RESULT to the validated file path
prompt_file() {
  local description="$1" extension="$2"
  PROMPT_RESULT=""

  while true; do
    echo ""
    local filepath
    filepath=$(ui_input "Path to ${description} (or Enter to skip)")

    if [ -z "$filepath" ]; then
      return 1  # skipped
    fi

    # Expand ~ to home directory
    filepath="${filepath/#\~/$HOME}"

    if [ ! -f "$filepath" ]; then
      ui_error "File not found: $filepath"
      echo "  Check the path and try again."
      continue
    fi

    if [ -n "$extension" ] && [[ "$filepath" != *"$extension" ]]; then
      echo "  Warning: expected a ${extension} file but got: $(basename "$filepath")"
      if ! ui_confirm "Use this file anyway?" "no"; then
        continue
      fi
    fi

    PROMPT_RESULT="$filepath"
    return 0
  done
}

import_data() {
  echo ""
  ui_header "Import Your Data"
  echo ""
  echo "  This wizard walks you through exporting your data and loading it in."
  echo "  You can import any combination — skip what you don't have yet."
  echo ""

  # Ensure OWNER_EMAIL is set before any imports
  ensure_owner_email

  # Ensure API is running
  if ! ensure_api_running; then
    return 1
  fi

  local imported=0
  local done_gmail="" done_calendar="" done_linkedin_conn="" done_linkedin_msg=""

  while true; do
    echo ""
    if [ $imported -gt 0 ]; then
      echo "  ─────────────────────────────────"
      echo "  $imported source(s) imported so far."
    fi
    echo ""
    echo "  What would you like to import next?"
    echo ""

    # Build menu with checkmarks for completed imports
    local opt_gmail="Gmail (mbox from Google Takeout)"
    local opt_calendar="Calendar (ics from Google Takeout)"
    local opt_linkedin_conn="LinkedIn Connections (CSV)"
    local opt_linkedin_msg="LinkedIn Messages (CSV)"
    [ -n "$done_gmail" ] && opt_gmail="Gmail ✓ (import another mbox)"
    [ -n "$done_calendar" ] && opt_calendar="Calendar ✓ (import another ics)"
    [ -n "$done_linkedin_conn" ] && opt_linkedin_conn="LinkedIn Connections ✓ (import another)"
    [ -n "$done_linkedin_msg" ] && opt_linkedin_msg="LinkedIn Messages ✓ (import another)"

    local choice
    choice=$(ui_choose \
      "$opt_gmail" \
      "$opt_calendar" \
      "$opt_linkedin_conn" \
      "$opt_linkedin_msg" \
      "Other contacts (CSV)" \
      "Done importing")

    case "$choice" in
      Gmail*)
        if import_gmail; then done_gmail=1; imported=$((imported + 1)); fi
        ;;
      Calendar*)
        if import_calendar; then done_calendar=1; imported=$((imported + 1)); fi
        ;;
      "LinkedIn C"*|"LinkedIn Connections"*)
        if import_linkedin_connections; then done_linkedin_conn=1; imported=$((imported + 1)); fi
        ;;
      "LinkedIn M"*|"LinkedIn Messages"*)
        if import_linkedin_messages; then done_linkedin_msg=1; imported=$((imported + 1)); fi
        ;;
      "Other"*)
        if import_csv; then imported=$((imported + 1)); fi
        ;;
      "Done"*)
        break
        ;;
    esac
  done

  echo ""
  if [ $imported -gt 0 ]; then
    ui_success "All done! Imported $imported data source(s)."
  else
    ui_info "No data imported. You can run this again anytime with: ./setup.sh"
  fi
  echo ""
  echo "  Chat with your bot — try: \"search John\" or \"who do I know at Google?\""
  echo ""
}

import_gmail() {
  echo ""
  ui_info "Gmail Import (mbox)"
  echo ""
  echo "  This imports your email contacts and interaction history."
  echo "  Large mailboxes (10GB+) work fine but take a few minutes to process."
  echo ""
  echo "  How to export:"
  echo "  1. Go to https://takeout.google.com"
  echo "  2. Click 'Deselect all', then scroll down and select only 'Mail'"
  echo "  3. Click 'Next step' → 'Create export'"
  echo "  4. Google will email you when it's ready (can take hours for large mailboxes)"
  echo "  5. Download and unzip — you'll get a file like 'All mail Including Spam and Trash.mbox'"
  echo ""

  if prompt_file "mbox file" ".mbox"; then
    send_import "/api/import/mbox" "$PROMPT_RESULT" "Gmail"
    return $?
  fi
  return 1
}

import_calendar() {
  echo ""
  ui_info "Calendar Import (ics)"
  echo ""
  echo "  This imports people you've had meetings with and logs each meeting."
  echo ""
  echo "  How to export:"
  echo "  1. Go to https://takeout.google.com"
  echo "  2. Click 'Deselect all', then scroll down and select only 'Calendar'"
  echo "  3. Click 'Next step' → 'Create export'"
  echo "  4. Download and unzip — you'll find .ics files for each calendar"
  echo ""

  if prompt_file "ics file" ".ics"; then
    send_import "/api/import/ics" "$PROMPT_RESULT" "Calendar"
    return $?
  fi
  return 1
}

import_linkedin_connections() {
  echo ""
  ui_info "LinkedIn Connections (CSV)"
  echo ""
  echo "  This imports your LinkedIn connections with name, company, role, and email."
  echo ""
  echo "  How to export:"
  echo "  1. Go to https://www.linkedin.com/mypreferences/d/download-my-data"
  echo "  2. Select 'Connections' and click 'Request archive'"
  echo "  3. LinkedIn will email you when it's ready (usually within 10 minutes)"
  echo "  4. Download and unzip — look for 'Connections.csv'"
  echo ""

  if prompt_file "Connections.csv file" ".csv"; then
    send_import "/api/import/csv" "$PROMPT_RESULT" "LinkedIn Connections"
    return $?
  fi
  return 1
}

import_linkedin_messages() {
  echo ""
  ui_info "LinkedIn Messages (CSV)"
  echo ""
  echo "  This imports your LinkedIn message history as interaction data."
  echo ""
  echo "  How to export:"
  echo "  1. Go to https://www.linkedin.com/mypreferences/d/download-my-data"
  echo "  2. Select 'Messages' and click 'Request archive'"
  echo "  3. Download and unzip — look for 'messages.csv'"
  echo ""

  if prompt_file "messages.csv file" ".csv"; then
    send_import "/api/import/linkedin-messages" "$PROMPT_RESULT" "LinkedIn Messages"
    return $?
  fi
  return 1
}

import_csv() {
  echo ""
  ui_info "Contacts CSV"
  echo ""
  echo "  Import contacts from any CSV file (CRM export, spreadsheet, etc)."
  echo "  The CSV should have headers. Recognized columns:"
  echo "    First Name, Last Name (or Name)"
  echo "    Email (or Email Address)"
  echo "    Phone"
  echo "    Company (or Organization)"
  echo "    Position (or Title, Job Title, Role)"
  echo "    Location (or City)"
  echo "    LinkedIn URL"
  echo ""

  if prompt_file "CSV file" ".csv"; then
    send_import "/api/import/csv" "$PROMPT_RESULT" "Contacts"
    return $?
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Returning user menu
# ---------------------------------------------------------------------------

returning_user_menu() {
  ui_header "You.ai Setup"
  echo ""
  echo "  Existing configuration detected."
  echo ""

  local choice
  choice=$(ui_choose "Import your data" "Configure optional integrations" "Re-run initial setup" "Start services" "Exit")

  case "$choice" in
    "Import"*)
      import_data
      ;;
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
      if start_services && wait_for_services; then
        echo ""
        ui_success "Services are running!"
      fi
      ;;
    *)
      echo "Bye!"
      exit 0
      ;;
  esac
}

rerun_setup() {
  echo ""
  ui_info "This will reconfigure your core settings (API key, messaging provider)."
  echo "  Your optional integrations (OpenAI, GitHub, etc.) will be preserved."
  echo "  Your database will be kept unless you choose to reset it."
  echo ""

  if ! ui_confirm "Continue?"; then
    echo "Cancelled."
    return
  fi

  # Ask if they want to reset the database
  local reset_db=false
  echo ""
  ui_info "Database"
  echo "  Your database contains contacts, interactions, briefings, and chat history."
  echo ""
  while true; do
    if ui_confirm "Keep existing database?"; then
      break
    fi
    echo ""
    if ui_confirm "Are you sure? This cannot be undone." "no"; then
      reset_db=true
      break
    fi
    echo ""
  done

  # Save advanced config values from existing .env
  # (write_env already preserves POSTGRES_PASSWORD and EVOLUTION_API_KEY)
  local saved_openai saved_github saved_av saved_email saved_cron
  saved_openai=$(env_get "$ENV_FILE" "OPENAI_API_KEY")
  saved_github=$(env_get "$ENV_FILE" "GITHUB_TOKEN")
  saved_av=$(env_get "$ENV_FILE" "ALPHA_VANTAGE_API_KEY")
  saved_email=$(env_get "$ENV_FILE" "OWNER_EMAIL")
  saved_cron=$(env_get "$ENV_FILE" "BRIEFING_CRON")

  # Collect new core config and write .env (overwrites existing .env)
  if ! collect_and_write_config; then
    return 0
  fi

  # Restore saved advanced config BEFORE starting services
  [ -n "$saved_openai" ] && env_set "$ENV_FILE" "OPENAI_API_KEY" "$saved_openai"
  [ -n "$saved_github" ] && env_set "$ENV_FILE" "GITHUB_TOKEN" "$saved_github"
  [ -n "$saved_av" ] && env_set "$ENV_FILE" "ALPHA_VANTAGE_API_KEY" "$saved_av"
  [ -n "$saved_email" ] && env_set "$ENV_FILE" "OWNER_EMAIL" "$saved_email"
  [ -n "$saved_cron" ] && env_set "$ENV_FILE" "BRIEFING_CRON" "$saved_cron"

  if [ "$reset_db" = true ]; then
    echo ""
    ui_info "Resetting database..."
    docker compose down -v >/dev/null 2>&1 || true
  fi

  # Now start services with full config applied
  if ! start_services; then
    return 1
  fi

  if ! wait_for_services; then
    echo ""
    echo "  Your configuration is saved. You can retry with: docker compose up -d"
    return 1
  fi

  show_whats_next
}

# ---------------------------------------------------------------------------
# Main entry point and mode detection
# ---------------------------------------------------------------------------

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
