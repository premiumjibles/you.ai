---
id: y-kois
status: closed
deps: []
links: []
created: 2026-03-24T00:23:48Z
type: feature
priority: 2
assignee: Jibles
---
# Investment memo / one-pager generation

## Objective

Add an endpoint to generate investment memos / one-pagers for a given company, synthesizing contact data, interaction history, and web search results into a structured document. The SOW lists "on-demand creation of investment memos or One-Pagers for portfolio companies" as a deliverable.

## User Story

As a user managing portfolio companies, I want to say "generate a one-pager for CompanyX" and get a structured investment memo pulling from my contacts at that company, my interaction history, and current web info about them.

## Context & Findings

- The outreach drafting pattern (`api/src/routes/outreach.ts` + `api/src/services/claude.ts`) is the closest reference: it searches contacts, fetches interactions, then calls Claude with structured context. This ticket follows the same pattern with a different prompt and output format.
- Contact search can find all contacts at a company via keyword strategy on the company field.
- Interaction history per contact is already fetchable (used in outreach drafting).
- Web search via Tavily (`api/src/services/search-web.ts`) can pull current info about the company (recent news, funding, etc.). This depends on y-fstb being merged, but the endpoint should gracefully degrade if web search isn't configured.
- The chat agent should also be able to trigger memo generation as a tool, so users can request it conversationally.
- Output format: structured markdown with sections (Company Overview, Key Contacts, Recent Activity, Current News, Notes).

## Files

- `api/src/routes/outreach.ts` — add `POST /api/outreach/memo` route. Takes `{ company: string, include_web?: boolean }`. Searches contacts by company, fetches interactions, optionally does web search, calls Claude to generate memo.
- `api/src/services/claude.ts` — add `buildMemoPrompt()` and `generateMemo()` functions following the `buildOutreachPrompt()`/`draftOutreach()` pattern. Claude Sonnet is appropriate here (analytical, not creative).
- `api/src/services/agent.ts` — add `generate_memo` tool to the chat agent tools array and executeTool switch.

Reference patterns:
- `POST /api/outreach/draft` route in `api/src/routes/outreach.ts` — same fetch-contacts-then-call-Claude pattern.
- `buildOutreachPrompt()` in `api/src/services/claude.ts` — prompt construction pattern.
- Tool definitions in `api/src/services/agent.ts` — tool schema and executeTool pattern.

## Acceptance Criteria

- [ ] `POST /api/outreach/memo` accepts `{ company, include_web? }` and returns structured markdown memo
- [ ] Memo includes sections: Company Overview, Key Contacts (names + roles), Recent Interactions, Current News (if web search available), Summary
- [ ] Contacts are found via keyword search on company name
- [ ] Up to 5 recent interactions per contact are included as context
- [ ] Web search is attempted if `include_web: true` and Tavily is configured; gracefully skipped otherwise
- [ ] Chat agent has `generate_memo` tool that triggers memo generation
- [ ] Returns useful output even with minimal data (e.g., just contacts, no interactions)
- [ ] Lint and type-check pass

## Gotchas

- Company name matching is fuzzy — "Google" might match "Google Cloud", "Alphabet/Google", etc. Use keyword search not exact match, and let Claude reconcile in the prompt.
- If no contacts found for a company, the endpoint should still work (web search + a note that no contacts are in the database) rather than returning an error.
- Token budget: with many contacts and interactions this prompt can get large. Limit to top 10 contacts and 5 interactions each.
- The memo prompt should instruct Claude to clearly label what's from the user's data vs. what's from web search, so the user knows what's verified vs. public info.
