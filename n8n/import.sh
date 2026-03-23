#!/bin/bash
set -e
WORKFLOW_DIR="/workflows"
N8N_URL="http://localhost:5678"

echo "Waiting for n8n to be ready..."
until curl -sf "$N8N_URL/healthz" > /dev/null 2>&1; do
  sleep 2
done

echo "Importing workflows..."
for f in "$WORKFLOW_DIR"/*.json; do
  [ -f "$f" ] || continue
  echo "Importing $(basename "$f")..."
  curl -sf -X POST "$N8N_URL/api/v1/workflows" \
    -H "Content-Type: application/json" \
    -u "${N8N_BASIC_AUTH_USER}:${N8N_BASIC_AUTH_PASSWORD}" \
    -d @"$f" || echo "  Failed to import $(basename "$f")"
done

echo "Done."
