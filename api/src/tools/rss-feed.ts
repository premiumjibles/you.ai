import type Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";

export const toolDef: Anthropic.Tool = {
  name: "rss_feed",
  description:
    "Fetches and filters recent items from RSS or Atom feeds. Use when the user asks to check a blog, news feed, or any RSS source.",
  input_schema: {
    type: "object" as const,
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description: "RSS/Atom feed URLs to fetch",
      },
      max_items: {
        type: "number",
        description: "Maximum items to return (default 10)",
      },
      since_hours: {
        type: "number",
        description: "Only include items from the last N hours (default 24)",
      },
    },
    required: ["urls"],
  },
};

export async function fetchRssFeeds(params: {
  urls: string[];
  max_items?: number;
  since_hours?: number;
}): Promise<string> {
  const { urls, max_items = 10, since_hours = 24 } = params;
  if (urls.length === 0) return "No RSS feed URLs provided.";

  const parser = new Parser({ timeout: 15000 });
  const cutoff = Date.now() - since_hours * 60 * 60 * 1000;
  const allItems: { title: string; link: string; source: string; pubDate?: number }[] = [];

  const feedResults = await Promise.allSettled(
    urls.map(async (url) => {
      const feed = await parser.parseURL(url);
      const source = feed.title || new URL(url).hostname;
      return feed.items.map((item) => {
        const pub = item.pubDate ? new Date(item.pubDate).getTime() : NaN;
        return {
          title: item.title || "Untitled",
          link: item.link || url,
          source,
          pubDate: Number.isNaN(pub) ? undefined : pub,
        };
      });
    })
  );

  for (const r of feedResults) {
    if (r.status === "fulfilled") {
      allItems.push(...r.value);
    } else {
      console.warn(`RSS: failed to fetch feed: ${r.reason?.message || r.reason}`);
    }
  }

  if (allItems.length === 0) return "No RSS items found.";

  const hasAnyDates = allItems.some((i) => i.pubDate !== undefined);
  let filtered = hasAnyDates
    ? allItems.filter((i) => i.pubDate !== undefined && i.pubDate > cutoff)
    : allItems;

  if (filtered.length === 0) filtered = allItems;
  filtered = filtered
    .sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
    .slice(0, max_items);

  const lines = filtered.map((i) => `- ${i.title} — ${i.source} (${i.link})`);
  return lines.join("\n");
}
