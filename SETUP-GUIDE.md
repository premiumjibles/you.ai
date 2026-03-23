# Dorjee.ai — Setup Guide

Step-by-step deployment guide based on real deployment experience. Covers a fresh Hetzner VPS (or similar) running Linux.

## Prerequisites

Before you start, have these ready:
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com) → API Keys (required, pay-per-use)
- A VPS with SSH access (tested on Hetzner, Debian/Ubuntu)

## Step 1: Install Docker

SSH into your server:

```bash
ssh user@your-server-ip
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable docker
```

Add your user to the docker group (so you don't need `sudo` for docker commands):

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

## Step 2: Clone the repo

```bash
cd ~
git clone https://github.com/premiumjibles/you.ai.git
cd you.ai
```

## Step 3: Run setup

```bash
./setup.sh
```

First run generates `.env` with random secrets for Postgres, Evolution API, etc. You'll see:

```
Created .env with auto-generated secrets.

You still need to add your Anthropic API key:
  nano .env  →  set ANTHROPIC_API_KEY=sk-ant-...

Then re-run: ./setup.sh
```

## Step 4: Add your Anthropic key

```bash
nano .env
```

Find the line `ANTHROPIC_API_KEY=sk-ant-xxx` and replace with your actual key. Save and exit (`Ctrl+X`, `Y`, `Enter`).

## Step 5: Start services

```bash
./setup.sh
```

This starts 3 containers (Postgres, API, Evolution API), waits for health checks, and prints URLs when ready.

**Note:** Evolution API takes 1-2 minutes on first start (runs database migrations). If the setup script seems stuck on "Waiting for Evolution API...", give it time. Check progress with:

```bash
docker compose logs evolution-api --tail 20
```

## Step 6: Connect WhatsApp

### Open Evolution API manager

From your **local machine** (not the server), open an SSH tunnel:

```bash
ssh -L 8080:localhost:8080 user@your-server-ip
```

Then open `http://localhost:8080/manager` in your browser.

### Log in

The API key is in your `.env` file. Check it with:

```bash
grep EVOLUTION_API_KEY .env
```

Paste that value into the manager login.

### Create a WhatsApp instance

1. Click **"Add Instance"**
2. Instance name: `dorjee` (must match `EVOLUTION_INSTANCE` in your `.env`)
3. **Important:** Select **"Evolution"** as the channel type (NOT "Baileys")
4. Click Create

### Scan QR code

1. Click on your new instance
2. Click **"Get QR Code"**
3. A QR code appears — scan it with WhatsApp on your phone:
   - Open WhatsApp → Settings → Linked Devices → Link a Device
4. Status should change from "Disconnected" to "Connected"

If the QR code dialog appears empty, delete the instance and recreate it — make sure you selected "Evolution" (not "Baileys") as the channel.

### Set your WhatsApp JID

After connecting, you need to tell the API service which WhatsApp number is the owner (so it only responds to you). Your JID is your phone number in this format: `<country-code><number>@s.whatsapp.net`

Example: Australian number 0412 345 678 → `61412345678@s.whatsapp.net`

```bash
nano .env
```

Set `WHATSAPP_OWNER_JID=61412345678@s.whatsapp.net` (use your actual number).

Then restart the API:

```bash
docker compose restart api
```

## Step 7: Configure the webhook

Evolution API needs to know where to send incoming WhatsApp messages. Set the webhook to point at your API service:

```bash
curl -X PUT http://localhost:8080/webhook/set/dorjee \
  -H "apikey: $(grep EVOLUTION_API_KEY .env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://api:3000/api/chat/webhook",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

Note: The URL uses `http://api:3000` (the Docker internal network hostname), not `localhost`.

## Step 8: Test it

Send a WhatsApp message to the number you linked. The AI assistant should respond.

Try:
- "hello" — should get a conversational response
- "search for [name]" — searches your contact database (empty until you import data)

## Step 9: Import your data (optional)

### Gmail (Google Takeout)

1. Go to [takeout.google.com](https://takeout.google.com)
2. Deselect all, select only **Gmail**
3. Export and download the `.mbox` file
4. Upload it:

```bash
curl -X POST http://localhost:3000/api/import/mbox \
  -F "file=@/path/to/All mail Including Spam and Trash.mbox"
```

### Google Calendar

1. Same Takeout process, select only **Calendar**
2. Download the `.ics` file
3. Upload:

```bash
curl -X POST http://localhost:3000/api/import/ics \
  -F "file=@/path/to/calendar.ics"
```

### LinkedIn Contacts

1. Go to LinkedIn → Settings → Data Privacy → Get a copy of your data → Connections
2. Download the CSV
3. Upload:

```bash
curl -X POST http://localhost:3000/api/import/csv \
  -F "file=@/path/to/Connections.csv"
```

## Firewall Notes

Your Hetzner firewall needs these **inbound** rules:

| Protocol | Port | Required? | Why |
|----------|------|-----------|-----|
| TCP | 22 | Yes | SSH access |
| TCP | 443 | Recommended | HTTPS (if you set up a domain + reverse proxy) |
| TCP | 80 | Recommended | HTTP → HTTPS redirect |

Ports 3000 (API), 5432 (Postgres), and 8080 (Evolution API) do **not** need to be open — they're only accessed internally or via SSH tunnel.

**Important:** Make sure your firewall is actually applied to your server (Hetzner shows "Applied to 0 Resources" if it's not attached).

## Troubleshooting

### "permission denied" when running docker commands
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Evolution API: "Database provider invalid"
The docker-compose.yml must have `DATABASE_PROVIDER: postgresql` in the Evolution API environment.

### Evolution API: "redis disconnected" spam
Add `CACHE_REDIS_ENABLED: "false"` and `CACHE_LOCAL_ENABLED: "true"` to the Evolution API environment in docker-compose.yml.

### Evolution API: "database schema is not empty"
Evolution API needs its own database, separate from the app database. Create it:
```bash
docker compose exec postgres psql -U youai -c "CREATE DATABASE evolution;"
```

### QR code not showing in Evolution API manager
Delete the instance and recreate it. Make sure you select **"Evolution"** as the channel type, not "Baileys".

### Setup script stuck on "Waiting for Evolution API..."
Check the logs: `docker compose logs evolution-api --tail 20`. First boot takes 1-2 minutes for database migrations.

### Can't access n8n/Evolution API UI from browser
Use SSH tunneling: `ssh -L <port>:localhost:<port> user@server-ip`, then open `http://localhost:<port>`. Mosh does not support port forwarding — use plain `ssh`.
