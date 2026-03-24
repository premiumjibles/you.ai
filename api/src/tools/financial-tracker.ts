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

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
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
      return `${name} (${symbol}): $${price.toLocaleString()} (${sign}${changePercent.toFixed(1)}%)`;
    })
  );

  const lines = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  for (const r of results) {
    if (r.status === "rejected") {
      console.warn(`financial_tracker: ${r.reason?.message || r.reason}`);
    }
  }

  return lines.length > 0
    ? lines.join("\n")
    : "Failed to fetch financial data for all symbols.";
}
