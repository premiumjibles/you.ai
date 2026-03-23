#!/bin/bash
set -e

echo "=== Dorjee.ai POC Setup ==="

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
