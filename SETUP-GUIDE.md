# You.ai — Setup Guide

Step-by-step deployment guide based on real deployment experience. Covers a fresh Hetzner VPS (or similar) running Linux.

## Prerequisites

Before you start, have these ready:
- **Anthropic API key** — you'll get this during setup (from [console.anthropic.com](https://console.anthropic.com))
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

## Step 4: Connect WhatsApp

All commands below run on the server. The API key variable is read from your `.env` automatically.

### 4a. Create a WhatsApp instance

```bash
APIKEY=$(grep EVOLUTION_API_KEY .env | cut -d= -f2)
INSTANCE=$(grep EVOLUTION_INSTANCE .env | cut -d= -f2)
INSTANCE=${INSTANCE:-youai}

curl -s -X POST http://localhost:8080/instance/create \
  -H "apikey: $APIKEY" \
  -H "Content-Type: application/json" \
  -d "{\"instanceName\": \"$INSTANCE\", \"integration\": \"WHATSAPP-BAILEYS\", \"qrcode\": true}" | python3 -m json.tool
```

You should see a response with `"status": "connecting"`.

### 4b. Get the QR code

```bash
# Wait a few seconds for the instance to initialize, then:
sleep 5
curl -s http://localhost:8080/instance/connect/$INSTANCE \
  -H "apikey: $APIKEY" | python3 -m json.tool
```

The response should contain a `base64` field with the QR image and/or a `code` field with the pairing text.

**If you get `{"count": 0}`:** The instance may need more time to connect to WhatsApp servers. Wait 10 seconds and retry. Check `docker compose logs evolution-api --tail 20` for errors.

### 4c. Scan the QR code

**Option A — Browser (easiest):** If the response has a `base64` field, copy the value and open this in your browser address bar:
```
data:image/png;base64,<paste-base64-here>
```

**Option B — Manager UI:** SSH tunnel from your local machine:
```bash
ssh -L 8080:localhost:8080 user@your-server-ip
```
Open `http://localhost:8080/manager`, log in with your `EVOLUTION_API_KEY`, click the instance, click "Get QR Code".

**Option C — Terminal QR:** If you have `qrencode` installed:
```bash
curl -s http://localhost:8080/instance/connect/$INSTANCE \
  -H "apikey: $APIKEY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" | qrencode -t ANSIUTF8
```

**Scan with your phone:** Open WhatsApp → Settings → Linked Devices → Link a Device → scan the QR code.

### 4d. Verify connection

```bash
curl -s http://localhost:8080/instance/connectionState/$INSTANCE \
  -H "apikey: $APIKEY"
```

Expected: `"state": "open"`. Your `ownerJid` should show your phone number.

### 4e. Set your owner JID

Your JID is your phone number in the format: `<country-code><number>@s.whatsapp.net`
(Example: Australian 0412 345 678 → `61412345678@s.whatsapp.net`)

```bash
# Get your JID from the instance info (if connected):
curl -s http://localhost:8080/instance/fetchInstances \
  -H "apikey: $APIKEY" | python3 -c "
import sys, json
instances = json.load(sys.stdin)
for i in instances:
    if i['name'] == '${INSTANCE}':
        print(f\"Your JID: {i.get('ownerJid', 'not connected yet')}\")
"

# Set it in .env:
sed -i "s/^WHATSAPP_OWNER_JID=.*/WHATSAPP_OWNER_JID=<your-jid-here>/" .env

# Restart API to pick up the new JID:
docker compose restart api
```

## Step 5: Configure the webhook

Tell Evolution API to forward incoming WhatsApp messages to your API service:

```bash
APIKEY=$(grep EVOLUTION_API_KEY .env | cut -d= -f2)
INSTANCE=$(grep EVOLUTION_INSTANCE .env | cut -d= -f2)
INSTANCE=${INSTANCE:-youai}

curl -s -X POST http://localhost:8080/webhook/set/$INSTANCE \
  -H "apikey: $APIKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://api:3000/api/chat/webhook",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }' | python3 -m json.tool
```

The URL uses `http://api:3000` (Docker internal hostname), not `localhost`.

### Verify webhook is set

```bash
curl -s http://localhost:8080/webhook/find/$INSTANCE \
  -H "apikey: $APIKEY" | python3 -m json.tool
```

## Step 6: Test it

Send a WhatsApp message to the number you linked. The AI assistant should respond.

Try:
- "hello" — should get a conversational response
- "search for [name]" — searches your contact database (empty until you import data)

If no response, check the API logs:

```bash
docker compose logs api --tail 20
```

## Step 7: Import your data (optional)

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

### QR code not showing / `count: 0` from connect endpoint
Delete the instance and recreate it via CLI (see Step 4a-4b). The manager UI is unreliable for QR generation. If `connect` keeps returning `{"count": 0}`, check `docker compose logs evolution-api --tail 30` — the Baileys connection to WhatsApp servers may be failing. Verify outbound connectivity: `docker compose exec evolution-api sh -c "wget -q -O- --timeout=5 https://web.whatsapp.com > /dev/null && echo OK || echo BLOCKED"`.

### Setup script stuck on "Waiting for Evolution API..."
Check the logs: `docker compose logs evolution-api --tail 20`. First boot takes 1-2 minutes for database migrations.

### Can't access n8n/Evolution API UI from browser
Use SSH tunneling: `ssh -L <port>:localhost:<port> user@server-ip`, then open `http://localhost:<port>`. Mosh does not support port forwarding — use plain `ssh`.
