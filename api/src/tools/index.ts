import type Anthropic from "@anthropic-ai/sdk";

export { fetchGithubActivity } from "./github-activity.js";
export { fetchMarketData } from "./market-tracker.js";
export { fetchFinancialData } from "./financial-tracker.js";
export { fetchRssFeeds } from "./rss-feed.js";
export { fetchNetworkActivity } from "./network-activity.js";

import { toolDef as githubActivity } from "./github-activity.js";
import { toolDef as marketTracker } from "./market-tracker.js";
import { toolDef as financialTracker } from "./financial-tracker.js";
import { toolDef as rssFeed } from "./rss-feed.js";
import { toolDef as networkActivity } from "./network-activity.js";

export const dataTools: Anthropic.Tool[] = [
  githubActivity,
  marketTracker,
  financialTracker,
  rssFeed,
  networkActivity,
];
