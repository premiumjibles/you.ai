#!/bin/bash
set -euo pipefail

# Constants
GUM_VERSION="0.14.5"
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
trap cleanup EXIT INT TERM

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
    x86_64)  arch="amd64" ;;
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

ui_choose() {
  if [ -n "$GUM_BIN" ]; then
    "$GUM_BIN" choose "$@"
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

validate_venice_key() {
  [ -n "$1" ]
}

validate_email() {
  [[ "$1" == *@* ]]
}

# ---------------------------------------------------------------------------
# Prompt with validation
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Fresh install wizard flow
# ---------------------------------------------------------------------------

show_welcome() {
  ui_header "You.ai Setup"
  echo ""
  echo "This wizard will configure your personal AI assistant."
  echo "It takes about 2 minutes. You'll need:"
  echo "  • An API key for your AI provider (Anthropic or Venice)"
  echo "  • A Telegram or WhatsApp account"
  echo ""
}

collect_llm_provider() {
  echo ""
  ui_info "Step 1: AI Provider"
  echo "  Choose which AI provider powers your assistant."
  echo ""
  LLM_PROVIDER_CHOICE=$(ui_choose "Anthropic (default)" "Venice")

  case "$LLM_PROVIDER_CHOICE" in
    "Anthropic"*) LLM_PROVIDER_CHOICE="anthropic" ;;
    "Venice"*)    LLM_PROVIDER_CHOICE="venice" ;;
  esac
}

collect_api_key() {
  echo ""
  if [ "$LLM_PROVIDER_CHOICE" = "venice" ]; then
    ui_info "Step 2: Venice API Key"
    echo "  Get your key from: https://venice.ai → Settings → API"
    echo ""
    PROVIDER_API_KEY=$(prompt_validated "Paste your Venice API key" "password" "validate_venice_key")
  else
    ui_info "Step 2: Anthropic API Key"
    echo "  Get your key from: https://console.anthropic.com → API Keys"
    echo ""
    PROVIDER_API_KEY=$(prompt_validated "Paste your Anthropic API key" "password" "validate_anthropic_key")
  fi
}

collect_messaging_provider() {
  echo ""
  ui_info "Step 3: Messaging Provider"
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
  ui_info "Step 4: Telegram Bot Setup"
  echo ""
  echo "  To create a Telegram bot:"
  echo "  1. Open Telegram and search for @BotFather"
  echo "  2. Send /newbot and follow the prompts"
  echo "  3. BotFather will give you a token like: 123456789:ABCdef..."
  echo ""
  TELEGRAM_TOKEN=$(prompt_validated "Paste your bot token" "password" "validate_telegram_token")

  echo ""
  echo "  To find your Telegram user ID:"
  echo "  1. Search for @idbot on Telegram"
  echo "  2. Send /getid — it will reply with your numeric ID"
  echo ""
  TELEGRAM_OWNER_ID=$(prompt_validated "Enter your Telegram user ID" "text" "validate_telegram_owner_id")
}

collect_whatsapp() {
  echo ""
  ui_info "Step 4: WhatsApp Setup"
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

show_summary() {
  echo ""
  ui_info "Configuration Summary"
  echo "  AI Provider: $LLM_PROVIDER_CHOICE"
  echo "  API Key: ****${PROVIDER_API_KEY: -4}"
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

  # Auto-generate secrets
  local pg_pass evo_key
  pg_pass=$(openssl rand -hex 16)
  evo_key=$(openssl rand -hex 16)

  # Uncomment all commented key=value lines
  env_uncomment_keys "$ENV_TMP"

  # Core config
  env_set "$ENV_TMP" "MESSAGING_PROVIDER" "$MESSAGING_PROVIDER"
  env_set "$ENV_TMP" "LLM_PROVIDER" "$LLM_PROVIDER_CHOICE"
  if [ "$LLM_PROVIDER_CHOICE" = "venice" ]; then
    env_set "$ENV_TMP" "VENICE_API_KEY" "$PROVIDER_API_KEY"
  else
    env_set "$ENV_TMP" "ANTHROPIC_API_KEY" "$PROVIDER_API_KEY"
  fi

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
  choice=$(ui_choose "Configure optional integrations" "Start using your bot")

  case "$choice" in
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
  collect_llm_provider
  collect_api_key
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

  # LLM Provider
  ui_info "LLM Provider"
  local current_provider
  current_provider=$(env_get "$ENV_FILE" "LLM_PROVIDER")
  current_provider="${current_provider:-anthropic}"
  echo "  Current provider: $current_provider"
  echo ""
  local new_provider
  new_provider=$(ui_choose "Keep current ($current_provider)" "Anthropic" "Venice")
  case "$new_provider" in
    "Anthropic"*)
      env_set "$ENV_FILE" "LLM_PROVIDER" "anthropic"
      if [ -z "$(env_get "$ENV_FILE" "ANTHROPIC_API_KEY")" ] || [ "$(env_get "$ENV_FILE" "ANTHROPIC_API_KEY")" = "sk-ant-xxx" ]; then
        local anthropic_key
        anthropic_key=$(prompt_validated "Anthropic API key" "password" "validate_anthropic_key")
        env_set "$ENV_FILE" "ANTHROPIC_API_KEY" "$anthropic_key"
      fi
      ui_success "LLM provider set to Anthropic"
      ;;
    "Venice"*)
      env_set "$ENV_FILE" "LLM_PROVIDER" "venice"
      if [ -z "$(env_get "$ENV_FILE" "VENICE_API_KEY")" ]; then
        local venice_key
        venice_key=$(prompt_validated "Venice API key" "password" "validate_venice_key")
        env_set "$ENV_FILE" "VENICE_API_KEY" "$venice_key"
      fi
      ui_success "LLM provider set to Venice"
      ;;
    *) ;; # Keep current
  esac
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
  echo ""

  if ! ui_confirm "Continue?"; then
    echo "Cancelled."
    return
  fi

  # Save advanced config values from existing .env
  local saved_openai saved_github saved_av saved_email saved_cron saved_venice_key
  saved_openai=$(env_get "$ENV_FILE" "OPENAI_API_KEY")
  saved_github=$(env_get "$ENV_FILE" "GITHUB_TOKEN")
  saved_av=$(env_get "$ENV_FILE" "ALPHA_VANTAGE_API_KEY")
  saved_email=$(env_get "$ENV_FILE" "OWNER_EMAIL")
  saved_cron=$(env_get "$ENV_FILE" "BRIEFING_CRON")
  saved_venice_key=$(env_get "$ENV_FILE" "VENICE_API_KEY")

  # Remove existing .env so collect_and_write_config treats it as new
  rm -f "$ENV_FILE"

  # Collect new core config and write .env (no service launch yet)
  collect_and_write_config

  # Restore saved advanced config BEFORE starting services
  [ -n "$saved_openai" ] && env_set "$ENV_FILE" "OPENAI_API_KEY" "$saved_openai"
  [ -n "$saved_github" ] && env_set "$ENV_FILE" "GITHUB_TOKEN" "$saved_github"
  [ -n "$saved_av" ] && env_set "$ENV_FILE" "ALPHA_VANTAGE_API_KEY" "$saved_av"
  [ -n "$saved_email" ] && env_set "$ENV_FILE" "OWNER_EMAIL" "$saved_email"
  [ -n "$saved_cron" ] && env_set "$ENV_FILE" "BRIEFING_CRON" "$saved_cron"
  [ -n "$saved_venice_key" ] && env_set "$ENV_FILE" "VENICE_API_KEY" "$saved_venice_key"

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
