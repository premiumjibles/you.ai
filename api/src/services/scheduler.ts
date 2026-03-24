import cron from "node-cron";
import type pg from "pg";
import { consolidateBriefing } from "./claude.js";
import type { MessagingProvider } from "./messaging/index.js";
import { searchWeb } from "./search-web.js";
import {
  fetchGithubActivity,
  fetchMarketData,
  fetchFinancialData,
  fetchRssFeeds,
  fetchNetworkActivity,
} from "../tools/index.js";

export function getUserLocalTime(now: Date, timezone: string): string {
  return now.toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isWithinBriefingWindow(briefingTime: string, currentTime: string): boolean {
  const [bH, bM] = briefingTime.split(":").map(Number);
  const [cH, cM] = currentTime.split(":").map(Number);
  const briefingMin = bH * 60 + bM;
  const currentMin = cH * 60 + cM;
  let diff = currentMin - briefingMin;
  if (diff < -1435) diff += 1440; // handle midnight rollover (1440 = 24*60)
  return diff >= 0 && diff < 5;
}

export function startScheduler(db: pg.Pool, provider: MessagingProvider): void {
  const briefingCron = process.env.BRIEFING_CRON || "0 7 * * *";
  const alertCron = process.env.ALERT_CRON || "*/15 * * * *";
  const ownerAddress = provider.getOwnerAddress();

  if (!ownerAddress) {
    console.log("Scheduler: owner address not set, skipping cron jobs");
    return;
  }

  // Morning briefing
  cron.schedule(briefingCron, () => {
    runMorningBriefing(db, provider, ownerAddress).catch((err) =>
      console.error("Morning briefing failed:", err)
    );
  });
  console.log(`Scheduler: morning briefing cron set to "${briefingCron}"`);

  // Urgent alerts
  cron.schedule(alertCron, () => {
    runUrgentAlerts(db, provider, ownerAddress).catch((err) =>
      console.error("Urgent alerts check failed:", err)
    );
  });
  console.log(`Scheduler: urgent alerts cron set to "${alertCron}"`);
}

export async function generateBriefing(db: pg.Pool): Promise<string> {
  const { rows: agents } = await db.query(
    "SELECT * FROM sub_agents WHERE user_id = 'sean' AND active = true"
  );

  if (agents.length === 0) {
    return "No briefing topics configured yet. Send me a message to add topics.";
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

  return content;
}

export async function runMorningBriefing(
  db: pg.Pool,
  provider: MessagingProvider,
  ownerAddress: string
): Promise<void> {
  const content = await generateBriefing(db);
  await provider.send(ownerAddress, content);
}

async function executeSubAgent(db: pg.Pool, agent: any): Promise<string> {
  const config = agent.config || {};

  switch (agent.type) {
    case "market_tracker":
      return await fetchMarketData({ assets: config.assets });

    case "financial_tracker":
      return await fetchFinancialData({ symbols: config.symbols || ["AAPL", "TSLA"] });

    case "network_activity":
      return await fetchNetworkActivity(db, {});

    case "web_search": {
      const queries: string[] = config.queries || (config.query ? [config.query] : [agent.name]);
      const allResults: { title: string; url: string; content: string }[] = [];
      for (const query of queries) {
        try {
          const results = await searchWeb(query, { searchDepth: config.search_depth });
          allResults.push(...results);
        } catch (err: any) {
          console.warn(`web_search: failed for query "${query}": ${err.message}`);
        }
      }
      if (allResults.length === 0) return "No web results found.";
      const lines = allResults.map(
        (r) => `**${r.title}**\n${r.url}\n${r.content}`
      );
      return lines.join("\n\n");
    }

    case "github_activity":
      return await fetchGithubActivity({ repos: config.repos || [], include_prs: config.include_prs });

    case "rss_feed":
      return await fetchRssFeeds({ urls: config.urls || [], max_items: config.max_items });

    case "custom": {
      if (config.prompt) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          system: `You are a briefing sub-agent producing one section of a daily briefing. Today's date: ${new Date().toISOString().split("T")[0]}. Respond with a concise plain-text report (under 300 words). No markdown formatting. You have no internet access and cannot look up current events. If the prompt requires real-time data you do not have, state that clearly and provide what background context you can from your training data.`,
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
  provider: MessagingProvider,
  ownerAddress: string
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
      await provider.send(ownerAddress, message);
    }
  }
}
