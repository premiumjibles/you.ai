import type Anthropic from "@anthropic-ai/sdk";

export const toolDef: Anthropic.Tool = {
  name: "market_tracker",
  description:
    "Fetches current cryptocurrency prices and 24-hour changes from CoinGecko. Use when the user asks about crypto prices or market data.",
  input_schema: {
    type: "object" as const,
    properties: {
      assets: {
        type: "array",
        items: { type: "string" },
        description: 'CoinGecko asset IDs (default ["bitcoin", "ethereum"])',
      },
    },
  },
};

export async function fetchMarketData(params: {
  assets?: string[];
}): Promise<string> {
  const assets = params.assets || ["bitcoin", "ethereum"];
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
