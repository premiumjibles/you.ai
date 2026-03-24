const MAX_CONTENT_LENGTH = 500;

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export async function searchWeb(
  query: string,
  opts?: { searchDepth?: "basic" | "advanced" }
): Promise<SearchResult[]> {
  const maxResults = opts?.searchDepth === "advanced" ? 15 : 10;
  const baseUrl = process.env.SEARXNG_URL || "http://searxng:8080";
  const params = new URLSearchParams({
    q: query,
    format: "json",
    language: "en",
    categories: "general",
  });

  if (opts?.searchDepth === "advanced") {
    params.set("categories", "general,news,it,science");
  }

  const res = await fetch(`${baseUrl}/search?${params}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SearXNG error (${res.status}): ${text}`);
  }

  const data = await res.json();

  // SearXNG returns results pre-sorted by score (multi-engine agreement).
  // Deduplicate by normalized URL.
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const r of data.results || []) {
    const url: string = r.url || "";
    if (!url || !r.title) continue;
    const key = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      title: r.title,
      url,
      content: (r.content || "").slice(0, MAX_CONTENT_LENGTH),
    });
    if (results.length >= maxResults) break;
  }

  return results;
}
