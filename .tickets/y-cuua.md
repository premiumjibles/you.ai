---
id: y-cuua
status: closed
deps: []
links: []
created: 2026-03-23T20:59:31Z
type: feature
priority: 2
assignee: Jibles
---
# Refactor messaging to provider abstraction with Telegram default

# Messaging Provider Abstraction (Telegram default)

## Architecture

Introduce a `MessagingProvider` interface that both Telegram and WhatsApp implement. A factory reads `MESSAGING_PROVIDER` from `.env` (default: `telegram`) and instantiates the correct provider. Each provider is self-contained — its own env vars, setup, and lifecycle. Each channel is fully independent; the inactive channel requires zero configuration.

## Interface

```typescript
interface MessagingProvider {
  name: string;
  init(): Promise<void>;        // start bot/webhook listener
  send(to: string, text: string): Promise<void>;
  parseIncoming(payload: any): ParsedMessage | null;  // returns null if not from owner
  getOwnerAddress(): string;
}
```

## Components

**`services/messaging/provider.ts`** — Interface + `ParsedMessage` type + factory function
**`services/messaging/telegram.ts`** — `grammy`-based implementation. Uses Telegram Bot API long-polling (no webhook URL needed). Env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`
**`services/messaging/whatsapp.ts`** — Current Evolution API logic extracted here. Env vars: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WHATSAPP_OWNER_JID`

**`routes/chat.ts`** — Webhook route stays for WhatsApp. Telegram uses grammy's built-in update handling (long-polling), so it doesn't need a webhook route.

**`services/scheduler.ts`** — Calls `provider.send()` + `provider.getOwnerAddress()` instead of `sendWhatsApp()` directly.

**`services/agent.ts`** — Receives `ParsedMessage` from either provider, processes identically.

## Docker Compose

- Evolution API and its init script move under a `whatsapp` profile
- Default `docker compose up` starts only Postgres + API (Telegram path)
- `docker compose --profile whatsapp up` adds Evolution API
- API service env vars: only `MESSAGING_PROVIDER` is always present. Channel-specific vars are only needed for the active provider.

## Env Changes

```env
# Messaging (default: telegram)
MESSAGING_PROVIDER=telegram

# Telegram (only needed if MESSAGING_PROVIDER=telegram)
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_ID=

# WhatsApp (only needed if MESSAGING_PROVIDER=whatsapp)
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=changeme
EVOLUTION_INSTANCE=youai
WHATSAPP_OWNER_JID=
```

## Startup Flow

1. `index.ts` reads `MESSAGING_PROVIDER`, calls factory to get provider
2. Calls `provider.init()` — Telegram starts long-polling; WhatsApp registers webhook route
3. Provider validates its own required env vars on init (throws clear error if missing)
4. Scheduler and agent receive the provider instance via dependency injection

## Error Handling

- Missing env vars for the active provider → clear startup error with which vars are needed
- Missing env vars for the inactive provider → silently ignored
- Telegram connection failure → grammy handles reconnection automatically
- WhatsApp path unchanged from current behavior

## Testing Approach

- Provider interface makes it easy to mock in tests
- Each implementation testable independently
- Integration test: send a message through provider, verify agent receives ParsedMessage

## Approved Approach

Single active channel selected via `MESSAGING_PROVIDER` env var (default: `telegram`). Self-hosted `grammy` library for Telegram (no external gateway). Docker Compose profiles to conditionally include Evolution API only when WhatsApp is active. Each channel fully independent — inactive channel requires zero configuration.

## Notes

**2026-03-23T21:05:28Z**

# Messaging Provider Abstraction — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use /run tk:y-cuua to implement this plan task-by-task via subagent-driven-development.

**Goal:** Replace hard-coded WhatsApp messaging with a provider abstraction so the system supports Telegram (default) and WhatsApp via a single env var toggle.

**Architecture:** A `MessagingProvider` interface defines `init()`, `send()`, `parseIncoming()`, and `getOwnerAddress()`. A factory reads `MESSAGING_PROVIDER` from env (default `telegram`) and returns the correct implementation. Telegram uses `grammy` long-polling; WhatsApp uses the existing Evolution API webhook. The inactive channel requires zero configuration.

**Tech Stack:** TypeScript, grammy (Telegram), Evolution API (WhatsApp), vitest, Docker Compose profiles

---

### Task 1: Define the MessagingProvider interface and ParsedMessage type

**Files:**
- Create: `api/src/services/messaging/provider.ts`

**Step 1: Create the interface file**

```typescript
export interface ParsedMessage {
  senderId: string;
  senderName: string;
  text: string;
}

export interface MessagingProvider {
  name: string;
  init(): Promise<void>;
  send(to: string, text: string): Promise<void>;
  parseIncoming(payload: any): ParsedMessage | null;
  getOwnerAddress(): string;
}
```

**Step 2: Commit**

```bash
git add api/src/services/messaging/provider.ts
git commit -m "feat: add MessagingProvider interface and ParsedMessage type"
```

---

### Task 2: Extract WhatsApp provider from existing messaging.ts

**Files:**
- Create: `api/src/services/messaging/whatsapp.ts`
- Create: `api/src/services/messaging/__tests__/whatsapp.test.ts`
- Reference: `api/src/services/messaging.ts` (existing code to extract from)

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { WhatsAppProvider } from "../whatsapp.js";

describe("WhatsAppProvider", () => {
  it("has name 'whatsapp'", () => {
    const provider = new WhatsAppProvider();
    expect(provider.name).toBe("whatsapp");
  });

  it("parseIncoming extracts message from Evolution API webhook payload", () => {
    const provider = new WhatsAppProvider();
    const body = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { conversation: "hello" },
        pushName: "Sean",
      },
    };
    const result = provider.parseIncoming(body);
    expect(result).toEqual({
      senderId: "5511999999999@s.whatsapp.net",
      senderName: "Sean",
      text: "hello",
    });
  });

  it("parseIncoming extracts text from extendedTextMessage", () => {
    const provider = new WhatsAppProvider();
    const body = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { extendedTextMessage: { text: "search for bob" } },
        pushName: "Sean",
      },
    };
    const result = provider.parseIncoming(body);
    expect(result!.text).toBe("search for bob");
  });

  it("parseIncoming returns null for status updates", () => {
    const provider = new WhatsAppProvider();
    expect(provider.parseIncoming({ data: { key: { remoteJid: "x" } } })).toBeNull();
  });

  it("parseIncoming returns null for malformed body", () => {
    const provider = new WhatsAppProvider();
    expect(provider.parseIncoming(null)).toBeNull();
    expect(provider.parseIncoming({})).toBeNull();
  });

  it("getOwnerAddress returns WHATSAPP_OWNER_JID from env", () => {
    const prev = process.env.WHATSAPP_OWNER_JID;
    process.env.WHATSAPP_OWNER_JID = "551100000@s.whatsapp.net";
    const provider = new WhatsAppProvider();
    expect(provider.getOwnerAddress()).toBe("551100000@s.whatsapp.net");
    process.env.WHATSAPP_OWNER_JID = prev;
  });

  it("init throws if required env vars are missing", async () => {
    const prev = {
      url: process.env.EVOLUTION_API_URL,
      key: process.env.EVOLUTION_API_KEY,
      jid: process.env.WHATSAPP_OWNER_JID,
    };
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
    delete process.env.WHATSAPP_OWNER_JID;

    const provider = new WhatsAppProvider();
    await expect(provider.init()).rejects.toThrow(/WHATSAPP_OWNER_JID/);

    process.env.EVOLUTION_API_URL = prev.url;
    process.env.EVOLUTION_API_KEY = prev.key;
    process.env.WHATSAPP_OWNER_JID = prev.jid;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/messaging/__tests__/whatsapp.test.ts`
Expected: FAIL — module not found

**Step 3: Write the WhatsApp provider implementation**

```typescript
import type { MessagingProvider, ParsedMessage } from "./provider.js";

export class WhatsAppProvider implements MessagingProvider {
  name = "whatsapp";

  private baseUrl = "";
  private instance = "";
  private apiKey = "";
  private ownerJid = "";

  async init(): Promise<void> {
    this.ownerJid = process.env.WHATSAPP_OWNER_JID || "";
    this.baseUrl = process.env.EVOLUTION_API_URL || "";
    this.instance = process.env.EVOLUTION_INSTANCE || "youai";
    this.apiKey = process.env.EVOLUTION_API_KEY || "";

    const missing = [];
    if (!this.ownerJid) missing.push("WHATSAPP_OWNER_JID");
    if (!this.baseUrl) missing.push("EVOLUTION_API_URL");
    if (!this.apiKey) missing.push("EVOLUTION_API_KEY");
    if (missing.length > 0) {
      throw new Error(`WhatsApp provider missing env vars: ${missing.join(", ")}`);
    }
  }

  async send(to: string, text: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/message/sendText/${this.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: to, text }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error(`Failed to send WhatsApp message: ${response.status} ${err}`);
    }
  }

  parseIncoming(payload: any): ParsedMessage | null {
    try {
      const data = payload.data;
      if (!data?.key?.remoteJid || !data?.message) return null;

      const msg = data.message;
      const text = msg.conversation
        || msg.extendedTextMessage?.text
        || msg.imageMessage?.caption
        || msg.videoMessage?.caption
        || null;

      if (!text) return null;

      return {
        senderId: data.key.remoteJid,
        senderName: data.pushName || "Unknown",
        text,
      };
    } catch {
      return null;
    }
  }

  getOwnerAddress(): string {
    return this.ownerJid || process.env.WHATSAPP_OWNER_JID || "";
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/messaging/__tests__/whatsapp.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add api/src/services/messaging/whatsapp.ts api/src/services/messaging/__tests__/whatsapp.test.ts
git commit -m "feat: extract WhatsApp provider from messaging.ts"
```

---

### Task 3: Install grammy and create Telegram provider

**Files:**
- Modify: `api/package.json` (add grammy dependency)
- Create: `api/src/services/messaging/telegram.ts`
- Create: `api/src/services/messaging/__tests__/telegram.test.ts`

**Step 1: Install grammy**

Run: `cd api && npm install grammy`

**Step 2: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { TelegramProvider } from "../telegram.js";

describe("TelegramProvider", () => {
  it("has name 'telegram'", () => {
    const provider = new TelegramProvider();
    expect(provider.name).toBe("telegram");
  });

  it("parseIncoming extracts text from Telegram update", () => {
    const provider = new TelegramProvider();
    const update = {
      message: {
        chat: { id: 12345 },
        from: { id: 12345, first_name: "Sean" },
        text: "hello there",
      },
    };
    const result = provider.parseIncoming(update);
    expect(result).toEqual({
      senderId: "12345",
      senderName: "Sean",
      text: "hello there",
    });
  });

  it("parseIncoming returns null for non-text messages", () => {
    const provider = new TelegramProvider();
    expect(provider.parseIncoming({ message: { chat: { id: 1 }, photo: [] } })).toBeNull();
  });

  it("parseIncoming returns null for non-owner messages when owner is set", () => {
    const prev = process.env.TELEGRAM_OWNER_ID;
    process.env.TELEGRAM_OWNER_ID = "99999";
    const provider = new TelegramProvider();
    const update = {
      message: {
        chat: { id: 12345 },
        from: { id: 12345, first_name: "Stranger" },
        text: "hey",
      },
    };
    expect(provider.parseIncoming(update)).toBeNull();
    process.env.TELEGRAM_OWNER_ID = prev;
  });

  it("parseIncoming returns null for malformed payload", () => {
    const provider = new TelegramProvider();
    expect(provider.parseIncoming(null)).toBeNull();
    expect(provider.parseIncoming({})).toBeNull();
  });

  it("getOwnerAddress returns TELEGRAM_OWNER_ID from env", () => {
    const prev = process.env.TELEGRAM_OWNER_ID;
    process.env.TELEGRAM_OWNER_ID = "12345";
    const provider = new TelegramProvider();
    expect(provider.getOwnerAddress()).toBe("12345");
    process.env.TELEGRAM_OWNER_ID = prev;
  });

  it("init throws if TELEGRAM_BOT_TOKEN is missing", async () => {
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    const prevOwner = process.env.TELEGRAM_OWNER_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_ID;

    const provider = new TelegramProvider();
    await expect(provider.init()).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);

    process.env.TELEGRAM_BOT_TOKEN = prevToken;
    process.env.TELEGRAM_OWNER_ID = prevOwner;
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/messaging/__tests__/telegram.test.ts`
Expected: FAIL — module not found

**Step 4: Write the Telegram provider implementation**

```typescript
import { Bot } from "grammy";
import type { MessagingProvider, ParsedMessage } from "./provider.js";

export class TelegramProvider implements MessagingProvider {
  name = "telegram";

  private bot: Bot | null = null;
  private ownerId = "";

  async init(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    this.ownerId = process.env.TELEGRAM_OWNER_ID || "";

    const missing = [];
    if (!token) missing.push("TELEGRAM_BOT_TOKEN");
    if (!this.ownerId) missing.push("TELEGRAM_OWNER_ID");
    if (missing.length > 0) {
      throw new Error(`Telegram provider missing env vars: ${missing.join(", ")}`);
    }

    this.bot = new Bot(token);
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.bot) throw new Error("Telegram provider not initialized");
    await this.bot.api.sendMessage(Number(to), text);
  }

  parseIncoming(payload: any): ParsedMessage | null {
    try {
      const msg = payload?.message;
      if (!msg?.text || !msg?.from) return null;

      const senderId = String(msg.from.id);
      if (this.ownerId && senderId !== this.ownerId) {
        const envOwner = process.env.TELEGRAM_OWNER_ID || "";
        if (envOwner && senderId !== envOwner) return null;
      }

      return {
        senderId,
        senderName: msg.from.first_name || "Unknown",
        text: msg.text,
      };
    } catch {
      return null;
    }
  }

  getOwnerAddress(): string {
    return this.ownerId || process.env.TELEGRAM_OWNER_ID || "";
  }

  getBot(): Bot | null {
    return this.bot;
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/messaging/__tests__/telegram.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add api/package.json api/package-lock.json api/src/services/messaging/telegram.ts api/src/services/messaging/__tests__/telegram.test.ts
git commit -m "feat: add Telegram provider using grammy"
```

---

### Task 4: Create the provider factory

**Files:**
- Create: `api/src/services/messaging/index.ts`
- Create: `api/src/services/messaging/__tests__/factory.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { createMessagingProvider } from "../index.js";

describe("createMessagingProvider", () => {
  it("returns TelegramProvider when MESSAGING_PROVIDER is 'telegram'", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    process.env.MESSAGING_PROVIDER = "telegram";
    const provider = createMessagingProvider();
    expect(provider.name).toBe("telegram");
    process.env.MESSAGING_PROVIDER = prev;
  });

  it("returns WhatsAppProvider when MESSAGING_PROVIDER is 'whatsapp'", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    process.env.MESSAGING_PROVIDER = "whatsapp";
    const provider = createMessagingProvider();
    expect(provider.name).toBe("whatsapp");
    process.env.MESSAGING_PROVIDER = prev;
  });

  it("defaults to TelegramProvider when MESSAGING_PROVIDER is unset", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    delete process.env.MESSAGING_PROVIDER;
    const provider = createMessagingProvider();
    expect(provider.name).toBe("telegram");
    process.env.MESSAGING_PROVIDER = prev;
  });

  it("throws for unknown provider", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    process.env.MESSAGING_PROVIDER = "signal";
    expect(() => createMessagingProvider()).toThrow(/Unknown messaging provider: signal/);
    process.env.MESSAGING_PROVIDER = prev;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/services/messaging/__tests__/factory.test.ts`
Expected: FAIL — module not found

**Step 3: Write the factory**

```typescript
export type { MessagingProvider, ParsedMessage } from "./provider.js";

import type { MessagingProvider } from "./provider.js";
import { TelegramProvider } from "./telegram.js";
import { WhatsAppProvider } from "./whatsapp.js";

export function createMessagingProvider(): MessagingProvider {
  const name = process.env.MESSAGING_PROVIDER || "telegram";

  switch (name) {
    case "telegram":
      return new TelegramProvider();
    case "whatsapp":
      return new WhatsAppProvider();
    default:
      throw new Error(`Unknown messaging provider: ${name}. Use 'telegram' or 'whatsapp'.`);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/services/messaging/__tests__/factory.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add api/src/services/messaging/index.ts api/src/services/messaging/__tests__/factory.test.ts
git commit -m "feat: add messaging provider factory with telegram default"
```

---

### Task 5: Update scheduler to use provider abstraction

**Files:**
- Modify: `api/src/services/scheduler.ts`

**Step 1: Update scheduler imports and signature**

Replace the `sendWhatsApp` import and `WHATSAPP_OWNER_JID` env reads with the provider parameter.

Change `startScheduler(pool)` signature to `startScheduler(pool, provider)`.

Updated `scheduler.ts`:

```typescript
import cron from "node-cron";
import type pg from "pg";
import { consolidateBriefing } from "./claude.js";
import type { MessagingProvider } from "./messaging/index.js";

export function startScheduler(db: pg.Pool, provider: MessagingProvider): void {
  const briefingCron = process.env.BRIEFING_CRON || "0 7 * * *";
  const alertCron = process.env.ALERT_CRON || "*/15 * * * *";
  const ownerAddress = provider.getOwnerAddress();

  if (!ownerAddress) {
    console.log("Scheduler: owner address not set, skipping cron jobs");
    return;
  }

  cron.schedule(briefingCron, () => {
    runMorningBriefing(db, provider, ownerAddress).catch((err) =>
      console.error("Morning briefing failed:", err)
    );
  });
  console.log(`Scheduler: morning briefing cron set to "${briefingCron}"`);

  cron.schedule(alertCron, () => {
    runUrgentAlerts(db, provider, ownerAddress).catch((err) =>
      console.error("Urgent alerts check failed:", err)
    );
  });
  console.log(`Scheduler: urgent alerts cron set to "${alertCron}"`);
}
```

Replace all `sendWhatsApp(ownerJid,` calls in `runMorningBriefing` and `runUrgentAlerts` with `provider.send(ownerAddress,`. Update their signatures to accept `provider: MessagingProvider` and `ownerAddress: string` instead of just `ownerJid: string`.

The `executeSubAgent` function does not use messaging — leave it unchanged.

**Step 2: Verify build compiles (will fail until index.ts is updated in next task)**

Run: `cd api && npx tsc --noEmit src/services/scheduler.ts` (expect type error for now — index.ts not yet updated)

**Step 3: Commit**

```bash
git add api/src/services/scheduler.ts
git commit -m "refactor: scheduler uses MessagingProvider instead of sendWhatsApp"
```

---

### Task 6: Update chat route to use provider abstraction

**Files:**
- Modify: `api/src/routes/chat.ts`

**Step 1: Update chat route to accept provider**

The webhook route is only needed for WhatsApp (Evolution API sends webhooks). For Telegram, grammy handles updates via long-polling internally. The route still needs to exist for WhatsApp mode.

Updated `chat.ts`:

```typescript
import { Router } from "express";
import type { DB } from "../db/client.js";
import type { MessagingProvider } from "../services/messaging/index.js";
import { handleChatMessage } from "../services/agent.js";

export function chatRouter(db: DB, provider: MessagingProvider): Router {
  const router = Router();

  // Webhook for providers that need it (WhatsApp/Evolution API)
  router.post("/webhook", (req, res) => {
    const msg = provider.parseIncoming(req.body);

    res.json({ ok: true });

    if (!msg) return;

    handleChatMessage(db, msg.senderId, msg.text)
      .then((response) => provider.send(msg.senderId, response))
      .catch((err) => {
        console.error("Chat agent error:", err);
        provider.send(msg.senderId, "Sorry, something went wrong. Try again.").catch(console.error);
      });
  });

  router.get("/history/:session_id", async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "50");
      const { rows } = await db.query(
        "SELECT role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2",
        [req.params.session_id, limit]
      );
      res.json({ messages: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

Key changes:
- Import `MessagingProvider` instead of `parseIncomingMessage`/`sendWhatsApp`
- `chatRouter` takes `provider` as second argument
- Uses `provider.parseIncoming()` instead of `parseIncomingMessage()`
- Uses `provider.send()` instead of `sendWhatsApp()`
- Owner check is handled inside `parseIncoming()` — removed the explicit `WHATSAPP_OWNER_JID` check

**Step 2: Commit**

```bash
git add api/src/routes/chat.ts
git commit -m "refactor: chat route uses MessagingProvider instead of sendWhatsApp"
```

---

### Task 7: Wire up index.ts with provider init and Telegram listener

**Files:**
- Modify: `api/src/index.ts`

**Step 1: Update index.ts**

```typescript
import express from "express";
import { contactsRouter } from "./routes/contacts.js";
import { briefingsRouter } from "./routes/briefings.js";
import { outreachRouter } from "./routes/outreach.js";
import { interactionsRouter } from "./routes/interactions.js";
import { subAgentsRouter } from "./routes/sub-agents.js";
import { importRouter } from "./routes/import.js";
import { chatRouter } from "./routes/chat.js";
import pool from "./db/client.js";
import { startScheduler } from "./services/scheduler.js";
import { createMessagingProvider } from "./services/messaging/index.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const provider = createMessagingProvider();

app.use("/api/contacts", contactsRouter(pool));
app.use("/api/briefings", briefingsRouter(pool));
app.use("/api/outreach", outreachRouter(pool));
app.use("/api/interactions", interactionsRouter(pool));
app.use("/api/sub-agents", subAgentsRouter(pool));
app.use("/api/import", importRouter(pool));
app.use("/api/chat", chatRouter(pool, provider));

const port = parseInt(process.env.API_PORT || "3000");
app.listen(port, process.env.API_HOST || "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
  console.log(`Messaging provider: ${provider.name}`);

  provider.init().then(() => {
    console.log(`${provider.name} provider initialized`);

    // For Telegram: set up message handler via grammy long-polling
    if (provider.name === "telegram") {
      import("./services/messaging/telegram.js").then(({ TelegramProvider }) => {
        const tg = provider as InstanceType<typeof TelegramProvider>;
        const bot = tg.getBot();
        if (!bot) return;

        const { handleChatMessage } = require("./services/agent.js");
        bot.on("message:text", async (ctx) => {
          const msg = provider.parseIncoming({ message: ctx.message });
          if (!msg) return;

          try {
            const response = await handleChatMessage(pool, msg.senderId, msg.text);
            await provider.send(msg.senderId, response);
          } catch (err) {
            console.error("Chat agent error:", err);
            await provider.send(msg.senderId, "Sorry, something went wrong. Try again.").catch(console.error);
          }
        });

        bot.start();
        console.log("Telegram bot started (long-polling)");
      });
    }

    startScheduler(pool, provider);
  }).catch((err) => {
    console.error(`Failed to initialize ${provider.name} provider:`, err.message);
    console.error("Scheduler will not start. Fix the configuration and restart.");
  });
});

export default app;
```

**Step 2: Verify the project compiles**

Run: `cd api && npx tsc --noEmit`
Expected: No errors

**Step 3: Run all tests**

Run: `cd api && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add api/src/index.ts
git commit -m "feat: wire up messaging provider factory in index.ts with Telegram listener"
```

---

### Task 8: Delete old messaging.ts and update old tests

**Files:**
- Delete: `api/src/services/messaging.ts`
- Delete: `api/src/services/__tests__/messaging.test.ts`

**Step 1: Verify no remaining imports of old messaging.ts**

Run: `grep -r "from.*services/messaging.js" api/src/ --include="*.ts"` — should return nothing (all updated in earlier tasks).
Run: `grep -r "from.*services/messaging" api/src/ --include="*.ts"` — should only show imports from `services/messaging/index.js` or `services/messaging/provider.js`.

**Step 2: Delete old files**

```bash
rm api/src/services/messaging.ts api/src/services/__tests__/messaging.test.ts
```

**Step 3: Run all tests to verify nothing is broken**

Run: `cd api && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -u api/src/services/messaging.ts api/src/services/__tests__/messaging.test.ts
git commit -m "refactor: remove old WhatsApp-only messaging module"
```

---

### Task 9: Update Docker Compose with profiles

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Move evolution-api under whatsapp profile and update api depends_on**

Updated `docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./postgres/init-evolution.sh:/docker-entrypoint-initdb.d/02-init-evolution.sh
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build: ./api
    environment:
      DATABASE_URL: ${DATABASE_URL}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      API_PORT: ${API_PORT:-3000}
      API_HOST: ${API_HOST:-0.0.0.0}
      EMBEDDING_MODEL: ${EMBEDDING_MODEL:-text-embedding-3-small}
      EMBEDDING_DIMENSIONS: ${EMBEDDING_DIMENSIONS:-1536}
      BRIEFING_HISTORY_COUNT: ${BRIEFING_HISTORY_COUNT:-5}
      BRIEFING_CRON: ${BRIEFING_CRON:-0 7 * * *}
      ALERT_CRON: ${ALERT_CRON:-*/15 * * * *}
      MESSAGING_PROVIDER: ${MESSAGING_PROVIDER:-telegram}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_OWNER_ID: ${TELEGRAM_OWNER_ID:-}
      EVOLUTION_API_URL: ${EVOLUTION_API_URL:-http://evolution-api:8080}
      EVOLUTION_API_KEY: ${EVOLUTION_API_KEY:-}
      EVOLUTION_INSTANCE: ${EVOLUTION_INSTANCE:-youai}
      WHATSAPP_OWNER_JID: ${WHATSAPP_OWNER_JID:-}
    ports:
      - "${API_PORT:-3000}:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  evolution-api:
    image: atendai/evolution-api:latest
    profiles:
      - whatsapp
    environment:
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/evolution
      CACHE_REDIS_ENABLED: "false"
      CACHE_LOCAL_ENABLED: "true"
    volumes:
      - evolution-data:/evolution/instances
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres-data:
  evolution-data:
```

Key changes:
- `evolution-api` gets `profiles: [whatsapp]` — only starts with `docker compose --profile whatsapp up`
- `api` no longer depends on `evolution-api`
- `api` environment adds `MESSAGING_PROVIDER`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`
- Channel-specific vars use empty defaults so they don't error when absent

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: move evolution-api behind whatsapp Docker Compose profile"
```

---

### Task 10: Update .env.example

**Files:**
- Modify: `.env.example`

**Step 1: Update .env.example with new provider vars**

```env
# Postgres
POSTGRES_USER=youai
POSTGRES_PASSWORD=changeme
POSTGRES_DB=youai
DATABASE_URL=postgresql://youai:changeme@postgres:5432/youai

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxx

# Messaging (default: telegram)
MESSAGING_PROVIDER=telegram

# Telegram (only needed if MESSAGING_PROVIDER=telegram)
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_ID=

# WhatsApp (only needed if MESSAGING_PROVIDER=whatsapp)
# Start with: docker compose --profile whatsapp up
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=changeme
EVOLUTION_INSTANCE=youai
WHATSAPP_OWNER_JID=

# API Service
API_PORT=3000
API_HOST=0.0.0.0

# Embeddings
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# OpenAI (optional — enables semantic/embedding-based contact search)
# OPENAI_API_KEY=sk-xxx

# Briefing
BRIEFING_HISTORY_COUNT=5
BRIEFING_CRON=0 7 * * *
ALERT_CRON=*/15 * * * *
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with messaging provider config"
```

---

### Task 11: Final integration verification

**Step 1: Run all tests**

Run: `cd api && npx vitest run`
Expected: All tests pass

**Step 2: Verify TypeScript compiles**

Run: `cd api && npx tsc --noEmit`
Expected: No errors

**Step 3: Verify Docker Compose is valid**

Run: `docker compose config --quiet`
Expected: No errors

**Step 4: Commit any remaining changes (if any)**

```bash
git status
```

If clean, this task is done.

**2026-03-23T21:35:48Z**

Tasks 1-10 complete. All unit tests pass, TypeScript compiles clean, Docker Compose validates.
