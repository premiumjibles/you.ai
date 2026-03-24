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
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("Web search is not configured — set TAVILY_API_KEY to enable it.");
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: opts?.searchDepth || "advanced",
      max_results: 5,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    content: (r.content || "").slice(0, MAX_CONTENT_LENGTH),
  }));
}
