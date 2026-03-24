---
id: y-yeyn
status: closed
deps: [y-kyjx]
links: []
created: 2026-03-24T00:23:11Z
type: feature
priority: 2
assignee: Jibles
---
# Financial market data sub-agent

## Objective

Add a `financial_tracker` sub-agent type for traditional market data (stocks, commodities, forex) via Alpha Vantage or Yahoo Finance free APIs. The existing `market_tracker` only covers crypto via CoinGecko — the MVP doc specifically calls for commodity prices and portfolio stock tickers.

## User Story

As a user tracking a portfolio of public equities and commodities, I want my morning briefing to include price changes for stocks and commodities alongside crypto, so I get a complete market picture.

## Context & Findings

- The `market_tracker` case in `scheduler.ts` is the direct pattern to follow — it fetches CoinGecko, formats prices + 24h changes.
- Alpha Vantage free tier: 25 requests/day. `TIME_SERIES_DAILY` endpoint returns daily OHLCV. `CURRENCY_EXCHANGE_RATE` for forex. Simple REST, JSON response, API key required.
- Yahoo Finance via `yahoo-finance2` npm package (MIT, 200K weekly): `quote()` returns price, change, changePercent, marketState. No API key needed. More generous rate limits.
- Recommendation: use `yahoo-finance2` as primary (no key needed, good rate limits), with Alpha Vantage as optional for commodities/forex.
- Config shape: `{ symbols: ["AAPL", "TSLA", "GC=F"], provider?: "yahoo" | "alpha_vantage" }`. Yahoo Finance commodity symbols use futures notation (GC=F for gold, CL=F for crude oil).
- The urgent alerts system (`runUrgentAlerts` in scheduler.ts) already compares current vs previous values and sends threshold alerts — `financial_tracker` should store its output in the same format so threshold alerts work for stocks too.
- Rejected: building a unified market service that merges crypto + stocks — keep them as separate sub-agent types for simplicity, the briefing consolidation handles merging.

## Files

- `api/src/services/scheduler.ts` — add `case "financial_tracker"` in `executeSubAgent` switch. Use yahoo-finance2 `quote()` for each symbol, format as "SYMBOL: $PRICE (±CHANGE%)".
- `api/src/services/agent.ts` — update system prompt to list `financial_tracker` as a valid sub-agent type with config example.
- `api/package.json` — add `yahoo-finance2` dependency.
- `.env.example` — add optional `ALPHA_VANTAGE_API_KEY=` entry.

Reference patterns:
- `market_tracker` case in `api/src/services/scheduler.ts` — follow this exactly, same output format style.

## Acceptance Criteria

- [ ] `yahoo-finance2` added to api/package.json dependencies
- [ ] `executeSubAgent` handles `financial_tracker` type: fetches quotes for each symbol in `config.symbols`
- [ ] Output includes symbol, current price, daily change %, formatted consistently with market_tracker output
- [ ] Handles invalid symbols gracefully (log warning, skip, continue with valid ones)
- [ ] Works with stock symbols (AAPL), commodity futures (GC=F), and index symbols (^GSPC)
- [ ] System prompt in agent.ts lists `financial_tracker` as valid type with config example
- [ ] Urgent alerts can detect threshold breaches on financial_tracker sub-agents (same output structure as market_tracker)
- [ ] Lint and type-check pass

## Gotchas

- yahoo-finance2 v2 has breaking changes from v1 — use v2 API (`import yahooFinance from 'yahoo-finance2'` then `yahooFinance.quote(symbol)`)
- Commodity symbols in Yahoo Finance use futures notation: gold = GC=F, oil = CL=F, silver = SI=F
- Markets are closed on weekends — quote() still returns last known price but change% may be 0. Don't treat this as an error.
- yahoo-finance2 may log warnings to console about deprecated cookies — these are harmless but noisy
- The urgent alert threshold comparison (`runUrgentAlerts`) parses sub-agent output text — make sure the financial_tracker output format includes a parseable percentage change (e.g., "+2.5%" or "-3.1%")
