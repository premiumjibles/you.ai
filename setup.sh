#!/bin/bash
set -e

echo "=== Dorjee.ai POC Setup ==="

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker required. Install: https://docs.docker.com/get-docker/"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "Docker Compose required."; exit 1; }

# First run: generate .env from template
if [ ! -f .env ]; then
  cp .env.example .env

  # Auto-generate secrets
  PG_PASS=$(openssl rand -hex 16)
  N8N_ENC=$(openssl rand -hex 32)
  EVO_KEY=$(openssl rand -hex 16)

  sed -i "s/POSTGRES_PASSWORD=changeme/POSTGRES_PASSWORD=$PG_PASS/" .env
  sed -i "s|DATABASE_URL=postgresql://youai:changeme@|DATABASE_URL=postgresql://youai:$PG_PASS@|" .env
  sed -i "s/N8N_BASIC_AUTH_PASSWORD=changeme/N8N_BASIC_AUTH_PASSWORD=$(openssl rand -hex 8)/" .env
  sed -i "s/N8N_ENCRYPTION_KEY=changeme-generate-random/N8N_ENCRYPTION_KEY=$N8N_ENC/" .env
  sed -i "s/EVOLUTION_API_KEY=changeme/EVOLUTION_API_KEY=$EVO_KEY/" .env

  echo "Created .env with auto-generated secrets."
  echo ""
  echo "You still need to add your Anthropic API key:"
  echo "  nano .env  →  set ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
  echo "Then re-run: ./setup.sh"
  exit 0
fi

# Validate required keys
if grep -q "ANTHROPIC_API_KEY=sk-ant-xxx" .env || ! grep -q "ANTHROPIC_API_KEY=" .env; then
  echo "ERROR: Set your ANTHROPIC_API_KEY in .env before proceeding."
  echo "  nano .env"
  exit 1
fi

# Ask about WhatsApp
WHATSAPP_FLAG=""
if [ "${1}" = "--whatsapp" ]; then
  WHATSAPP_FLAG="--profile whatsapp"
  echo "WhatsApp mode enabled."
fi

# Start services
echo "Starting Postgres, API, and n8n..."
docker compose $WHATSAPP_FLAG up -d

# Wait for services
echo "Waiting for services to be ready..."
until docker compose exec postgres pg_isready -U youai > /dev/null 2>&1; do sleep 1; done
echo "Postgres ready."

until curl -sf http://localhost:3000/health > /dev/null 2>&1; do sleep 1; done
echo "API ready."

until curl -sf http://localhost:5678/healthz > /dev/null 2>&1; do sleep 1; done
echo "n8n ready."

if [ -n "$WHATSAPP_FLAG" ]; then
  echo "Waiting for Evolution API..."
  until curl -sf http://localhost:8080/ > /dev/null 2>&1; do sleep 1; done
  echo "Evolution API ready."
fi

# Import n8n workflows
echo "Importing n8n workflows..."
docker compose exec n8n sh /workflows/../import.sh || echo "Manual workflow import may be needed via n8n UI"

echo ""
echo "=== Setup Complete ==="
echo "n8n UI:  http://localhost:5678"
echo "API:     http://localhost:3000"
if [ -n "$WHATSAPP_FLAG" ]; then
  echo "WhatsApp: http://localhost:8080 — create an instance and scan the QR code"
fi
echo ""
echo "Next steps:"
echo "1. Open n8n UI and configure credentials"
echo "2. Activate the workflows you want"
if [ -n "$WHATSAPP_FLAG" ]; then
  echo "3. Open Evolution API UI, create an instance, scan QR with your phone"
fi
