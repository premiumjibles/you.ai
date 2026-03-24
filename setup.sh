#!/bin/bash
set -e

echo "=== You.ai POC Setup ==="

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker required. Install: https://docs.docker.com/get-docker/"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "Docker Compose required."; exit 1; }

# First run: generate .env from template
if [ ! -f .env ]; then
  cp .env.example .env

  # Auto-generate secrets
  PG_PASS=$(openssl rand -hex 16)
  EVO_KEY=$(openssl rand -hex 16)

  sed -i '' "s/POSTGRES_PASSWORD=changeme/POSTGRES_PASSWORD=$PG_PASS/" .env
  sed -i '' "s|DATABASE_URL=postgresql://youai:changeme@|DATABASE_URL=postgresql://youai:$PG_PASS@|" .env
  sed -i '' "s/EVOLUTION_API_KEY=changeme/EVOLUTION_API_KEY=$EVO_KEY/" .env

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

# Start services
echo "Starting Postgres, API, and Evolution API..."
docker compose up -d

# Wait for services
echo "Waiting for services to be ready..."
until docker compose exec postgres pg_isready -U youai > /dev/null 2>&1; do sleep 1; done
echo "Postgres ready."

until curl -sf http://localhost:3000/health > /dev/null 2>&1; do sleep 1; done
echo "API ready."

echo "Waiting for Evolution API..."
until curl -sf http://localhost:8080/ > /dev/null 2>&1; do sleep 1; done
echo "Evolution API ready."

echo ""
echo "=== Setup Complete ==="
echo "API:            http://localhost:3000"
echo "Evolution API:  http://localhost:8080"
echo ""
echo "Next steps:"
echo "1. Open Evolution API UI, create an instance, scan QR with your phone"
echo "2. Send a WhatsApp message to test"
