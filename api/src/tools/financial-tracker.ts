import type Anthropic from "@anthropic-ai/sdk";

export const toolDef: Anthropic.Tool = {
  name: "financial_tracker",
  description:
    "Fetches current stock and commodity prices with daily percentage changes from Yahoo Finance. Use when the user asks about stock prices or financial instruments.",
  input_schema: {
    type: "object" as const,
    properties: {
      symbols: {
        type: "array",
        items: { type: "string" },
        description: 'Ticker symbols (e.g. ["AAPL", "GC=F"])',
      },
    },
    required: ["symbols"],
  },
};

export async function fetchFinancialData(params: {
  symbols: string[];
}): Promise<string> {
  const symbols = params.symbols;
  const lines: string[] = [];

  for (const symbol of symbols) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta) throw new Error("No data returned");
      const price = meta.regularMarketPrice ?? 0;
      const prevClose = meta.chartPreviousClose ?? 0;
      const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
      const sign = changePercent >= 0 ? "+" : "";
      const name = meta.longName || meta.shortName || symbol;
      lines.push(
        `${name} (${symbol}): $${price.toLocaleString()} (${sign}${changePercent.toFixed(1)}%)`
      );
    } catch (err: any) {
      console.warn(`financial_tracker: failed to fetch ${symbol}: ${err.message}`);
    }
  }

  return lines.length > 0
    ? lines.join("\n")
    : "Failed to fetch financial data for all symbols.";
}
