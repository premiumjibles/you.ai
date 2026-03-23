import cron from "node-cron";
import type pg from "pg";
import { consolidateBriefing } from "./claude.js";
import { sendWhatsApp } from "./messaging.js";

export function startScheduler(db: pg.Pool): void {
  const briefingCron = process.env.BRIEFING_CRON || "0 7 * * *";
  const alertCron = process.env.ALERT_CRON || "*/15 * * * *";
  const ownerJid = process.env.WHATSAPP_OWNER_JID;

  if (!ownerJid) {
    console.log("Scheduler: WHATSAPP_OWNER_JID not set, skipping cron jobs");
    return;
  }

  // Morning briefing
  cron.schedule(briefingCron, () => {
    runMorningBriefing(db, ownerJid).catch((err) =>
      console.error("Morning briefing failed:", err)
    );
  });
  console.log(`Scheduler: morning briefing cron set to "${briefingCron}"`);

  // Urgent alerts
  cron.schedule(alertCron, () => {
    runUrgentAlerts(db, ownerJid).catch((err) =>
      console.error("Urgent alerts check failed:", err)
    );
  });
  console.log(`Scheduler: urgent alerts cron set to "${alertCron}"`);
}

async function runMorningBriefing(
  db: pg.Pool,
  ownerJid: string
): Promise<void> {
  const { rows: agents } = await db.query(
    "SELECT * FROM sub_agents WHERE user_id = 'sean' AND active = true"
  );

  if (agents.length === 0) {
    await sendWhatsApp(
      ownerJid,
      "Good morning! No briefing topics configured yet. Send me a message to add topics."
    );
    return;
  }

  const outputs: { name: string; output: string }[] = [];

  for (const agent of agents) {
    try {
      const output = await executeSubAgent(db, agent);
      outputs.push({ name: agent.name, output });
    } catch {
      outputs.push({
        name: agent.name,
        output: `[Error: failed to fetch data for ${agent.name}]`,
      });
    }
  }

  const { rows: history } = await db.query(
    "SELECT date::text, content FROM briefings WHERE user_id = 'sean' ORDER BY date DESC LIMIT $1",
    [parseInt(process.env.BRIEFING_HISTORY_COUNT || "5")]
  );

  const content = await consolidateBriefing(outputs, history);

  await db.query(
    "INSERT INTO briefings (user_id, content, sub_agent_outputs) VALUES ('sean', $1, $2)",
    [content, JSON.stringify(outputs)]
  );

  await sendWhatsApp(ownerJid, content);
}

async function executeSubAgent(db: pg.Pool, agent: any): Promise<string> {
  const config = agent.config || {};

  switch (agent.type) {
    case "market_tracker": {
      const assets = config.assets || ["bitcoin", "ethereum"];
      const ids = assets.join(",");
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );
      if (!res.ok) return "Failed to fetch market data.";
      const data = await res.json();
      const lines = Object.entries(data).map(
        ([id, info]: [string, any]) =>
          `${id}: $${info.usd?.toLocaleString()} (${info.usd_24h_change?.toFixed(1)}% 24h)`
      );
      return lines.join("\n");
    }

    case "network_activity": {
      const { rows } = await db.query(
        "SELECT c.name, i.summary, i.created_at FROM interactions i JOIN contacts c ON c.id = i.contact_id WHERE i.created_at > NOW() - INTERVAL '24 hours' ORDER BY i.created_at DESC LIMIT 10"
      );
      if (rows.length === 0) return "No network activity in the last 24 hours.";
      const lines = rows.map(
        (r: any) =>
          `- ${r.name}: ${r.summary || "interaction recorded"} (${new Date(r.created_at).toLocaleTimeString()})`
      );
      return lines.join("\n");
    }

    case "custom": {
      if (config.prompt) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{ role: "user", content: config.prompt }],
        });
        return response.content[0].type === "text"
          ? response.content[0].text
          : "";
      }
      return "Custom topic configured but no prompt set.";
    }

    default:
      return `Unknown sub-agent type: ${agent.type}`;
  }
}

async function runUrgentAlerts(
  db: pg.Pool,
  ownerJid: string
): Promise<void> {
  const { rows: agents } = await db.query(
    "SELECT * FROM sub_agents WHERE user_id = 'sean' AND active = true"
  );

  for (const agent of agents) {
    const config = agent.config || {};
    if (!config.alert_threshold) continue;

    const threshold = parseFloat(config.alert_threshold);
    const current = parseFloat(config.current_value);
    const previous = parseFloat(config.previous_value);

    if (!previous || previous === 0) continue;

    const change = ((current - previous) / previous) * 100;

    if (Math.abs(change) >= threshold) {
      const direction = change > 0 ? "up" : "down";
      const message = `Alert: ${agent.name}\n${config.metric || "Value"} is ${direction} ${Math.abs(change).toFixed(1)}%\nCurrent: ${current}\nPrevious: ${previous}\nThreshold: ${threshold}%`;
      await sendWhatsApp(ownerJid, message);
    }
  }
}
