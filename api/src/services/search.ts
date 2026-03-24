import type pg from "pg";

export type SearchStrategy = "fuzzy_name" | "keyword" | "semantic" | "combined";

export interface SearchParams {
  strategy: SearchStrategy;
  query: string;
  strategies?: SearchStrategy[];
  embedding?: number[];
  limit?: number;
  threshold?: number;
}

export interface ContactResult {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
  source_databases: string[] | null;
  priority_ring: number;
  last_interaction_date: Date | null;
  score: number;
}

async function fuzzyNameSearch(
  db: pg.Pool,
  query: string,
  limit: number,
  threshold: number
): Promise<ContactResult[]> {
  const { rows } = await db.query(
    `SELECT *, similarity(name, $1) AS score
     FROM contacts
     WHERE similarity(name, $1) > $2
     ORDER BY score DESC
     LIMIT $3`,
    [query, threshold, limit]
  );
  return rows;
}

async function keywordSearch(
  db: pg.Pool,
  query: string,
  limit: number
): Promise<ContactResult[]> {
  const { rows } = await db.query(
    `SELECT *, ts_rank(full_tsvector, plainto_tsquery('english', $1)) AS score
     FROM contacts
     WHERE full_tsvector @@ plainto_tsquery('english', $1)
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit]
  );
  return rows;
}

async function semanticSearch(
  db: pg.Pool,
  embedding: number[],
  limit: number,
  threshold: number
): Promise<ContactResult[]> {
  const { rows } = await db.query(
    `SELECT *, 1 - (embedding <=> $1::vector) AS score
     FROM contacts
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) > $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(embedding), threshold, limit]
  );
  return rows;
}

function applySourceBoost(results: ContactResult[]): ContactResult[] {
  for (const r of results) {
    const sourceCount = r.source_databases?.length ?? 1;
    r.score += 0.05 * (sourceCount - 1);
  }
  return results.sort((a, b) => b.score - a.score);
}

function dedupeByContact(results: ContactResult[]): ContactResult[] {
  const seen = new Map<string, ContactResult>();
  for (const r of results) {
    const existing = seen.get(r.id);
    if (!existing || r.score > existing.score) {
      seen.set(r.id, r);
    }
  }
  return Array.from(seen.values());
}

export async function searchContacts(
  db: pg.Pool,
  params: SearchParams
): Promise<ContactResult[]> {
  const limit = params.limit || 10;
  const threshold = params.threshold || 0.3;

  if (params.strategy === "fuzzy_name") {
    return applySourceBoost(await fuzzyNameSearch(db, params.query, limit, threshold));
  }

  if (params.strategy === "keyword") {
    return applySourceBoost(await keywordSearch(db, params.query, limit));
  }

  if (params.strategy === "semantic") {
    if (!params.embedding) throw new Error("Semantic search requires an embedding");
    return applySourceBoost(await semanticSearch(db, params.embedding, limit, threshold));
  }

  // Combined: run requested strategies in parallel, merge
  const strategies = params.strategies || ["fuzzy_name", "keyword"];
  const promises: Promise<ContactResult[]>[] = [];

  if (strategies.includes("fuzzy_name")) {
    promises.push(fuzzyNameSearch(db, params.query, limit, threshold));
  }
  if (strategies.includes("keyword")) {
    promises.push(keywordSearch(db, params.query, limit));
  }
  if (strategies.includes("semantic") && params.embedding) {
    promises.push(semanticSearch(db, params.embedding, limit, threshold));
  }

  const allResults = (await Promise.all(promises)).flat();
  return applySourceBoost(dedupeByContact(allResults)).slice(0, limit);
}
