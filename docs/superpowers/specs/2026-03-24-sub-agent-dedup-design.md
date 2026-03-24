# Sub-Agent Deduplication — Design Spec

## Overview

Prevent duplicate sub-agents by validating new agents against existing ones before creation. When overlap is detected, suggest merging the new config items into the existing agent instead of creating a duplicate.

**Key decisions:**
- Shared validation service function called by all creation paths
- Overlap detection based on config array intersection per type
- Merge suggestion (not block) — return the existing agent ID so the caller can merge
- No DB constraint — the logic is too nuanced for a unique index

---

## 1. Validation Service

**File:** `api/src/services/sub-agent-validation.ts`

### `validateSubAgent(db, type, config, userId)`

Queries all active sub-agents of the same `type` for the user, then checks for config overlap.

**Overlap rules by type:**

| Type | Config key | Overlap check |
|------|-----------|---------------|
| `github_activity` | `config.repos` | Any repo string appears in an existing agent's `repos` array |
| `market_tracker` | `config.assets` | Any asset string appears in an existing agent's `assets` array |
| `financial_tracker` | `config.symbols` | Any symbol string appears in an existing agent's `symbols` array |
| `rss_feed` | `config.urls` | Any URL string appears in an existing agent's `urls` array |
| `web_search` | `config.query` or `config.queries` | Any query string matches an existing agent's query/queries |
| `network_activity` | (none) | Any active agent of this type already exists |
| `custom` | `config.prompt` | Exact prompt string match with an existing agent |

**Return type:**

```typescript
type ValidationResult =
  | { ok: true }
  | { ok: false; existingAgent: { id: string; name: string }; overlappingItems: string[]; suggestion: "merge" };
```

When overlap is found, returns the first matching existing agent and the list of overlapping items.

### `mergeSubAgentConfig(db, existingId, newConfig, type)`

Merges new config items into an existing agent's config, deduplicating arrays. For example, if the existing `github_activity` agent has `repos: ["a/b"]` and the new config has `repos: ["a/b", "c/d"]`, the result is `repos: ["a/b", "c/d"]`.

Uses the existing `UPDATE sub_agents SET config = ...` pattern.

---

## 2. API Route (`POST /api/sub-agents`)

Before inserting, call `validateSubAgent`. If overlap is found, return HTTP 409:

```json
{
  "error": "Overlapping configuration detected",
  "overlapping_items": ["shapeshift/web"],
  "existing_agent": { "id": "uuid", "name": "ShapeShift GitHub Activity" },
  "suggestion": "merge",
  "merge_url": "/api/sub-agents/{id}"
}
```

The client can then choose to merge by PATCHing the existing agent with the additional config items.

---

## 3. Chat Agent Tool (`sub_agent_management` in `agent.ts`)

In the `create` action, call `validateSubAgent` before inserting. If overlap is found, automatically merge by calling `mergeSubAgentConfig` and return a message like:

> "The repo shapeshift/web is already tracked by 'ShapeShift GitHub Activity'. I've added the new repos to that existing topic instead."

The chat agent should handle this transparently — no need to ask the user, just merge and report.

---

## 4. Dashboard (Frontend)

When the settings page `POST /api/sub-agents` returns a 409, display the error with context:

> "shapeshift/web is already tracked by 'ShapeShift GitHub Activity'. Would you like to add the new items to that source instead?"

With a "Merge" button that calls `PATCH /api/sub-agents/:id` with the merged config.

This is a small change to the existing settings page error handling — no new components needed.
