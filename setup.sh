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
