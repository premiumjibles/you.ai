import express from "express";
import path from "path";
import { contactsRouter } from "./routes/contacts.js";
import { briefingsRouter } from "./routes/briefings.js";
import { outreachRouter } from "./routes/outreach.js";
import { interactionsRouter } from "./routes/interactions.js";
import { subAgentsRouter } from "./routes/sub-agents.js";
import { importRouter } from "./routes/import.js";
import { chatRouter } from "./routes/chat.js";
import { settingsRouter } from "./routes/settings.js";
import { githubRouter } from "./routes/github.js";
import pool from "./db/client.js";
import { startScheduler } from "./services/scheduler.js";
import { createMessagingProvider } from "./services/messaging/index.js";
import { processIncomingMessage } from "./services/messaging/handler.js";

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
app.use("/api/settings", settingsRouter(pool));
app.use("/api/github", githubRouter(pool));

// Serve dashboard static files
const dashboardPath = path.join(__dirname, "../../dashboard/dist");
app.use(express.static(dashboardPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(dashboardPath, "index.html"));
});

const port = parseInt(process.env.API_PORT || "3000");
app.listen(port, process.env.API_HOST || "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
  console.log(`Messaging provider: ${provider.name}`);

  provider.init().then(() => {
    console.log(`${provider.name} provider initialized`);

    if (provider.name === "telegram") {
      import("./services/messaging/telegram.js").then(({ TelegramProvider }) => {
        const tg = provider as InstanceType<typeof TelegramProvider>;
        const bot = tg.getBot();
        if (!bot) return;

        bot.on("message:text", async (ctx) => {
          const msg = provider.parseIncoming({ message: ctx.message });
          if (!msg) return;

          await processIncomingMessage(pool, provider, msg);
        });

        bot.start();
        console.log("Telegram bot started (long-polling)");
      });
    }

    startScheduler(pool, provider);
  }).catch((err: any) => {
    console.error(`Failed to initialize ${provider.name} provider:`, err.message);
    console.error("Scheduler will not start. Fix the configuration and restart.");
  });
});

export default app;
