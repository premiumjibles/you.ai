import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { apiFetch } from "../api";

interface RepoCardProps {
  repo: string;
  commits: { message: string; author: string }[];
  prs: { number: number; title: string; author: string }[];
}

export function RepoCard({ repo, commits, prs }: RepoCardProps) {
  const [showCommits, setShowCommits] = useState(prs.length === 0);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const res = await apiFetch<{ summary: string }>("/api/github/summary", {
        method: "POST",
        body: JSON.stringify({ repo, commits, prs }),
      });
      setSummary(res.summary);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="rounded-lg bg-[#111118] border border-[#1e1e2e] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-[#e2e8f0]">{repo}</h3>
        <a href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer" className="text-[#666] hover:text-[#999] transition-colors">
          <ExternalLink size={16} />
        </a>
      </div>

      {prs.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-[#f59e0b] mb-2">Merged PRs</div>
          <ul className="space-y-1.5">
            {prs.map((pr) => (
              <li key={pr.number} className="text-sm text-[#999]">
                <a href={`https://github.com/${repo}/pull/${pr.number}`} target="_blank" rel="noopener noreferrer" className="text-[#e2e8f0] hover:text-indigo-400 transition-colors">
                  #{pr.number}: {pr.title}
                </a>
                <span className="text-[#666]"> by {pr.author}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {commits.length > 0 && (
        <div>
          <button onClick={() => setShowCommits(!showCommits)} className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#666] hover:text-[#999] mb-2">
            Commits ({commits.length})
            {showCommits ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showCommits && (
            <ul className="space-y-1.5">
              {commits.map((c, i) => (
                <li key={i} className="text-sm text-[#999]">
                  <span className="text-[#e2e8f0]">{c.message.split("\n")[0]}</span>
                  <span className="text-[#666]"> ({c.author})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[#1e1e2e]">
        {summary ? (
          <p className="text-sm text-[#999] leading-relaxed">{summary}</p>
        ) : (
          <button onClick={handleSummarize} disabled={summarizing} className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50">
            <Sparkles size={14} />
            {summarizing ? "Summarizing..." : "Summarize changes"}
          </button>
        )}
      </div>
    </div>
  );
}
