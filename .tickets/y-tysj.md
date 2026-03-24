---
id: y-tysj
status: closed
deps: []
links: []
created: 2026-03-24T00:23:26Z
type: feature
priority: 2
assignee: Jibles
---
# Multi-source contact scoring boost

## Objective

Boost contact search ranking based on how many data sources a contact appears in. The MVP doc states contacts that "show up across multiple databases score higher" — the `source_databases` TEXT[] column already tracks this but search scoring ignores it.

## Context & Findings

- `source_databases` is a TEXT[] column on the `contacts` table, populated during dedup/merge in `api/src/services/dedup.ts`. When contacts are merged, source arrays are concatenated and deduped.
- Search scoring happens in `api/src/services/search.ts`. The `searchContacts()` function runs strategy-specific queries, each returning rows with a `score` field. Results are deduped by contact ID keeping the highest score.
- The change is small: after dedup, apply a source-count boost to each result's score. Something like `score += 0.05 * (source_databases.length - 1)` so single-source contacts get no boost and multi-source contacts rise in ranking.
- The `source_databases` column is already returned by all three search strategies (fuzzy, keyword, semantic) since they SELECT from contacts.
- Rejected: making source count its own search strategy — overkill, it's a ranking signal not a retrieval method.

## Files

- `api/src/services/search.ts` — modify the dedup/merge step in `searchContacts()` to add a source-count boost to scores. The `source_databases` field needs to be included in the SELECT if not already, and used post-dedup to adjust scores.

Reference patterns:
- Score handling in `api/src/services/search.ts` — the dedup logic that keeps max score per contact ID.

## Acceptance Criteria

- [ ] Contacts appearing in 2+ source databases receive a score boost proportional to source count
- [ ] Single-source contacts receive no boost (baseline behavior unchanged)
- [ ] Boost is additive and doesn't dominate the primary search relevance score (e.g., 0.05 per additional source)
- [ ] `source_databases` is included in search result SELECT statements if not already present
- [ ] Search results still sort by score descending
- [ ] Lint and type-check pass

## Gotchas

- The boost coefficient should be small enough that a 5-source contact with low relevance doesn't outrank a 1-source contact with high relevance. 0.05 per extra source means a 5-source contact gets +0.2, which is meaningful but not dominant given scores typically range 0.3-1.0.
- `source_databases` may be NULL for contacts ingested before the column was populated — treat NULL as length 1.
