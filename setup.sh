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
    *) echo "Unsupported architecture: $arch"; return 1 ;;
  esac

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
      echo "$opt"
      break
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
  escaped_value=$(printf '%s\n' "$value" | sed 's/[&\|/\\]/\\&/g')

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
  sedi 's/^# \([A-Z_]\{1,\}=\)/\1/' "$file"
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
  command -v docker compose >/dev/null 2>&1 || {
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

validate_tavily_key() {
  [[ "$1" == tvly-* ]]
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
  echo "  • An Anthropic API key"
  echo "  • A Telegram or WhatsApp account"
  echo ""
}

collect_anthropic_key() {
  echo ""
  ui_info "Step 1: Anthropic API Key"
  echo "  Get your key from: https://console.anthropic.com → API Keys"
  echo ""
  ANTHROPIC_KEY=$(prompt_validated "Paste your Anthropic API key" "password" "validate_anthropic_key")
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
  TELEGRAM_TOKEN=$(prompt_validated "Paste your bot token" "password" "validate_telegram_token")

  echo ""
  echo "  To find your Telegram user ID:"
  echo "  1. Search for @userinfobot on Telegram"
  echo "  2. Send /start — it will reply with your numeric ID"
  echo ""
  TELEGRAM_OWNER_ID=$(prompt_validated "Enter your Telegram user ID" "text" "validate_telegram_owner_id")
}

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
